DROP POLICY IF EXISTS stock_thresholds_write_managers ON public.stock_thresholds;
CREATE POLICY stock_thresholds_write_managers ON public.stock_thresholds
  FOR ALL TO authenticated
  USING (hospital_id = public.current_hospital_id() AND public.can_manage_product_catalog(auth.uid()))
  WITH CHECK (hospital_id = public.current_hospital_id() AND public.can_manage_product_catalog(auth.uid()));