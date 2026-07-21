
-- 1. CHECK constraints
ALTER TABLE public.movements
  ADD CONSTRAINT movements_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT movements_unit_cost_nonneg CHECK (unit_cost IS NULL OR unit_cost >= 0);

ALTER TABLE public.stock_items
  ADD CONSTRAINT stock_items_quantity_nonneg CHECK (quantity >= 0),
  ADD CONSTRAINT stock_items_unit_cost_nonneg CHECK (unit_cost IS NULL OR unit_cost >= 0);

ALTER TABLE public.products
  ADD CONSTRAINT products_min_stock_nonneg CHECK (minimum_stock IS NULL OR minimum_stock >= 0),
  ADD CONSTRAINT products_max_stock_nonneg CHECK (maximum_stock IS NULL OR maximum_stock >= 0),
  ADD CONSTRAINT products_min_le_max CHECK (
    minimum_stock IS NULL OR maximum_stock IS NULL OR maximum_stock >= minimum_stock
  );

-- 2. Partial uniques (soft-delete aware)
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_hospital_id_barcode_key;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_hospital_id_internal_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique_active
  ON public.products (hospital_id, barcode)
  WHERE deleted_at IS NULL AND barcode IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_internal_code_unique_active
  ON public.products (hospital_id, internal_code)
  WHERE deleted_at IS NULL AND internal_code IS NOT NULL;

-- 3. Performance indexes
DROP INDEX IF EXISTS public.products_barcode_idx;
CREATE INDEX IF NOT EXISTS products_barcode_lookup_idx
  ON public.products (hospital_id, barcode)
  WHERE deleted_at IS NULL AND barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_hospital_active_idx
  ON public.products (hospital_id)
  WHERE deleted_at IS NULL AND active;

