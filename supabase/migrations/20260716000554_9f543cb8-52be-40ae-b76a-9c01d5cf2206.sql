
-- =========================================================
-- Extensions
-- =========================================================
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- =========================================================
-- Enums
-- =========================================================
create type public.app_role as enum (
  'administrator','warehouse','pharmacy','audit','manager','read_only'
);

create type public.stock_center_type as enum (
  'central_warehouse','clinical_pharmacy','surgical_pharmacy','emergency_pharmacy','icu_pharmacy','other'
);

create type public.movement_type as enum (
  'initial_entry','simple_output','inventory_adjustment','transfer','purchase','return','consumption'
);

create type public.stock_status as enum (
  'healthy','warning','near_expiration','critical','no_movement'
);

-- =========================================================
-- Utility: updated_at trigger
-- =========================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- hospitals
-- =========================================================
create table public.hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

grant select, insert, update, delete on public.hospitals to authenticated;
grant all on public.hospitals to service_role;
alter table public.hospitals enable row level security;

create trigger hospitals_set_updated_at
  before update on public.hospitals
  for each row execute function public.set_updated_at();

-- =========================================================
-- stock_centers
-- =========================================================
create table public.stock_centers (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete restrict,
  name text not null,
  type public.stock_center_type not null default 'other',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  unique (hospital_id, name)
);

grant select, insert, update, delete on public.stock_centers to authenticated;
grant all on public.stock_centers to service_role;
alter table public.stock_centers enable row level security;

create index stock_centers_hospital_idx on public.stock_centers(hospital_id);

create trigger stock_centers_set_updated_at
  before update on public.stock_centers
  for each row execute function public.set_updated_at();

-- =========================================================
-- profiles
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  hospital_id uuid references public.hospitals(id) on delete set null,
  stock_center_id uuid references public.stock_centers(id) on delete set null,
  full_name text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =========================================================
-- user_roles
-- =========================================================
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  hospital_id uuid references public.hospitals(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role, hospital_id)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create index user_roles_user_idx on public.user_roles(user_id);

-- =========================================================
-- Security definer helpers (avoid RLS recursion)
-- =========================================================
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.current_hospital_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select hospital_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin_or_manager(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_user_id, 'administrator') or public.has_role(_user_id, 'manager');
$$;

create or replace function public.can_operate_stock(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role(_user_id, 'administrator')
    or public.has_role(_user_id, 'manager')
    or public.has_role(_user_id, 'warehouse')
    or public.has_role(_user_id, 'pharmacy');
$$;

-- =========================================================
-- categories
-- =========================================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name text not null,
  parent_id uuid references public.categories(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  unique (hospital_id, name)
);

grant select, insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;

create index categories_hospital_idx on public.categories(hospital_id);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- =========================================================
-- suppliers
-- =========================================================
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name text not null,
  cnpj text,
  contact_name text,
  contact_email text,
  contact_phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

grant select, insert, update, delete on public.suppliers to authenticated;
grant all on public.suppliers to service_role;
alter table public.suppliers enable row level security;

create index suppliers_hospital_idx on public.suppliers(hospital_id);
create index suppliers_name_trgm on public.suppliers using gin (name gin_trgm_ops);

create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

-- =========================================================
-- products (master data only — NO quantity)
-- =========================================================
create table public.products (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  internal_code text,
  barcode text,
  description text not null,
  manufacturer text,
  unit text,
  category_id uuid references public.categories(id) on delete set null,
  default_supplier_id uuid references public.suppliers(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  unique (hospital_id, internal_code),
  unique (hospital_id, barcode)
);

grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;

create index products_hospital_idx on public.products(hospital_id);
create index products_barcode_idx on public.products(barcode);
create index products_internal_code_idx on public.products(internal_code);
create index products_description_trgm on public.products using gin (description gin_trgm_ops);
create index products_manufacturer_trgm on public.products using gin (manufacturer gin_trgm_ops);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- =========================================================
-- stock_items (real stock; quantity derived from movements)
-- =========================================================
create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  stock_center_id uuid not null references public.stock_centers(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  batch text,
  expiration_date date,
  quantity numeric(14,3) not null default 0,
  unit_cost numeric(14,4),
  status public.stock_status not null default 'healthy',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  unique (stock_center_id, product_id, batch, expiration_date)
);

grant select, insert, update, delete on public.stock_items to authenticated;
grant all on public.stock_items to service_role;
alter table public.stock_items enable row level security;

create index stock_items_hospital_idx on public.stock_items(hospital_id);
create index stock_items_center_idx on public.stock_items(stock_center_id);
create index stock_items_product_idx on public.stock_items(product_id);
create index stock_items_batch_idx on public.stock_items(batch);
create index stock_items_expiration_idx on public.stock_items(expiration_date);

create trigger stock_items_set_updated_at
  before update on public.stock_items
  for each row execute function public.set_updated_at();

-- =========================================================
-- movements (append-only audit trail of every stock change)
-- =========================================================
create table public.movements (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  stock_center_id uuid not null references public.stock_centers(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  stock_item_id uuid references public.stock_items(id) on delete set null,
  batch text,
  expiration_date date,
  movement_type public.movement_type not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,4),
  observation text,
  ip_address inet,
  device text,
  browser text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

grant select, insert on public.movements to authenticated;
grant all on public.movements to service_role;
alter table public.movements enable row level security;

create index movements_hospital_idx on public.movements(hospital_id);
create index movements_center_idx on public.movements(stock_center_id);
create index movements_product_idx on public.movements(product_id);
create index movements_type_idx on public.movements(movement_type);
create index movements_occurred_at_idx on public.movements(occurred_at desc);

-- =========================================================
-- audit_log (generic entity audit)
-- =========================================================
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid,
  user_id uuid,
  entity text not null,
  entity_id uuid,
  action text not null,
  before jsonb,
  after jsonb,
  occurred_at timestamptz not null default now()
);

grant select, insert on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;

create index audit_log_hospital_idx on public.audit_log(hospital_id);
create index audit_log_entity_idx on public.audit_log(entity, entity_id);
create index audit_log_occurred_idx on public.audit_log(occurred_at desc);

-- =========================================================
-- RLS Policies
-- =========================================================

-- hospitals: users see only their own hospital; only administrators manage
create policy "hospitals_select_own" on public.hospitals
  for select to authenticated
  using (id = public.current_hospital_id());

create policy "hospitals_admin_manage" on public.hospitals
  for all to authenticated
  using (public.has_role(auth.uid(), 'administrator'))
  with check (public.has_role(auth.uid(), 'administrator'));

-- stock_centers
create policy "stock_centers_select_scoped" on public.stock_centers
  for select to authenticated
  using (hospital_id = public.current_hospital_id());

create policy "stock_centers_admin_manage" on public.stock_centers
  for all to authenticated
  using (
    hospital_id = public.current_hospital_id()
    and public.is_admin_or_manager(auth.uid())
  )
  with check (
    hospital_id = public.current_hospital_id()
    and public.is_admin_or_manager(auth.uid())
  );

-- profiles: user reads own; administrators read hospital-wide
create policy "profiles_select_self" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "profiles_select_admin" on public.profiles
  for select to authenticated
  using (
    hospital_id = public.current_hospital_id()
    and public.has_role(auth.uid(), 'administrator')
  );

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_admin_manage" on public.profiles
  for all to authenticated
  using (public.has_role(auth.uid(), 'administrator'))
  with check (public.has_role(auth.uid(), 'administrator'));

-- user_roles: read own; administrators manage
create policy "user_roles_select_self" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid());

create policy "user_roles_admin_manage" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'administrator'))
  with check (public.has_role(auth.uid(), 'administrator'));

