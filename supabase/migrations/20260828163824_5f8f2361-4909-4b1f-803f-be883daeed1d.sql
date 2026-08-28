create or replace function public.can_manage_product_catalog(_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin_or_manager(_user_id)
      or public.has_role(_user_id, 'warehouse')
      or public.has_role(_user_id, 'pharmacy');
$$;
revoke all on function public.can_manage_product_catalog(uuid) from public, anon;
grant execute on function public.can_manage_product_catalog(uuid) to authenticated;

drop policy if exists products_manage on public.products;
create policy products_manage on public.products for all to authenticated
  using (hospital_id = current_hospital_id() and public.can_manage_product_catalog(auth.uid()))
  with check (hospital_id = current_hospital_id() and public.can_manage_product_catalog(auth.uid()));

drop policy if exists product_gtins_manage on public.product_gtins;
create policy product_gtins_manage on public.product_gtins for all to authenticated
  using (hospital_id = current_hospital_id() and public.can_manage_product_catalog(auth.uid()))
  with check (hospital_id = current_hospital_id() and public.can_manage_product_catalog(auth.uid()));

drop policy if exists categories_manage on public.categories;
create policy categories_manage on public.categories for all to authenticated
  using (hospital_id = current_hospital_id() and public.can_manage_product_catalog(auth.uid()))
  with check (hospital_id = current_hospital_id() and public.can_manage_product_catalog(auth.uid()));

drop policy if exists suppliers_manage on public.suppliers;
create policy suppliers_manage on public.suppliers for all to authenticated
  using (hospital_id = current_hospital_id() and public.can_manage_product_catalog(auth.uid()))
  with check (hospital_id = current_hospital_id() and public.can_manage_product_catalog(auth.uid()));

create table if not exists public.product_code_sequences (
  hospital_id uuid primary key references public.hospitals(id),
  last_value bigint not null default 0
);
grant all on public.product_code_sequences to service_role;
alter table public.product_code_sequences enable row level security;

create or replace function public.generate_product_internal_code(p_hospital_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_next bigint;
begin
  insert into public.product_code_sequences(hospital_id, last_value)
  values (p_hospital_id, 1)
  on conflict (hospital_id) do update
    set last_value = public.product_code_sequences.last_value + 1
  returning last_value into v_next;
  return 'VYT-' || lpad(v_next::text, 6, '0');
end $$;
revoke all on function public.generate_product_internal_code(uuid) from public, anon;
grant execute on function public.generate_product_internal_code(uuid) to authenticated;

create or replace function public.create_product(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_hospital uuid;
  v_description text := nullif(trim(p->>'description'), '');
  v_consumption text := nullif(trim(p->>'consumption_unit'), '');
  v_pkg numeric;
  v_code text;
  v_id uuid;
  v_dup uuid;
  v_gtin text := nullif(trim(p->>'gtin'), '');
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select hospital_id into v_hospital from public.profiles where id = v_user;
  if v_hospital is null then raise exception 'no_hospital'; end if;
  if not public.can_manage_product_catalog(v_user) then raise exception 'forbidden'; end if;

  if v_description is null or length(v_description) < 2 then
    raise exception 'invalid_description';
  end if;
  if v_consumption is null then raise exception 'invalid_consumption_unit'; end if;

  begin v_pkg := coalesce((p->>'package_quantity')::numeric, 0);
  exception when others then raise exception 'invalid_package_quantity'; end;
  if v_pkg <= 0 then raise exception 'invalid_package_quantity'; end if;

  if v_gtin is not null then
    select id into v_dup from public.products
      where hospital_id = v_hospital and (gtin = v_gtin or barcode = v_gtin) and deleted_at is null;
    if v_dup is not null then raise exception 'duplicate_gtin'; end if;
    select product_id into v_dup from public.product_gtins
      where hospital_id = v_hospital and gtin = v_gtin;
    if v_dup is not null then raise exception 'duplicate_gtin'; end if;
  end if;

  v_code := public.generate_product_internal_code(v_hospital);

  insert into public.products(
    hospital_id, internal_code, gtin, barcode, description, short_description,
    manufacturer, unit, purchase_unit, consumption_unit, package_quantity,
    category_id, default_supplier_id, controlled_drug, requires_batch,
    requires_expiration_date, cold_chain, allows_fractioning,
    active, created_by, updated_by
  ) values (
    v_hospital, v_code, v_gtin, v_gtin, v_description,
    nullif(trim(p->>'short_description'),''),
    nullif(trim(p->>'manufacturer'),''),
    v_consumption,
    nullif(trim(p->>'purchase_unit'),''),
    v_consumption,
    v_pkg,
    nullif(p->>'category_id','')::uuid,
    nullif(p->>'default_supplier_id','')::uuid,
    coalesce((p->>'controlled_drug')::boolean, false),
    coalesce((p->>'requires_batch')::boolean, true),
    coalesce((p->>'requires_expiration_date')::boolean, true),
    coalesce((p->>'cold_chain')::boolean, false),
    coalesce((p->>'allows_fractioning')::boolean, false),
    true, v_user, v_user
  ) returning id into v_id;

  if v_gtin is not null then
    insert into public.product_gtins(hospital_id, product_id, gtin, packaging_level, quantity_per_gtin, created_by, updated_by)
    values (v_hospital, v_id, v_gtin,
            coalesce(nullif(trim(p->>'gtin_packaging_level'),''), 'each'),
            coalesce(nullif(p->>'gtin_quantity','')::numeric, 1), v_user, v_user)
    on conflict do nothing;
  end if;

  insert into public.audit_log(hospital_id, user_id, entity, entity_id, action, after)
  values (v_hospital, v_user, 'products', v_id, 'create', p);

  return jsonb_build_object('id', v_id, 'internal_code', v_code);
end $$;
revoke all on function public.create_product(jsonb) from public, anon;
grant execute on function public.create_product(jsonb) to authenticated;