CREATE INDEX IF NOT EXISTS movements_stock_derivation_idx
  ON public.movements (hospital_id, product_id, stock_center_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS movements_stock_item_idx
  ON public.movements (stock_item_id)
  WHERE stock_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_items_active_idx
  ON public.stock_items (hospital_id, product_id, stock_center_id)
  WHERE deleted_at IS NULL;

-- 4. Derived stock view (source of truth = movements)
DROP VIEW IF EXISTS public.v_product_stock;
CREATE VIEW public.v_product_stock
WITH (security_invoker = true) AS
SELECT
  m.hospital_id,
  m.stock_center_id,
  m.product_id,
  m.batch,
  m.expiration_date,
  SUM(
    CASE
      WHEN m.movement_type IN ('initial_entry','purchase','return','transfer')
        THEN m.quantity
      WHEN m.movement_type IN ('simple_output','consumption')
        THEN -m.quantity
      WHEN m.movement_type = 'inventory_adjustment'
        THEN m.quantity  -- signed values allowed by convention; magnitude enforced positive elsewhere
      ELSE 0
    END
  )::numeric(14,3) AS quantity
FROM public.movements m
GROUP BY m.hospital_id, m.stock_center_id, m.product_id, m.batch, m.expiration_date;

GRANT SELECT ON public.v_product_stock TO authenticated;

-- 5. Hardened RPC
CREATE OR REPLACE FUNCTION public.create_product_with_initial_entry(
  p_product jsonb,
  p_entry   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_hospital uuid;
  v_default_center uuid;
  v_stock_center uuid;
  v_center_hospital uuid;
  v_product_id uuid;
  v_barcode text := nullif(trim(p_product->>'barcode'), '');
  v_internal text := nullif(trim(p_product->>'internal_code'), '');
  v_description text := nullif(trim(p_product->>'description'), '');
  v_batch text := nullif(trim(p_entry->>'batch'), '');
  v_expiration date := nullif(p_entry->>'expiration_date', '')::date;
  v_qty numeric(14,3);
  v_cost numeric(14,4);
  v_requires_batch boolean;
  v_requires_expiration boolean;
  v_stock_item_id uuid;
  v_dup_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT hospital_id, stock_center_id
    INTO v_hospital, v_default_center
    FROM public.profiles WHERE id = v_user;
  IF v_hospital IS NULL THEN RAISE EXCEPTION 'no_hospital'; END IF;

  IF NOT (public.has_role(v_user,'administrator') OR public.has_role(v_user,'manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_stock_center := coalesce(
    nullif(p_entry->>'stock_center_id','')::uuid,
    v_default_center
  );
  IF v_stock_center IS NULL THEN
    SELECT id INTO v_stock_center
      FROM public.stock_centers
      WHERE hospital_id = v_hospital AND active AND deleted_at IS NULL
      ORDER BY created_at LIMIT 1;
  END IF;
  IF v_stock_center IS NULL THEN RAISE EXCEPTION 'no_stock_center'; END IF;

  SELECT hospital_id INTO v_center_hospital
    FROM public.stock_centers
    WHERE id = v_stock_center AND deleted_at IS NULL AND active;
  IF v_center_hospital IS NULL THEN RAISE EXCEPTION 'invalid_stock_center'; END IF;
  IF v_center_hospital <> v_hospital THEN RAISE EXCEPTION 'stock_center_hospital_mismatch'; END IF;

  BEGIN
    v_qty := (p_entry->>'quantity')::numeric;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_quantity'; END;
  IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

  IF (p_entry ? 'unit_cost') AND nullif(p_entry->>'unit_cost','') IS NOT NULL THEN
    BEGIN
      v_cost := (p_entry->>'unit_cost')::numeric;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_cost'; END;
    IF v_cost < 0 THEN RAISE EXCEPTION 'invalid_cost'; END IF;
  END IF;

  IF (p_product ? 'id') AND nullif(p_product->>'id','') IS NOT NULL THEN
    v_product_id := (p_product->>'id')::uuid;
    SELECT requires_batch, requires_expiration_date
      INTO v_requires_batch, v_requires_expiration
      FROM public.products
      WHERE id = v_product_id AND hospital_id = v_hospital AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
  ELSE
    IF v_description IS NULL OR length(v_description) < 2 THEN RAISE EXCEPTION 'invalid_description'; END IF;

    IF v_barcode IS NOT NULL THEN
      SELECT id INTO v_dup_id FROM public.products
        WHERE hospital_id = v_hospital AND barcode = v_barcode AND deleted_at IS NULL;
      IF FOUND THEN RAISE EXCEPTION 'duplicate_barcode'; END IF;
    END IF;
    IF v_internal IS NOT NULL THEN
      SELECT id INTO v_dup_id FROM public.products
        WHERE hospital_id = v_hospital AND internal_code = v_internal AND deleted_at IS NULL;
      IF FOUND THEN RAISE EXCEPTION 'duplicate_internal_code'; END IF;
    END IF;

    v_requires_batch := coalesce((p_product->>'requires_batch')::boolean, true);
    v_requires_expiration := coalesce((p_product->>'requires_expiration_date')::boolean, true);

    INSERT INTO public.products(
      hospital_id, internal_code, barcode, description, short_description,
      manufacturer, unit, category_id, default_supplier_id,
      controlled_drug, requires_batch, requires_expiration_date,
      minimum_stock, maximum_stock, active, created_by, updated_by
    ) VALUES (
      v_hospital, v_internal, v_barcode,
      v_description,
      nullif(trim(p_product->>'short_description'),''),
      nullif(trim(p_product->>'manufacturer'),''),
      nullif(trim(p_product->>'unit'),''),
      nullif(p_product->>'category_id','')::uuid,
      nullif(p_product->>'default_supplier_id','')::uuid,
      coalesce((p_product->>'controlled_drug')::boolean,false),
      v_requires_batch,
      v_requires_expiration,
      nullif(p_product->>'minimum_stock','')::numeric,
      nullif(p_product->>'maximum_stock','')::numeric,
      coalesce((p_product->>'active')::boolean,true),
      v_user, v_user
    ) RETURNING id INTO v_product_id;
  END IF;

  IF v_requires_batch AND v_batch IS NULL THEN RAISE EXCEPTION 'batch_required'; END IF;
  IF v_requires_expiration AND v_expiration IS NULL THEN RAISE EXCEPTION 'expiration_required'; END IF;
  IF v_expiration IS NOT NULL AND v_expiration < current_date THEN RAISE EXCEPTION 'expiration_in_past'; END IF;

  INSERT INTO public.stock_items(
    hospital_id, stock_center_id, product_id, batch, expiration_date,
    quantity, unit_cost, created_by, updated_by
  ) VALUES (
    v_hospital, v_stock_center, v_product_id, v_batch, v_expiration,
    v_qty, v_cost, v_user, v_user
  )
  ON CONFLICT (stock_center_id, product_id, batch, expiration_date) DO UPDATE
    SET quantity   = public.stock_items.quantity + EXCLUDED.quantity,
        unit_cost  = COALESCE(EXCLUDED.unit_cost, public.stock_items.unit_cost),
        updated_by = v_user,
        updated_at = now()
  RETURNING id INTO v_stock_item_id;

  INSERT INTO public.movements(
    hospital_id, stock_center_id, user_id, product_id, stock_item_id,
    batch, expiration_date, movement_type, quantity, unit_cost,
    observation, occurred_at
  ) VALUES (
    v_hospital, v_stock_center, v_user, v_product_id, v_stock_item_id,
    v_batch, v_expiration, 'initial_entry', v_qty, v_cost,
    nullif(trim(p_entry->>'observation'),''), now()
  );

  INSERT INTO public.audit_log(hospital_id, user_id, entity, entity_id, action, after)
  VALUES (
    v_hospital, v_user, 'stock_items', v_stock_item_id, 'initial_entry',
    jsonb_build_object(
      'product_id', v_product_id,
      'stock_center_id', v_stock_center,
      'batch', v_batch,
      'expiration_date', v_expiration,
      'quantity', v_qty,
      'unit_cost', v_cost
    )
  );

  RETURN jsonb_build_object(
    'product_id', v_product_id,
    'stock_item_id', v_stock_item_id
  );
END;
$function$;
