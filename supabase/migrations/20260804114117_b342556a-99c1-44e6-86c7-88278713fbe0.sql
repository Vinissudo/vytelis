-- ============ 1. PRODUCT MASTER ============
alter table public.products
  add column if not exists gtin text,
  add column if not exists purchase_unit text,
  add column if not exists consumption_unit text,
  add column if not exists package_quantity numeric(14,3) not null default 1,
  add column if not exists cold_chain boolean not null default false,
  add column if not exists allows_fractioning boolean not null default false;

update public.products set gtin = barcode where gtin is null and barcode is not null;
update public.products set consumption_unit = coalesce(consumption_unit, unit, 'UN') where consumption_unit is null;
update public.products set purchase_unit = coalesce(purchase_unit, unit, 'UN') where purchase_unit is null;

alter table public.products
  drop constraint if exists products_package_quantity_positive;
alter table public.products
  add constraint products_package_quantity_positive check (package_quantity > 0);

create unique index if not exists products_gtin_unique
  on public.products (hospital_id, gtin) where gtin is not null and deleted_at is null;

-- ============ 2. ADDITIONAL GTINS ============
create table if not exists public.product_gtins (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id),
  product_id uuid not null references public.products(id) on delete cascade,
  gtin text not null,
  packaging_level text not null default 'consumption',
  quantity_per_gtin numeric(14,3) not null default 1 check (quantity_per_gtin > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create unique index if not exists product_gtins_unique on public.product_gtins (hospital_id, gtin);

grant select, insert, update, delete on public.product_gtins to authenticated;
grant all on public.product_gtins to service_role;
alter table public.product_gtins enable row level security;

drop policy if exists product_gtins_select_scoped on public.product_gtins;
create policy product_gtins_select_scoped on public.product_gtins
  for select to authenticated using (hospital_id = public.current_hospital_id());
drop policy if exists product_gtins_manage on public.product_gtins;
create policy product_gtins_manage on public.product_gtins
  for all to authenticated
  using (hospital_id = public.current_hospital_id() and public.is_admin_or_manager(auth.uid()))
  with check (hospital_id = public.current_hospital_id() and public.is_admin_or_manager(auth.uid()));

drop trigger if exists product_gtins_set_updated_at on public.product_gtins;
create trigger product_gtins_set_updated_at before update on public.product_gtins
  for each row execute function public.set_updated_at();

-- ============ 3. LOT CONTROL ============
alter table public.stock_items
  add column if not exists reserved_quantity numeric(14,3) not null default 0,
  add column if not exists supplier_id uuid references public.suppliers(id),
  add column if not exists entry_date timestamptz not null default now(),
  add column if not exists manufacture_date date,
  add column if not exists block_reason text;

alter table public.stock_items drop constraint if exists stock_items_reserved_valid;
alter table public.stock_items
  add constraint stock_items_reserved_valid check (reserved_quantity >= 0 and reserved_quantity <= quantity);

alter table public.stock_items
  add column if not exists available_quantity numeric(14,3)
  generated always as (quantity - reserved_quantity) stored;

-- ============ 4. RECEIPTS ============
do $$ begin
  create type public.receipt_source as enum ('xml','gs1','manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.receipt_status as enum ('draft','completed','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id),
  stock_center_id uuid references public.stock_centers(id),
  supplier_id uuid references public.suppliers(id),
  source public.receipt_source not null default 'manual',
  status public.receipt_status not null default 'draft',
  nfe_key text,
  nfe_number text,
  nfe_series text,
  issue_date date,
  total_value numeric(14,4),
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index if not exists receipts_hospital_created_idx on public.receipts (hospital_id, created_at desc);
create unique index if not exists receipts_nfe_key_unique on public.receipts (hospital_id, nfe_key) where nfe_key is not null;

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  product_id uuid references public.products(id),
  stock_item_id uuid references public.stock_items(id),
  movement_id uuid references public.movements(id),
  gtin text,
  supplier_code text,
  description text not null,
  batch text,
  expiration_date date,
  manufacture_date date,
  purchase_unit text,
  purchase_quantity numeric(14,3) not null check (purchase_quantity > 0),
  package_quantity numeric(14,3) not null default 1 check (package_quantity > 0),
  consumption_quantity numeric(14,3) not null check (consumption_quantity > 0),
  unit_cost numeric(14,4),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists receipt_items_receipt_idx on public.receipt_items (receipt_id);

grant select, insert, update, delete on public.receipts to authenticated;
grant all on public.receipts to service_role;
grant select, insert, update, delete on public.receipt_items to authenticated;
grant all on public.receipt_items to service_role;

alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;

drop policy if exists receipts_select_scoped on public.receipts;
create policy receipts_select_scoped on public.receipts
  for select to authenticated using (hospital_id = public.current_hospital_id());
drop policy if exists receipts_manage on public.receipts;
create policy receipts_manage on public.receipts
  for all to authenticated
  using (hospital_id = public.current_hospital_id() and public.can_operate_stock(auth.uid()))
  with check (hospital_id = public.current_hospital_id() and public.can_operate_stock(auth.uid()));

drop policy if exists receipt_items_select_scoped on public.receipt_items;
create policy receipt_items_select_scoped on public.receipt_items
  for select to authenticated using (hospital_id = public.current_hospital_id());
drop policy if exists receipt_items_manage on public.receipt_items;
create policy receipt_items_manage on public.receipt_items
  for all to authenticated
  using (hospital_id = public.current_hospital_id() and public.can_operate_stock(auth.uid()))
  with check (hospital_id = public.current_hospital_id() and public.can_operate_stock(auth.uid()));

drop trigger if exists receipts_set_updated_at on public.receipts;
create trigger receipts_set_updated_at before update on public.receipts
  for each row execute function public.set_updated_at();
drop trigger if exists receipt_items_set_updated_at on public.receipt_items;
create trigger receipt_items_set_updated_at before update on public.receipt_items
  for each row execute function public.set_updated_at();

-- ============ 5. RECEIVING RPC ============
create or replace function public.receive_product_batch(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_hospital uuid;
  v_default_center uuid;
  v_center uuid;
  v_center_hospital uuid;
  v_product_id uuid := nullif(p->>'product_id','')::uuid;
  v_supplier uuid := nullif(p->>'supplier_id','')::uuid;
  v_receipt uuid := nullif(p->>'receipt_id','')::uuid;
  v_batch text := nullif(trim(p->>'batch'),'');
  v_exp date := nullif(p->>'expiration_date','')::date;
  v_fab date := nullif(p->>'manufacture_date','')::date;
  v_purchase_qty numeric(14,3);
  v_package numeric(14,3);
  v_qty numeric(14,3);
  v_cost numeric(14,4) := nullif(p->>'unit_cost','')::numeric;
  v_requires_batch boolean;
  v_requires_exp boolean;
  v_stock_item uuid;
  v_movement uuid;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if not public.can_operate_stock(v_user) then raise exception 'forbidden'; end if;

  select hospital_id, stock_center_id into v_hospital, v_default_center
    from public.profiles where id = v_user;
  if v_hospital is null then raise exception 'no_hospital'; end if;

  v_center := coalesce(nullif(p->>'stock_center_id','')::uuid, v_default_center);
  if v_center is null then raise exception 'stock_center_required'; end if;
  select hospital_id into v_center_hospital from public.stock_centers
    where id = v_center and active and deleted_at is null;
  if v_center_hospital is null or v_center_hospital <> v_hospital then
    raise exception 'invalid_stock_center';
  end if;

  if v_product_id is null then raise exception 'product_required'; end if;
  select requires_batch, requires_expiration_date, coalesce(package_quantity,1)
    into v_requires_batch, v_requires_exp, v_package
    from public.products
    where id = v_product_id and hospital_id = v_hospital and deleted_at is null;
  if not found then raise exception 'product_not_found'; end if;

  begin v_purchase_qty := (p->>'purchase_quantity')::numeric;
  exception when others then raise exception 'invalid_quantity'; end;
  if v_purchase_qty is null or v_purchase_qty <= 0 then raise exception 'invalid_quantity'; end if;

  if nullif(p->>'package_quantity','') is not null then
    v_package := (p->>'package_quantity')::numeric;
  end if;
  if v_package is null or v_package <= 0 then raise exception 'invalid_package_quantity'; end if;

  -- always store stock in the minimum consumption unit
  v_qty := v_purchase_qty * v_package;

  if v_requires_batch and v_batch is null then raise exception 'batch_required'; end if;
  if v_requires_exp and v_exp is null then raise exception 'expiration_required'; end if;
  if v_exp is not null and v_exp < current_date then raise exception 'expiration_in_past'; end if;

  insert into public.stock_items(
    hospital_id, stock_center_id, product_id, batch, expiration_date,
    quantity, unit_cost, supplier_id, manufacture_date, created_by, updated_by)
  values (v_hospital, v_center, v_product_id, v_batch, v_exp,
    v_qty, v_cost, v_supplier, v_fab, v_user, v_user)
  on conflict (stock_center_id, product_id, batch, expiration_date) do update
    set quantity = public.stock_items.quantity + excluded.quantity,
        unit_cost = coalesce(excluded.unit_cost, public.stock_items.unit_cost),
        supplier_id = coalesce(excluded.supplier_id, public.stock_items.supplier_id),
        manufacture_date = coalesce(excluded.manufacture_date, public.stock_items.manufacture_date),
        updated_by = v_user, updated_at = now()
  returning id into v_stock_item;

  insert into public.movements(
    hospital_id, stock_center_id, user_id, product_id, stock_item_id,
    batch, expiration_date, movement_type, quantity, unit_cost,
    movement_reason, observation, client_datetime, occurred_at)
  values (v_hospital, v_center, v_user, v_product_id, v_stock_item,
    v_batch, v_exp, 'purchase_entry', v_qty, v_cost,
    coalesce(nullif(trim(p->>'movement_reason'),''), 'Recebimento'),
    nullif(trim(p->>'observation'),''),
    nullif(p->>'client_datetime','')::timestamptz, now())
  returning id into v_movement;

  if v_cost is not null then
    update public.products
      set last_purchase_price = v_cost, last_purchase_at = now(),
          updated_by = v_user, updated_at = now()
      where id = v_product_id;
  end if;

  if v_receipt is not null then
    insert into public.receipt_items(
      hospital_id, receipt_id, product_id, stock_item_id, movement_id,
      gtin, supplier_code, description, batch, expiration_date, manufacture_date,
      purchase_unit, purchase_quantity, package_quantity, consumption_quantity,
      unit_cost, status)
    values (v_hospital, v_receipt, v_product_id, v_stock_item, v_movement,
      nullif(trim(p->>'gtin'),''), nullif(trim(p->>'supplier_code'),''),
      coalesce(nullif(trim(p->>'description'),''),'Item'),
      v_batch, v_exp, v_fab,
      nullif(trim(p->>'purchase_unit'),''), v_purchase_qty, v_package, v_qty,
      v_cost, 'received');
  end if;

  insert into public.audit_log(hospital_id, user_id, entity, entity_id, action, after)
  values (v_hospital, v_user, 'receipt', v_stock_item, 'receive',
    jsonb_build_object(
      'product_id', v_product_id, 'stock_center_id', v_center,
      'supplier_id', v_supplier, 'batch', v_batch, 'expiration_date', v_exp,
      'manufacture_date', v_fab, 'purchase_quantity', v_purchase_qty,
      'package_quantity', v_package, 'consumption_quantity', v_qty,
      'unit_cost', v_cost, 'receipt_id', v_receipt, 'movement_id', v_movement,
      'source', nullif(p->>'source','')));

  return jsonb_build_object(
    'product_id', v_product_id,
    'stock_item_id', v_stock_item,
    'movement_id', v_movement,
    'consumption_quantity', v_qty);
end;
$function$;

revoke all on function public.receive_product_batch(jsonb) from public;
grant execute on function public.receive_product_batch(jsonb) to authenticated;