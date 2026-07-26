
-- 1. Enum extensions
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'purchase_entry';
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'positive_adjustment';
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'negative_adjustment';
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'loss';
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'expired';

-- 2. Column additions
ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS movement_reason text,
  ADD COLUMN IF NOT EXISTS stock_center_dest_id uuid REFERENCES public.stock_centers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS client_datetime timestamptz,
  ADD COLUMN IF NOT EXISTS transfer_group_id uuid;

CREATE INDEX IF NOT EXISTS movements_transfer_group_idx ON public.movements(transfer_group_id) WHERE transfer_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS movements_hospital_center_time_idx ON public.movements(hospital_id, stock_center_id, occurred_at DESC);

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS minimum_order_value numeric(14,2),
  ADD COLUMN IF NOT EXISTS free_shipping_threshold numeric(14,2),
  ADD COLUMN IF NOT EXISTS avg_delivery_days integer,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS rating numeric(3,2),
  ADD COLUMN IF NOT EXISTS delivery_reliability numeric(5,2);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS average_daily_consumption numeric(14,3),
  ADD COLUMN IF NOT EXISTS lead_time_days integer,
  ADD COLUMN IF NOT EXISTS last_purchase_price numeric(14,4),
  ADD COLUMN IF NOT EXISTS last_purchase_at timestamptz;

CREATE INDEX IF NOT EXISTS stock_items_product_exp_idx ON public.stock_items(product_id, expiration_date) WHERE deleted_at IS NULL;

