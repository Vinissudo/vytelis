DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_product_with_initial_entry';
  IF d IS NULL THEN RAISE EXCEPTION 'function not found'; END IF;
  d := replace(d, 'public.is_admin_or_manager(v_user)', 'public.can_manage_product_catalog(v_user)');
  EXECUTE d;
END $$;