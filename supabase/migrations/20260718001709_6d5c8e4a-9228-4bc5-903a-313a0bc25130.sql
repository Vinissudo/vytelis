
-- 1) Product fields
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS controlled_drug boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_batch boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_expiration_date boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS minimum_stock numeric(14,3),
  ADD COLUMN IF NOT EXISTS maximum_stock numeric(14,3);

-- 2) Transactional RPC: create/find product + initial stock + first movement
CREATE OR REPLACE FUNCTION public.create_product_with_initial_entry(
  p_product jsonb,
  p_entry jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_hospital uuid;
  v_stock_center uuid;
  v_product_id uuid;
  v_barcode text := nullif(trim(p_product->>'barcode'), '');
  v_internal text := nullif(trim(p_product->>'internal_code'), '');
  v_batch text := nullif(trim(p_entry->>'batch'), '');
  v_expiration date := nullif(p_entry->>'expiration_date', '')::date;
  v_qty numeric(14,3) := (p_entry->>'quantity')::numeric;
  v_cost numeric(14,4) := nullif(p_entry->>'unit_cost','')::numeric;
  v_stock_item_id uuid;
  v_existing_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT hospital_id, stock_center_id INTO v_hospital, v_stock_center
    FROM public.profiles WHERE id = v_user;
  IF v_hospital IS NULL THEN RAISE EXCEPTION 'no_hospital'; END IF;

  -- override stock center if provided
  IF (p_entry ? 'stock_center_id') AND nullif(p_entry->>'stock_center_id','') IS NOT NULL THEN
    v_stock_center := (p_entry->>'stock_center_id')::uuid;
  END IF;
  IF v_stock_center IS NULL THEN
    SELECT id INTO v_stock_center FROM public.stock_centers
      WHERE hospital_id = v_hospital AND active ORDER BY created_at LIMIT 1;
  END IF;
  IF v_stock_center IS NULL THEN RAISE EXCEPTION 'no_stock_center'; END IF;

  IF NOT (public.has_role(v_user,'administrator') OR public.has_role(v_user,'manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  IF v_cost IS NOT NULL AND v_cost < 0 THEN RAISE EXCEPTION 'invalid_cost'; END IF;

  -- product_id may be provided directly (existing product path)
  IF (p_product ? 'id') AND nullif(p_product->>'id','') IS NOT NULL THEN
    v_product_id := (p_product->>'id')::uuid;
    PERFORM 1 FROM public.products WHERE id = v_product_id AND hospital_id = v_hospital;
    IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
  ELSE
    -- dedupe by barcode
    IF v_barcode IS NOT NULL THEN
      SELECT id INTO v_existing_id FROM public.products
        WHERE hospital_id = v_hospital AND barcode = v_barcode AND deleted_at IS NULL;
      IF FOUND THEN RAISE EXCEPTION 'duplicate_barcode'; END IF;
    END IF;
    IF v_internal IS NOT NULL THEN
      SELECT id INTO v_existing_id FROM public.products
        WHERE hospital_id = v_hospital AND internal_code = v_internal AND deleted_at IS NULL;
      IF FOUND THEN RAISE EXCEPTION 'duplicate_internal_code'; END IF;
    END IF;

    INSERT INTO public.products(
      hospital_id, internal_code, barcode, description, short_description,
      manufacturer, unit, category_id, default_supplier_id,
      controlled_drug, requires_batch, requires_expiration_date,
      minimum_stock, maximum_stock, active, created_by, updated_by
    ) VALUES (
      v_hospital, v_internal, v_barcode,
      trim(p_product->>'description'),
      nullif(trim(p_product->>'short_description'),''),
      nullif(trim(p_product->>'manufacturer'),''),
      nullif(trim(p_product->>'unit'),''),
      nullif(p_product->>'category_id','')::uuid,
      nullif(p_product->>'default_supplier_id','')::uuid,
      coalesce((p_product->>'controlled_drug')::boolean,false),
      coalesce((p_product->>'requires_batch')::boolean,true),
      coalesce((p_product->>'requires_expiration_date')::boolean,true),
      nullif(p_product->>'minimum_stock','')::numeric,
      nullif(p_product->>'maximum_stock','')::numeric,
      coalesce((p_product->>'active')::boolean,true),
      v_user, v_user
    ) RETURNING id INTO v_product_id;
  END IF;

  -- upsert stock_items (product + batch + expiration + center)
  INSERT INTO public.stock_items(
    hospital_id, stock_center_id, product_id, batch, expiration_date,
    quantity, unit_cost, created_by, updated_by
  ) VALUES (
    v_hospital, v_stock_center, v_product_id, v_batch, v_expiration,
    v_qty, v_cost, v_user, v_user
  )
  ON CONFLICT (stock_center_id, product_id, batch, expiration_date) DO UPDATE
    SET quantity = public.stock_items.quantity + EXCLUDED.quantity,
        unit_cost = COALESCE(EXCLUDED.unit_cost, public.stock_items.unit_cost),
        updated_by = v_user
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

  RETURN jsonb_build_object(
    'product_id', v_product_id,
    'stock_item_id', v_stock_item_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_product_with_initial_entry(jsonb,jsonb) TO authenticated;

-- 3) Seed categories/suppliers for demo hospital (idempotent)
INSERT INTO public.categories (hospital_id, name)
SELECT '11111111-1111-1111-1111-111111111111'::uuid, name FROM (VALUES
  ('Medicamentos'),('Materiais Médicos'),('Materiais Hospitalares'),('Injetáveis')
) AS t(name)
ON CONFLICT (hospital_id, name) DO NOTHING;

INSERT INTO public.suppliers (hospital_id, name)
SELECT '11111111-1111-1111-1111-111111111111'::uuid, name FROM (VALUES
  ('IBG'),('MedCenter')
) AS t(name)
ON CONFLICT DO NOTHING;

-- 4) Grant administrator role to the sole existing profile so cadastro works out of the box
INSERT INTO public.user_roles (user_id, role, hospital_id)
SELECT p.id, 'administrator'::app_role, p.hospital_id
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
ON CONFLICT DO NOTHING;
