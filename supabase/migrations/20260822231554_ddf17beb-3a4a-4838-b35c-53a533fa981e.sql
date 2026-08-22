-- ============ FASE 2: MOTOR CENTRAL DE ESTOQUE (schema) ============

-- 1. Enums
do $$ begin
  create type public.batch_status as enum ('ACTIVE','BLOCKED','EXPIRED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.movement_kind as enum ('ENTRY','TRANSFER','DISPENSE','RETURN','LOSS','ADJUSTMENT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.adjustment_direction as enum ('increase','decrease');
exception when duplicate_object then null; end $$;

-- 2. BATCHES (lote como entidade, dono da validade/status)
create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  code text,
  expiration_date date,
  manufacture_date date,
  supplier_id uuid references public.suppliers(id),
  unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0),
  status public.batch_status not null default 'ACTIVE',
  block_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create unique index if not exists batches_identity_uidx
  on public.batches (product_id, coalesce(code,''), coalesce(expiration_date,'9999-12-31'::date));
create index if not exists batches_product_idx on public.batches (product_id);
create index if not exists batches_expiration_idx on public.batches (expiration_date);
create index if not exists batches_hospital_idx on public.batches (hospital_id);

drop trigger if exists batches_set_updated_at on public.batches;
create trigger batches_set_updated_at before update on public.batches
  for each row execute function public.set_updated_at();

grant select on public.batches to authenticated;
grant all on public.batches to service_role;
alter table public.batches enable row level security;
drop policy if exists batches_select_scoped on public.batches;
create policy batches_select_scoped on public.batches for select to authenticated
  using (hospital_id = public.current_hospital_id());

-- 3. STOCK_BALANCES (fonte única e persistida do saldo)
create table if not exists public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  batch_id uuid not null references public.batches(id) on delete restrict,
  location_id uuid not null references public.stock_centers(id) on delete restrict,
  quantity_total numeric(14,3) not null default 0 check (quantity_total >= 0),
  quantity_reserved numeric(14,3) not null default 0 check (quantity_reserved >= 0),
  quantity_available numeric(14,3) generated always as (quantity_total - quantity_reserved) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_balances_reserved_le_total check (quantity_reserved <= quantity_total),
  constraint stock_balances_identity_key unique (product_id, batch_id, location_id)
);

create index if not exists stock_balances_product_idx on public.stock_balances (product_id);
create index if not exists stock_balances_batch_idx on public.stock_balances (batch_id);
create index if not exists stock_balances_location_idx on public.stock_balances (location_id);
create index if not exists stock_balances_hospital_loc_prod_idx
  on public.stock_balances (hospital_id, location_id, product_id);

drop trigger if exists stock_balances_set_updated_at on public.stock_balances;
create trigger stock_balances_set_updated_at before update on public.stock_balances
  for each row execute function public.set_updated_at();

-- somente leitura para o frontend: nenhuma tela pode alterar saldo
grant select on public.stock_balances to authenticated;
grant all on public.stock_balances to service_role;
alter table public.stock_balances enable row level security;
drop policy if exists stock_balances_select_scoped on public.stock_balances;
create policy stock_balances_select_scoped on public.stock_balances for select to authenticated
  using (hospital_id = public.current_hospital_id());

-- 4. STOCK_THRESHOLDS (mínimo/máximo por produto + localização)
create table if not exists public.stock_thresholds (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  location_id uuid not null references public.stock_centers(id) on delete cascade,
  min_quantity numeric(14,3) not null default 0 check (min_quantity >= 0),
  max_quantity numeric(14,3) check (max_quantity is null or max_quantity >= min_quantity),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint stock_thresholds_identity_key unique (product_id, location_id)
);
create index if not exists stock_thresholds_location_idx on public.stock_thresholds (location_id);

drop trigger if exists stock_thresholds_set_updated_at on public.stock_thresholds;
create trigger stock_thresholds_set_updated_at before update on public.stock_thresholds
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.stock_thresholds to authenticated;
grant all on public.stock_thresholds to service_role;
alter table public.stock_thresholds enable row level security;
drop policy if exists stock_thresholds_select_scoped on public.stock_thresholds;
create policy stock_thresholds_select_scoped on public.stock_thresholds for select to authenticated
  using (hospital_id = public.current_hospital_id());
drop policy if exists stock_thresholds_write_managers on public.stock_thresholds;
create policy stock_thresholds_write_managers on public.stock_thresholds for all to authenticated
  using (hospital_id = public.current_hospital_id() and public.is_admin_or_manager(auth.uid()))
  with check (hospital_id = public.current_hospital_id() and public.is_admin_or_manager(auth.uid()));

-- 5. MOVEMENTS: livro imutável, agora com lote e campos do motor central
drop view if exists public.v_stock_alerts;
drop view if exists public.v_stock_health;
drop view if exists public.v_product_stock;

alter table public.movements
  add column if not exists batch_id uuid references public.batches(id) on delete restrict,
  add column if not exists type public.movement_kind,
  add column if not exists adjustment_direction public.adjustment_direction,
  add column if not exists document_ref text,
  add column if not exists override_reason text,
  add column if not exists reference_type text,
  add column if not exists reference_id uuid;

alter table public.movements drop column if exists stock_item_id;
alter table public.movements alter column stock_center_id drop not null;

create index if not exists movements_batch_idx on public.movements (batch_id);
create index if not exists movements_type_kind_idx on public.movements (type);
create index if not exists movements_reference_idx on public.movements (reference_type, reference_id)
  where reference_type is not null;

-- receipt_items deixa de apontar para a tabela removida
alter table public.receipt_items drop column if exists stock_item_id;
alter table public.receipt_items add column if not exists batch_id uuid references public.batches(id);

-- 6. Remove a tabela de saldo antiga (paralela) — estava vazia
drop table if exists public.stock_items cascade;