-- categories
create policy "categories_select_scoped" on public.categories
  for select to authenticated
  using (hospital_id = public.current_hospital_id());

create policy "categories_manage" on public.categories
  for all to authenticated
  using (
    hospital_id = public.current_hospital_id()
    and public.is_admin_or_manager(auth.uid())
  )
  with check (
    hospital_id = public.current_hospital_id()
    and public.is_admin_or_manager(auth.uid())
  );

-- suppliers
create policy "suppliers_select_scoped" on public.suppliers
  for select to authenticated
  using (hospital_id = public.current_hospital_id());

create policy "suppliers_manage" on public.suppliers
  for all to authenticated
  using (
    hospital_id = public.current_hospital_id()
    and public.is_admin_or_manager(auth.uid())
  )
  with check (
    hospital_id = public.current_hospital_id()
    and public.is_admin_or_manager(auth.uid())
  );

-- products
create policy "products_select_scoped" on public.products
  for select to authenticated
  using (hospital_id = public.current_hospital_id());

create policy "products_manage" on public.products
  for all to authenticated
  using (
    hospital_id = public.current_hospital_id()
    and public.is_admin_or_manager(auth.uid())
  )
  with check (
    hospital_id = public.current_hospital_id()
    and public.is_admin_or_manager(auth.uid())
  );

-- stock_items: readable by all in hospital, never directly writable
create policy "stock_items_select_scoped" on public.stock_items
  for select to authenticated
  using (hospital_id = public.current_hospital_id());

-- writes only through service_role (server-side, via movements engine in Parte 2).
-- No INSERT/UPDATE/DELETE policies for authenticated => denied by default.

-- movements: readable by all in hospital; operators can insert
create policy "movements_select_scoped" on public.movements
  for select to authenticated
  using (hospital_id = public.current_hospital_id());

create policy "movements_insert_operators" on public.movements
  for insert to authenticated
  with check (
    hospital_id = public.current_hospital_id()
    and public.can_operate_stock(auth.uid())
    and user_id = auth.uid()
  );

-- audit_log: readable by administrators and auditors in the hospital
create policy "audit_log_select_admin_audit" on public.audit_log
  for select to authenticated
  using (
    hospital_id = public.current_hospital_id()
    and (
      public.has_role(auth.uid(), 'administrator')
      or public.has_role(auth.uid(), 'audit')
    )
  );

-- =========================================================
-- handle_new_user: create profile automatically
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_hospital uuid;
begin
  select id into demo_hospital from public.hospitals order by created_at asc limit 1;

  insert into public.profiles (id, hospital_id, full_name, email)
  values (
    new.id,
    demo_hospital,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- Seed: demo hospital + stock centers
-- =========================================================
insert into public.hospitals (id, name, active)
values ('11111111-1111-1111-1111-111111111111', 'Hospital Demo', true)
on conflict do nothing;

insert into public.stock_centers (hospital_id, name, type)
values
  ('11111111-1111-1111-1111-111111111111', 'Almoxarifado Central', 'central_warehouse'),
  ('11111111-1111-1111-1111-111111111111', 'Farmácia Clínica', 'clinical_pharmacy'),
  ('11111111-1111-1111-1111-111111111111', 'Farmácia Centro Cirúrgico', 'surgical_pharmacy')
on conflict do nothing;