-- 3. Transactional movement registration
CREATE OR REPLACE FUNCTION public.register_movement(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_hospital uuid;
  v_type movement_type;
  v_product_id uuid := nullif(p->>'product_id','')::uuid;
  v_center_id uuid := nullif(p->>'stock_center_id','')::uuid;
  v_dest_id uuid := nullif(p->>'stock_center_dest_id','')::uuid;
  v_batch text := nullif(trim(p->>'batch'),'');
  v_exp date := nullif(p->>'expiration_date','')::date;
  v_qty numeric(14,3);
  v_cost numeric(14,4) := nullif(p->>'unit_cost','')::numeric;
  v_reason text := nullif(trim(p->>'movement_reason'),'');
  v_obs text := nullif(trim(p->>'observation'),'');
  v_client_ts timestamptz := nullif(p->>'client_datetime','')::timestamptz;
  v_requires_batch boolean;
  v_requires_exp boolean;
  v_center_hospital uuid;
  v_dest_hospital uuid;
  v_stock_item uuid;
  v_current numeric(14,3);
  v_movement_id uuid;
  v_transfer_group uuid;
  v_is_inbound boolean;
  v_is_outbound boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.can_operate_stock(v_user) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT hospital_id INTO v_hospital FROM public.profiles WHERE id = v_user;
  IF v_hospital IS NULL THEN RAISE EXCEPTION 'no_hospital'; END IF;

  BEGIN v_type := (p->>'movement_type')::movement_type;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_movement_type'; END;

  IF v_product_id IS NULL THEN RAISE EXCEPTION 'product_required'; END IF;
  IF v_center_id IS NULL THEN RAISE EXCEPTION 'stock_center_required'; END IF;

  BEGIN v_qty := (p->>'quantity')::numeric;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_quantity'; END;
  IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

  SELECT requires_batch, requires_expiration_date
    INTO v_requires_batch, v_requires_exp
    FROM public.products
    WHERE id = v_product_id AND hospital_id = v_hospital AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;

  SELECT hospital_id INTO v_center_hospital
    FROM public.stock_centers WHERE id = v_center_id AND deleted_at IS NULL AND active;
  IF v_center_hospital IS NULL OR v_center_hospital <> v_hospital THEN
    RAISE EXCEPTION 'invalid_stock_center';
  END IF;

  IF v_type = 'transfer' THEN
    IF v_dest_id IS NULL OR v_dest_id = v_center_id THEN RAISE EXCEPTION 'invalid_transfer_destination'; END IF;
    SELECT hospital_id INTO v_dest_hospital
      FROM public.stock_centers WHERE id = v_dest_id AND deleted_at IS NULL AND active;
    IF v_dest_hospital IS NULL OR v_dest_hospital <> v_hospital THEN
      RAISE EXCEPTION 'invalid_transfer_destination';
    END IF;
  END IF;

  v_is_inbound := v_type IN ('initial_entry','purchase_entry','purchase','return','positive_adjustment');
  v_is_outbound := v_type IN ('simple_output','consumption','loss','expired','negative_adjustment');

  IF v_requires_batch AND v_batch IS NULL THEN RAISE EXCEPTION 'batch_required'; END IF;
  IF v_requires_exp AND v_exp IS NULL THEN RAISE EXCEPTION 'expiration_required'; END IF;
  IF v_is_inbound AND v_exp IS NOT NULL AND v_exp < current_date AND v_type <> 'initial_entry' THEN
    RAISE EXCEPTION 'expiration_in_past';
  END IF;

  -- OUTBOUND leg (also source-side of transfer)
  IF v_is_outbound OR v_type = 'transfer' THEN
    SELECT id, quantity INTO v_stock_item, v_current
      FROM public.stock_items
      WHERE stock_center_id = v_center_id
        AND product_id = v_product_id
        AND batch IS NOT DISTINCT FROM v_batch
        AND expiration_date IS NOT DISTINCT FROM v_exp
        AND deleted_at IS NULL
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'stock_not_found'; END IF;
    IF v_current < v_qty THEN RAISE EXCEPTION 'insufficient_stock'; END IF;

    UPDATE public.stock_items
      SET quantity = quantity - v_qty, updated_by = v_user, updated_at = now()
      WHERE id = v_stock_item;
  END IF;

  IF v_type = 'transfer' THEN
    v_transfer_group := gen_random_uuid();

    INSERT INTO public.movements(hospital_id, stock_center_id, stock_center_dest_id, user_id,
      product_id, stock_item_id, batch, expiration_date, movement_type, quantity, unit_cost,
      movement_reason, observation, client_datetime, transfer_group_id, occurred_at)
    VALUES (v_hospital, v_center_id, v_dest_id, v_user, v_product_id, v_stock_item, v_batch, v_exp,
      'transfer', v_qty, v_cost, v_reason, v_obs, v_client_ts, v_transfer_group, now())
    RETURNING id INTO v_movement_id;

    -- Destination upsert
    INSERT INTO public.stock_items(hospital_id, stock_center_id, product_id, batch, expiration_date,
      quantity, unit_cost, created_by, updated_by)
    VALUES (v_hospital, v_dest_id, v_product_id, v_batch, v_exp, v_qty, v_cost, v_user, v_user)
    ON CONFLICT (stock_center_id, product_id, batch, expiration_date) DO UPDATE
      SET quantity = public.stock_items.quantity + EXCLUDED.quantity,
          unit_cost = COALESCE(EXCLUDED.unit_cost, public.stock_items.unit_cost),
          updated_by = v_user, updated_at = now()
    RETURNING id INTO v_stock_item;

  ELSIF v_is_inbound THEN
    INSERT INTO public.stock_items(hospital_id, stock_center_id, product_id, batch, expiration_date,
      quantity, unit_cost, created_by, updated_by)
    VALUES (v_hospital, v_center_id, v_product_id, v_batch, v_exp, v_qty, v_cost, v_user, v_user)
    ON CONFLICT (stock_center_id, product_id, batch, expiration_date) DO UPDATE
      SET quantity = public.stock_items.quantity + EXCLUDED.quantity,
          unit_cost = COALESCE(EXCLUDED.unit_cost, public.stock_items.unit_cost),
          updated_by = v_user, updated_at = now()
    RETURNING id INTO v_stock_item;

    INSERT INTO public.movements(hospital_id, stock_center_id, user_id, product_id, stock_item_id,
      batch, expiration_date, movement_type, quantity, unit_cost,
      movement_reason, observation, client_datetime, occurred_at)
    VALUES (v_hospital, v_center_id, v_user, v_product_id, v_stock_item, v_batch, v_exp,
      v_type, v_qty, v_cost, v_reason, v_obs, v_client_ts, now())
    RETURNING id INTO v_movement_id;

    IF v_type IN ('purchase_entry','purchase') AND v_cost IS NOT NULL THEN
      UPDATE public.products
        SET last_purchase_price = v_cost, last_purchase_at = now(), updated_by = v_user, updated_at = now()
        WHERE id = v_product_id;
    END IF;

  ELSIF v_is_outbound THEN
    INSERT INTO public.movements(hospital_id, stock_center_id, user_id, product_id, stock_item_id,
      batch, expiration_date, movement_type, quantity, unit_cost,
      movement_reason, observation, client_datetime, occurred_at)
    VALUES (v_hospital, v_center_id, v_user, v_product_id, v_stock_item, v_batch, v_exp,
      v_type, v_qty, v_cost, v_reason, v_obs, v_client_ts, now())
    RETURNING id INTO v_movement_id;
  ELSE
    RAISE EXCEPTION 'invalid_movement_type';
  END IF;

  INSERT INTO public.audit_log(hospital_id, user_id, entity, entity_id, action, after)
  VALUES (v_hospital, v_user, 'movements', v_movement_id, v_type::text,
    jsonb_build_object(
      'product_id', v_product_id, 'stock_center_id', v_center_id,
      'stock_center_dest_id', v_dest_id, 'batch', v_batch,
      'expiration_date', v_exp, 'quantity', v_qty, 'unit_cost', v_cost,
      'reason', v_reason, 'transfer_group_id', v_transfer_group));

  RETURN jsonb_build_object('movement_id', v_movement_id, 'stock_item_id', v_stock_item,
    'transfer_group_id', v_transfer_group);
END;
$$;

REVOKE ALL ON FUNCTION public.register_movement(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_movement(jsonb) TO authenticated;

-- 4. Health + alerts views
CREATE OR REPLACE VIEW public.v_stock_health AS
WITH totals AS (
  SELECT si.hospital_id, si.product_id, si.stock_center_id,
         SUM(si.quantity) AS current_stock,
         SUM(si.quantity * COALESCE(si.unit_cost,0)) AS stock_value,
         MAX(si.updated_at) AS last_stock_update
  FROM public.stock_items si
  WHERE si.deleted_at IS NULL
  GROUP BY si.hospital_id, si.product_id, si.stock_center_id
),
last_mv AS (
  SELECT hospital_id, product_id, stock_center_id, MAX(occurred_at) AS last_movement_at
  FROM public.movements
  GROUP BY hospital_id, product_id, stock_center_id
)
SELECT t.hospital_id, t.product_id, t.stock_center_id,
       p.description, p.minimum_stock, p.maximum_stock,
       p.average_daily_consumption, p.lead_time_days,
       t.current_stock, t.stock_value, t.last_stock_update,
       lm.last_movement_at,
       CASE WHEN COALESCE(p.average_daily_consumption,0) > 0
            THEN t.current_stock / p.average_daily_consumption
            ELSE NULL END AS coverage_days
FROM totals t
JOIN public.products p ON p.id = t.product_id AND p.deleted_at IS NULL
LEFT JOIN last_mv lm
  ON lm.hospital_id = t.hospital_id
 AND lm.product_id = t.product_id
 AND lm.stock_center_id = t.stock_center_id;

ALTER VIEW public.v_stock_health SET (security_invoker = true);
GRANT SELECT ON public.v_stock_health TO authenticated;

CREATE OR REPLACE VIEW public.v_stock_alerts AS
-- Low / critical / out
SELECT h.hospital_id, h.product_id, h.stock_center_id, h.description,
       CASE
         WHEN h.current_stock <= 0 THEN 'out_of_stock'
         WHEN h.minimum_stock IS NOT NULL AND h.current_stock < (h.minimum_stock * 0.5) THEN 'critical_stock'
         WHEN h.minimum_stock IS NOT NULL AND h.current_stock < h.minimum_stock THEN 'low_stock'
       END AS alert_kind,
       h.current_stock AS metric, NULL::date AS ref_date
FROM public.v_stock_health h
WHERE h.current_stock <= 0
   OR (h.minimum_stock IS NOT NULL AND h.current_stock < h.minimum_stock)

UNION ALL
-- Expiration windows and expired
SELECT si.hospital_id, si.product_id, si.stock_center_id, p.description,
       CASE
         WHEN si.expiration_date < current_date THEN 'expired'
         WHEN si.expiration_date <= current_date + 7  THEN 'expiring_7'
         WHEN si.expiration_date <= current_date + 30 THEN 'expiring_30'
         WHEN si.expiration_date <= current_date + 60 THEN 'expiring_60'
         WHEN si.expiration_date <= current_date + 90 THEN 'expiring_90'
       END,
       si.quantity, si.expiration_date
FROM public.stock_items si
JOIN public.products p ON p.id = si.product_id AND p.deleted_at IS NULL
WHERE si.deleted_at IS NULL AND si.quantity > 0
  AND si.expiration_date IS NOT NULL
  AND si.expiration_date <= current_date + 90

UNION ALL
-- No movement for N days (from v_stock_health)
SELECT h.hospital_id, h.product_id, h.stock_center_id, h.description,
       CASE
         WHEN h.last_movement_at IS NULL OR h.last_movement_at < now() - interval '365 days' THEN 'no_movement_365'
         WHEN h.last_movement_at < now() - interval '180 days' THEN 'no_movement_180'
         WHEN h.last_movement_at < now() - interval '90 days'  THEN 'no_movement_90'
         WHEN h.last_movement_at < now() - interval '60 days'  THEN 'no_movement_60'
         WHEN h.last_movement_at < now() - interval '30 days'  THEN 'no_movement_30'
       END,
       h.current_stock, h.last_movement_at::date
FROM public.v_stock_health h
WHERE h.current_stock > 0
  AND (h.last_movement_at IS NULL OR h.last_movement_at < now() - interval '30 days');

ALTER VIEW public.v_stock_alerts SET (security_invoker = true);
GRANT SELECT ON public.v_stock_alerts TO authenticated;
