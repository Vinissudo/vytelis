-- ============ FASE 2: MOTOR CENTRAL (funções) ============

-- Nenhuma tela pode inserir movimentações diretamente
drop policy if exists movements_insert_operators on public.movements;

-- ---------- helper: garante lote (usado só pelo recebimento/cadastro) ----------
create or replace function public.ensure_batch(
  p_hospital_id uuid, p_product_id uuid, p_code text, p_expiration date,
  p_manufacture date default null, p_supplier_id uuid default null, p_unit_cost numeric default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.batches
   where product_id = p_product_id
     and coalesce(code,'') = coalesce(nullif(trim(p_code),''),'')
     and coalesce(expiration_date,'9999-12-31'::date) = coalesce(p_expiration,'9999-12-31'::date);
  if v_id is not null then
    update public.batches
       set manufacture_date = coalesce(p_manufacture, manufacture_date),
           supplier_id      = coalesce(p_supplier_id, supplier_id),
           unit_cost        = coalesce(p_unit_cost, unit_cost),
           updated_by = auth.uid(), updated_at = now()
     where id = v_id;
    return v_id;
  end if;
  insert into public.batches(hospital_id, product_id, code, expiration_date, manufacture_date,
                             supplier_id, unit_cost, created_by, updated_by)
  values (p_hospital_id, p_product_id, nullif(trim(p_code),''), p_expiration, p_manufacture,
          p_supplier_id, p_unit_cost, auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.ensure_batch(uuid,uuid,text,date,date,uuid,numeric) from public, anon;

-- ---------- FEFO: sugestão de alocações ----------
create or replace function public.fefo_allocate(
  p_product_id uuid, p_location_id uuid, p_quantity numeric
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; v_left numeric := p_quantity; v_out jsonb := '[]'::jsonb; v_take numeric;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'QUANTIDADE_INVALIDA'; end if;
  for r in
    select sb.batch_id, sb.quantity_available, b.expiration_date
      from public.stock_balances sb
      join public.batches b on b.id = sb.batch_id
     where sb.product_id = p_product_id
       and sb.location_id = p_location_id
       and sb.quantity_available > 0
       and b.status = 'ACTIVE'
       and (b.expiration_date is null or b.expiration_date >= current_date)
     order by b.expiration_date asc nulls last, b.created_at asc
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.quantity_available);
    v_out := v_out || jsonb_build_object('batch_id', r.batch_id, 'quantity', v_take,
                                         'expiration_date', r.expiration_date);
    v_left := v_left - v_take;
  end loop;
  return jsonb_build_object('allocations', v_out, 'missing', greatest(v_left, 0));
end $$;

revoke all on function public.fefo_allocate(uuid,uuid,numeric) from public, anon;
grant execute on function public.fefo_allocate(uuid,uuid,numeric) to authenticated;

-- ---------- MOTOR CENTRAL ----------
create or replace function public.process_movement(
  p_type text,
  p_allocations jsonb,
  p_origin_location_id uuid default null,
  p_destination_location_id uuid default null,
  p_user_id uuid default null,
  p_reason text default null,
  p_document_ref text default null,
  p_adjustment_direction text default null,
  p_override_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := coalesce(auth.uid(), p_user_id);
  v_hospital uuid;
  v_kind public.movement_kind;
  v_dir public.adjustment_direction;
  v_legacy public.movement_type;
  v_needs_origin boolean;
  v_needs_dest boolean;
  v_alloc jsonb;
  v_item jsonb;
  v_qty numeric;
  v_batch_id uuid;
  v_product uuid;
  v_exp date;
  v_status public.batch_status;
  v_balance numeric;
  v_row_id uuid;
  v_movement uuid;
  v_ids uuid[] := '{}';
  v_moves jsonb := '[]'::jsonb;
  v_earliest date;
  v_used uuid[] := '{}';
  v_h uuid;
begin
  -- ---- validação de parâmetros ----
  if v_user is null then raise exception 'NAO_AUTENTICADO'; end if;
  if not public.can_operate_stock(v_user) then raise exception 'SEM_PERMISSAO'; end if;

  select hospital_id into v_hospital from public.profiles where id = v_user;
  if v_hospital is null then raise exception 'HOSPITAL_NAO_ENCONTRADO'; end if;

  begin v_kind := upper(coalesce(p_type,''))::public.movement_kind;
  exception when others then raise exception 'TIPO_MOVIMENTO_INVALIDO'; end;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    raise exception 'ALOCACOES_INVALIDAS';
  end if;

  -- ---- direção do ajuste ----
  if v_kind = 'ADJUSTMENT' then
    if p_adjustment_direction is null
       or lower(p_adjustment_direction) not in ('increase','decrease') then
      raise exception 'AJUSTE_DIRECAO_INVALIDA';
    end if;
    v_dir := lower(p_adjustment_direction)::public.adjustment_direction;
    if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  end if;

  if v_kind = 'LOSS' and nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'MOTIVO_OBRIGATORIO';
  end if;

  -- ---- Seção 7A: origem/destino obrigatórios/proibidos por tipo ----
  v_needs_origin := case v_kind
      when 'ENTRY' then false
      when 'TRANSFER' then true
      when 'DISPENSE' then true
      when 'RETURN' then false            -- opcional
      when 'LOSS' then true
      when 'ADJUSTMENT' then (v_dir = 'decrease')
    end;
  v_needs_dest := case v_kind
      when 'ENTRY' then true
      when 'TRANSFER' then true
      when 'DISPENSE' then false
      when 'RETURN' then true
      when 'LOSS' then false
      when 'ADJUSTMENT' then (v_dir = 'increase')
    end;

  if v_needs_origin and p_origin_location_id is null then raise exception 'ORIGEM_OBRIGATORIA'; end if;
  if v_needs_dest and p_destination_location_id is null then raise exception 'DESTINO_OBRIGATORIO'; end if;

  if p_origin_location_id is not null then
    if v_kind in ('ENTRY') or (v_kind = 'ADJUSTMENT' and v_dir = 'increase') then
      raise exception 'ORIGEM_NAO_PERMITIDA_PARA_TIPO';
    end if;
  end if;
  if p_destination_location_id is not null then
    if v_kind in ('DISPENSE','LOSS') or (v_kind = 'ADJUSTMENT' and v_dir = 'decrease') then
      raise exception 'DESTINO_NAO_PERMITIDO_PARA_TIPO';
    end if;
  end if;

  -- devolução externa exige documento + motivo
  if v_kind = 'RETURN' and p_origin_location_id is null then
    if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'MOTIVO_OBRIGATORIO'; end if;
    if nullif(trim(coalesce(p_document_ref,'')),'') is null then raise exception 'DOCUMENTO_OBRIGATORIO'; end if;
  end if;

  -- ---- validação de locations ----
  if p_origin_location_id is not null then
    select hospital_id into v_h from public.stock_centers
      where id = p_origin_location_id and active and deleted_at is null;
    if v_h is null or v_h <> v_hospital then raise exception 'LOCATION_NAO_ENCONTRADA'; end if;
  end if;
  if p_destination_location_id is not null then
    select hospital_id into v_h from public.stock_centers
      where id = p_destination_location_id and active and deleted_at is null;
    if v_h is null or v_h <> v_hospital then raise exception 'LOCATION_NAO_ENCONTRADA'; end if;
  end if;
  if v_kind = 'TRANSFER' and p_origin_location_id = p_destination_location_id then
    raise exception 'TRANSFERENCIA_MESMA_LOCATION';
  end if;

  v_legacy := case
    when v_kind = 'ENTRY' then 'purchase_entry'
    when v_kind = 'TRANSFER' then 'transfer'
    when v_kind = 'DISPENSE' then 'consumption'
    when v_kind = 'RETURN' then 'return'
    when v_kind = 'LOSS' then 'loss'
    when v_dir = 'increase' then 'positive_adjustment'
    else 'negative_adjustment'
  end::public.movement_type;

  -- ---- validação dos lotes ----
  for v_item in select * from jsonb_array_elements(p_allocations) loop
    begin v_batch_id := (v_item->>'batch_id')::uuid;
    exception when others then raise exception 'LOTE_NAO_ENCONTRADO'; end;
    begin v_qty := (v_item->>'quantity')::numeric;
    exception when others then raise exception 'QUANTIDADE_INVALIDA'; end;
    if v_batch_id is null then raise exception 'LOTE_NAO_ENCONTRADO'; end if;
    if v_qty is null or v_qty <= 0 then raise exception 'QUANTIDADE_INVALIDA'; end if;

    select b.product_id, b.expiration_date, b.status, b.hospital_id
      into v_product, v_exp, v_status, v_h
      from public.batches b where b.id = v_batch_id;
    if v_product is null then raise exception 'LOTE_NAO_ENCONTRADO'; end if;
    if v_h <> v_hospital then raise exception 'LOTE_NAO_ENCONTRADO'; end if;
    if not exists (select 1 from public.products where id = v_product and deleted_at is null) then
      raise exception 'PRODUTO_NAO_ENCONTRADO';
    end if;
    if v_status = 'BLOCKED' then raise exception 'LOTE_BLOQUEADO'; end if;
    if v_exp is not null and v_exp < current_date
       and (v_kind in ('ENTRY','DISPENSE','TRANSFER','RETURN')) then
      raise exception 'LOTE_VENCIDO';
    end if;
    v_used := v_used || v_batch_id;
  end loop;

  -- ---- override FEFO (saída automática fora de ordem) ----
  if v_kind = 'DISPENSE' then
    select min(b.expiration_date) into v_earliest
      from public.batches b where b.id = any(v_used) and b.expiration_date is not null;
    if exists (
      select 1 from public.stock_balances sb
        join public.batches b on b.id = sb.batch_id
       where sb.location_id = p_origin_location_id
         and sb.quantity_available > 0
         and b.status = 'ACTIVE'
         and (b.expiration_date is null or b.expiration_date >= current_date)
         and b.expiration_date is not null
         and (v_earliest is null or b.expiration_date < v_earliest)
         and not (sb.batch_id = any(v_used))
         and b.product_id in (select product_id from public.batches where id = any(v_used))
    ) and nullif(trim(coalesce(p_override_reason,'')),'') is null then
      raise exception 'OVERRIDE_MOTIVO_OBRIGATORIO';
    end if;
  end if;

  -- ---- execução por alocação ----
  for v_item in select * from jsonb_array_elements(p_allocations) loop
    v_batch_id := (v_item->>'batch_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    select product_id into v_product from public.batches where id = v_batch_id;

    -- perna de SAÍDA
    if p_origin_location_id is not null then
      select id, quantity_available into v_row_id, v_balance
        from public.stock_balances
       where product_id = v_product and batch_id = v_batch_id
         and location_id = p_origin_location_id
       for update;
      if v_row_id is null then raise exception 'SALDO_INSUFICIENTE'; end if;
      if v_balance < v_qty then raise exception 'SALDO_INSUFICIENTE'; end if;
      update public.stock_balances
         set quantity_total = quantity_total - v_qty, updated_at = now()
       where id = v_row_id;
      if (select quantity_total from public.stock_balances where id = v_row_id) < 0 then
        raise exception 'SALDO_NEGATIVO_NAO_PERMITIDO';
      end if;
    end if;

    -- perna de ENTRADA
    if p_destination_location_id is not null then
      insert into public.stock_balances(hospital_id, product_id, batch_id, location_id, quantity_total)
      values (v_hospital, v_product, v_batch_id, p_destination_location_id, 0)
      on conflict (product_id, batch_id, location_id) do nothing;

      select id into v_row_id from public.stock_balances
       where product_id = v_product and batch_id = v_batch_id
         and location_id = p_destination_location_id
       for update;
      update public.stock_balances
         set quantity_total = quantity_total + v_qty, updated_at = now()
       where id = v_row_id;
    end if;

    -- livro imutável
    insert into public.movements(
      hospital_id, type, movement_type, product_id, batch_id,
      stock_center_id, stock_center_dest_id, user_id, quantity,
      batch, expiration_date, movement_reason, observation, document_ref,
      adjustment_direction, override_reason, reference_type, reference_id, occurred_at)
    select v_hospital, v_kind, v_legacy, v_product, v_batch_id,
           p_origin_location_id, p_destination_location_id, v_user, v_qty,
           b.code, b.expiration_date, nullif(trim(coalesce(p_reason,'')),''), null,
           nullif(trim(coalesce(p_document_ref,'')),''),
           v_dir, nullif(trim(coalesce(p_override_reason,'')),''),
           nullif(trim(coalesce(p_reference_type,'')),''), p_reference_id, now()
      from public.batches b where b.id = v_batch_id
    returning id into v_movement;

    v_ids := v_ids || v_movement;
    v_moves := v_moves || jsonb_build_object(
      'movement_id', v_movement, 'batch_id', v_batch_id,
      'product_id', v_product, 'quantity', v_qty);
  end loop;

  insert into public.audit_log(hospital_id, user_id, entity, entity_id, action, after)
  values (v_hospital, v_user, 'movements', v_ids[1], v_kind::text,
    jsonb_build_object('type', v_kind, 'allocations', p_allocations,
      'origin_location_id', p_origin_location_id,
      'destination_location_id', p_destination_location_id,
      'adjustment_direction', v_dir, 'reason', p_reason,
      'document_ref', p_document_ref, 'override_reason', p_override_reason,
      'reference_type', p_reference_type, 'reference_id', p_reference_id));

  return jsonb_build_object('type', v_kind, 'movements', v_moves,
                            'movement_ids', to_jsonb(v_ids));
end $$;

revoke all on function public.process_movement(text,jsonb,uuid,uuid,uuid,text,text,text,text,text,uuid) from public, anon;
grant execute on function public.process_movement(text,jsonb,uuid,uuid,uuid,text,text,text,text,text,uuid) to authenticated;

-- ---------- RECEBIMENTO: cria/garante o lote e delega o saldo ao motor ----------
create or replace function public.receive_product_batch(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_hospital uuid; v_default_center uuid; v_center uuid; v_center_hospital uuid;
  v_product_id uuid := nullif(p->>'product_id','')::uuid;
  v_supplier uuid := nullif(p->>'supplier_id','')::uuid;
  v_receipt uuid := nullif(p->>'receipt_id','')::uuid;
  v_batch text := nullif(trim(p->>'batch'),'');
  v_exp date := nullif(p->>'expiration_date','')::date;
  v_fab date := nullif(p->>'manufacture_date','')::date;
  v_purchase_qty numeric(14,3); v_package numeric(14,3); v_qty numeric(14,3);
  v_cost numeric(14,4) := nullif(p->>'unit_cost','')::numeric;
  v_requires_batch boolean; v_requires_exp boolean;
  v_batch_id uuid; v_res jsonb; v_movement uuid;
begin
  if v_user is null then raise exception 'NAO_AUTENTICADO'; end if;
  if not public.can_operate_stock(v_user) then raise exception 'SEM_PERMISSAO'; end if;

  select hospital_id, stock_center_id into v_hospital, v_default_center
    from public.profiles where id = v_user;
  if v_hospital is null then raise exception 'HOSPITAL_NAO_ENCONTRADO'; end if;

  v_center := coalesce(nullif(p->>'stock_center_id','')::uuid, v_default_center);
  if v_center is null then raise exception 'DESTINO_OBRIGATORIO'; end if;
  select hospital_id into v_center_hospital from public.stock_centers
    where id = v_center and active and deleted_at is null;
  if v_center_hospital is null or v_center_hospital <> v_hospital then
    raise exception 'LOCATION_NAO_ENCONTRADA';
  end if;

  if v_product_id is null then raise exception 'PRODUTO_NAO_ENCONTRADO'; end if;
  select requires_batch, requires_expiration_date, coalesce(package_quantity,1)
    into v_requires_batch, v_requires_exp, v_package
    from public.products where id = v_product_id and hospital_id = v_hospital and deleted_at is null;
  if not found then raise exception 'PRODUTO_NAO_ENCONTRADO'; end if;

  begin v_purchase_qty := (p->>'purchase_quantity')::numeric;
  exception when others then raise exception 'QUANTIDADE_INVALIDA'; end;
  if v_purchase_qty is null or v_purchase_qty <= 0 then raise exception 'QUANTIDADE_INVALIDA'; end if;

  if nullif(p->>'package_quantity','') is not null then
    v_package := (p->>'package_quantity')::numeric;
  end if;
  if v_package is null or v_package <= 0 then raise exception 'QUANTIDADE_INVALIDA'; end if;

  v_qty := v_purchase_qty * v_package;

  if v_requires_batch and v_batch is null then raise exception 'LOTE_OBRIGATORIO'; end if;
  if v_requires_exp and v_exp is null then raise exception 'VALIDADE_OBRIGATORIA'; end if;
  if v_exp is not null and v_exp < current_date then raise exception 'LOTE_VENCIDO'; end if;

  v_batch_id := public.ensure_batch(v_hospital, v_product_id, v_batch, v_exp, v_fab, v_supplier, v_cost);

  v_res := public.process_movement(
    'ENTRY',
    jsonb_build_array(jsonb_build_object('batch_id', v_batch_id, 'quantity', v_qty)),
    null, v_center, v_user,
    coalesce(nullif(trim(p->>'movement_reason'),''), 'Recebimento'),
    nullif(trim(p->>'document_ref'),''),
    null, null, 'RECEIPT', v_receipt);

  v_movement := ((v_res->'movements'->0->>'movement_id'))::uuid;

  if v_cost is not null then
    update public.products
      set last_purchase_price = v_cost, last_purchase_at = now(),
          updated_by = v_user, updated_at = now()
      where id = v_product_id;
  end if;

  if v_receipt is not null then
    insert into public.receipt_items(
      hospital_id, receipt_id, product_id, batch_id, movement_id,
      gtin, supplier_code, description, batch, expiration_date, manufacture_date,
      purchase_unit, purchase_quantity, package_quantity, consumption_quantity,
      unit_cost, status)
    values (v_hospital, v_receipt, v_product_id, v_batch_id, v_movement,
      nullif(trim(p->>'gtin'),''), nullif(trim(p->>'supplier_code'),''),
      coalesce(nullif(trim(p->>'description'),''),'Item'),
      v_batch, v_exp, v_fab,
      nullif(trim(p->>'purchase_unit'),''), v_purchase_qty, v_package, v_qty,
      v_cost, 'received');
  end if;

  return jsonb_build_object('product_id', v_product_id, 'batch_id', v_batch_id,
    'movement_id', v_movement, 'consumption_quantity', v_qty);
end $$;

revoke all on function public.receive_product_batch(jsonb) from public, anon;
grant execute on function public.receive_product_batch(jsonb) to authenticated;

-- ---------- register_movement: wrapper legado sobre o motor ----------
create or replace function public.register_movement(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_hospital uuid;
  v_legacy text := lower(coalesce(p->>'movement_type',''));
  v_kind text; v_dir text;
  v_product uuid := nullif(p->>'product_id','')::uuid;
  v_center uuid := nullif(p->>'stock_center_id','')::uuid;
  v_dest uuid := nullif(p->>'stock_center_dest_id','')::uuid;
  v_batch text := nullif(trim(p->>'batch'),'');
  v_exp date := nullif(p->>'expiration_date','')::date;
  v_qty numeric := nullif(p->>'quantity','')::numeric;
  v_cost numeric := nullif(p->>'unit_cost','')::numeric;
  v_batch_id uuid; v_origin uuid; v_target uuid; v_res jsonb;
begin
  if v_user is null then raise exception 'NAO_AUTENTICADO'; end if;
  select hospital_id into v_hospital from public.profiles where id = v_user;
  if v_hospital is null then raise exception 'HOSPITAL_NAO_ENCONTRADO'; end if;
  if v_product is null then raise exception 'PRODUTO_NAO_ENCONTRADO'; end if;

  v_kind := case v_legacy
    when 'initial_entry' then 'ENTRY' when 'purchase_entry' then 'ENTRY'
    when 'purchase' then 'ENTRY' when 'return' then 'RETURN'
    when 'positive_adjustment' then 'ADJUSTMENT' when 'negative_adjustment' then 'ADJUSTMENT'
    when 'transfer' then 'TRANSFER' when 'consumption' then 'DISPENSE'
    when 'simple_output' then 'DISPENSE' when 'loss' then 'LOSS' when 'expired' then 'LOSS'
    else null end;
  if v_kind is null then raise exception 'TIPO_MOVIMENTO_INVALIDO'; end if;
  if v_legacy = 'positive_adjustment' then v_dir := 'increase';
  elsif v_legacy = 'negative_adjustment' then v_dir := 'decrease'; end if;

  -- lotes só são criados em operações de entrada
  if v_kind in ('ENTRY') or v_dir = 'increase' then
    v_batch_id := public.ensure_batch(v_hospital, v_product, v_batch, v_exp, null, null, v_cost);
  else
    select id into v_batch_id from public.batches
     where product_id = v_product
       and coalesce(code,'') = coalesce(v_batch,'')
       and coalesce(expiration_date,'9999-12-31'::date) = coalesce(v_exp,'9999-12-31'::date);
    if v_batch_id is null then raise exception 'LOTE_NAO_ENCONTRADO'; end if;
  end if;

  if v_kind = 'ENTRY' or v_dir = 'increase' then
    v_origin := null; v_target := coalesce(v_dest, v_center);
  elsif v_kind = 'TRANSFER' then
    v_origin := v_center; v_target := v_dest;
  elsif v_kind = 'RETURN' then
    v_origin := v_center; v_target := coalesce(v_dest, v_center);
    if v_origin = v_target then v_origin := null; end if;
  else
    v_origin := v_center; v_target := null;
  end if;

  v_res := public.process_movement(v_kind,
    jsonb_build_array(jsonb_build_object('batch_id', v_batch_id, 'quantity', v_qty)),
    v_origin, v_target, v_user,
    nullif(trim(p->>'movement_reason'),''), nullif(trim(p->>'document_ref'),''),
    v_dir, nullif(trim(p->>'override_reason'),''), null, null);

  return jsonb_build_object(
    'movement_id', (v_res->'movements'->0->>'movement_id'),
    'batch_id', v_batch_id, 'transfer_group_id', null);
end $$;

revoke all on function public.register_movement(jsonb) from public, anon;
grant execute on function public.register_movement(jsonb) to authenticated;

-- ---------- cadastro mestre + entrada inicial ----------
create or replace function public.create_product_with_initial_entry(p_product jsonb, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_hospital uuid; v_default_center uuid; v_center uuid; v_center_hospital uuid;
  v_product_id uuid;
  v_barcode text := nullif(trim(p_product->>'barcode'), '');
  v_internal text := nullif(trim(p_product->>'internal_code'), '');
  v_description text := nullif(trim(p_product->>'description'), '');
  v_batch text := nullif(trim(p_entry->>'batch'), '');
  v_expiration date := nullif(p_entry->>'expiration_date', '')::date;
  v_qty numeric(14,3); v_cost numeric(14,4);
  v_requires_batch boolean; v_requires_expiration boolean;
  v_batch_id uuid; v_dup_id uuid; v_res jsonb;
begin
  if v_user is null then raise exception 'NAO_AUTENTICADO'; end if;
  select hospital_id, stock_center_id into v_hospital, v_default_center
    from public.profiles where id = v_user;
  if v_hospital is null then raise exception 'HOSPITAL_NAO_ENCONTRADO'; end if;
  if not public.is_admin_or_manager(v_user) then raise exception 'SEM_PERMISSAO'; end if;

  v_center := coalesce(nullif(p_entry->>'stock_center_id','')::uuid, v_default_center);
  if v_center is null then
    select id into v_center from public.stock_centers
      where hospital_id = v_hospital and active and deleted_at is null
      order by created_at limit 1;
  end if;
  if v_center is null then raise exception 'DESTINO_OBRIGATORIO'; end if;
  select hospital_id into v_center_hospital from public.stock_centers
    where id = v_center and deleted_at is null and active;
  if v_center_hospital is null or v_center_hospital <> v_hospital then
    raise exception 'LOCATION_NAO_ENCONTRADA';
  end if;

  begin v_qty := (p_entry->>'quantity')::numeric;
  exception when others then raise exception 'QUANTIDADE_INVALIDA'; end;
  if v_qty is null or v_qty <= 0 then raise exception 'QUANTIDADE_INVALIDA'; end if;

  if (p_entry ? 'unit_cost') and nullif(p_entry->>'unit_cost','') is not null then
    v_cost := (p_entry->>'unit_cost')::numeric;
    if v_cost < 0 then raise exception 'CUSTO_INVALIDO'; end if;
  end if;

  if (p_product ? 'id') and nullif(p_product->>'id','') is not null then
    v_product_id := (p_product->>'id')::uuid;
    select requires_batch, requires_expiration_date
      into v_requires_batch, v_requires_expiration
      from public.products
      where id = v_product_id and hospital_id = v_hospital and deleted_at is null;
    if not found then raise exception 'PRODUTO_NAO_ENCONTRADO'; end if;
  else
    if v_description is null or length(v_description) < 2 then raise exception 'DESCRICAO_INVALIDA'; end if;
    if v_barcode is not null then
      select id into v_dup_id from public.products
        where hospital_id = v_hospital and barcode = v_barcode and deleted_at is null;
      if found then raise exception 'duplicate_barcode'; end if;
    end if;
    if v_internal is not null then
      select id into v_dup_id from public.products
        where hospital_id = v_hospital and internal_code = v_internal and deleted_at is null;
      if found then raise exception 'duplicate_internal_code'; end if;
    end if;

    v_requires_batch := coalesce((p_product->>'requires_batch')::boolean, true);
    v_requires_expiration := coalesce((p_product->>'requires_expiration_date')::boolean, true);

    insert into public.products(
      hospital_id, internal_code, barcode, description, short_description,
      manufacturer, unit, category_id, default_supplier_id,
      controlled_drug, requires_batch, requires_expiration_date,
      minimum_stock, maximum_stock, active, created_by, updated_by
    ) values (
      v_hospital, v_internal, v_barcode, v_description,
      nullif(trim(p_product->>'short_description'),''),
      nullif(trim(p_product->>'manufacturer'),''),
      nullif(trim(p_product->>'unit'),''),
      nullif(p_product->>'category_id','')::uuid,
      nullif(p_product->>'default_supplier_id','')::uuid,
      coalesce((p_product->>'controlled_drug')::boolean,false),
      v_requires_batch, v_requires_expiration,
      nullif(p_product->>'minimum_stock','')::numeric,
      nullif(p_product->>'maximum_stock','')::numeric,
      coalesce((p_product->>'active')::boolean,true), v_user, v_user
    ) returning id into v_product_id;
  end if;

  if v_requires_batch and v_batch is null then raise exception 'LOTE_OBRIGATORIO'; end if;
  if v_requires_expiration and v_expiration is null then raise exception 'VALIDADE_OBRIGATORIA'; end if;
  if v_expiration is not null and v_expiration < current_date then raise exception 'LOTE_VENCIDO'; end if;

  v_batch_id := public.ensure_batch(v_hospital, v_product_id, v_batch, v_expiration, null, null, v_cost);

  v_res := public.process_movement('ENTRY',
    jsonb_build_array(jsonb_build_object('batch_id', v_batch_id, 'quantity', v_qty)),
    null, v_center, v_user,
    coalesce(nullif(trim(p_entry->>'observation'),''), 'Estoque inicial'),
    null, null, null, 'INITIAL_ENTRY', null);

  return jsonb_build_object('product_id', v_product_id, 'batch_id', v_batch_id,
    'movement_id', (v_res->'movements'->0->>'movement_id'));
end $$;

revoke all on function public.create_product_with_initial_entry(jsonb,jsonb) from public, anon;
grant execute on function public.create_product_with_initial_entry(jsonb,jsonb) to authenticated;

-- outras funções definer: apenas usuários autenticados
revoke all on function public.can_operate_stock(uuid) from public, anon;
revoke all on function public.is_admin_or_manager(uuid) from public, anon;
revoke all on function public.current_hospital_id() from public, anon;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.can_operate_stock(uuid) to authenticated;
grant execute on function public.is_admin_or_manager(uuid) to authenticated;
grant execute on function public.current_hospital_id() to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

-- ---------- VIEWS DE CONSULTA (saldo persistido) ----------
create or replace view public.v_stock_balances with (security_invoker = true) as
select sb.id, sb.hospital_id, sb.product_id, sb.batch_id, sb.location_id,
       p.description, p.internal_code, p.barcode, p.unit, p.consumption_unit,
       b.code as batch_code, b.expiration_date, b.manufacture_date, b.status as batch_status,
       b.unit_cost, sc.name as location_name, sc.type as location_type,
       sb.quantity_total, sb.quantity_reserved, sb.quantity_available,
       (sb.quantity_available * coalesce(b.unit_cost,0)) as stock_value,
       t.min_quantity, t.max_quantity,
       case
         when sb.quantity_available <= 0 then 'OUT'
         when t.min_quantity is not null and sb.quantity_available < t.min_quantity then 'CRITICAL'
         when t.max_quantity is not null and sb.quantity_available >= t.max_quantity then 'OVERSTOCK'
         else 'OK'
       end as replenishment_status,
       case when b.expiration_date is null then null
            else (b.expiration_date - current_date) end as days_to_expire,
       sb.updated_at
  from public.stock_balances sb
  join public.products p on p.id = sb.product_id
  join public.batches b on b.id = sb.batch_id
  join public.stock_centers sc on sc.id = sb.location_id
  left join public.stock_thresholds t
         on t.product_id = sb.product_id and t.location_id = sb.location_id;

grant select on public.v_stock_balances to authenticated;

create or replace view public.v_stock_health with (security_invoker = true) as
select sb.product_id,
       sb.location_id as stock_center_id,
       p.description,
       sum(sb.quantity_available) as current_stock,
       max(t.min_quantity) as minimum_stock,
       max(t.max_quantity) as maximum_stock,
       null::numeric as coverage_days,
       sum(sb.quantity_available * coalesce(b.unit_cost,0)) as stock_value,
       max(m.last_at) as last_movement_at,
       sb.hospital_id
  from public.stock_balances sb
  join public.products p on p.id = sb.product_id
  join public.batches b on b.id = sb.batch_id
  left join public.stock_thresholds t
         on t.product_id = sb.product_id and t.location_id = sb.location_id
  left join lateral (
    select max(occurred_at) as last_at from public.movements mv
     where mv.product_id = sb.product_id
       and (mv.stock_center_id = sb.location_id or mv.stock_center_dest_id = sb.location_id)
  ) m on true
 group by sb.product_id, sb.location_id, p.description, sb.hospital_id;

grant select on public.v_stock_health to authenticated;

create or replace view public.v_stock_alerts with (security_invoker = true) as
with agg as (
  select sb.hospital_id, sb.product_id, sb.location_id, p.description,
         sum(sb.quantity_available) as qty,
         min(b.expiration_date) filter (where b.expiration_date is not null) as next_exp,
         max(t.min_quantity) as min_qty
    from public.stock_balances sb
    join public.products p on p.id = sb.product_id
    join public.batches b on b.id = sb.batch_id
    left join public.stock_thresholds t
           on t.product_id = sb.product_id and t.location_id = sb.location_id
   group by sb.hospital_id, sb.product_id, sb.location_id, p.description
)
select hospital_id, product_id, location_id as stock_center_id, description,
  case
    when qty <= 0 then 'out_of_stock'
    when next_exp is not null and next_exp < current_date then 'expired'
    when next_exp is not null and next_exp <= current_date + 7 then 'expiring_7'
    when min_qty is not null and qty < min_qty * 0.5 then 'critical_stock'
    when min_qty is not null and qty < min_qty then 'low_stock'
    when next_exp is not null and next_exp <= current_date + 30 then 'expiring_30'
    when next_exp is not null and next_exp <= current_date + 60 then 'expiring_60'
    when next_exp is not null and next_exp <= current_date + 90 then 'expiring_90'
    else null
  end as alert_kind,
  qty as metric,
  next_exp as ref_date
from agg;

grant select on public.v_stock_alerts to authenticated;
