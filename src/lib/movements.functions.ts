import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Movement types ----------
export const MOVEMENT_TYPES = [
  "initial_entry",
  "purchase_entry",
  "consumption",
  "transfer",
  "positive_adjustment",
  "negative_adjustment",
  "return",
  "loss",
  "expired",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  initial_entry: "Estoque Inicial",
  purchase_entry: "Entrada de Compra",
  consumption: "Consumo",
  transfer: "Transferência",
  positive_adjustment: "Ajuste Positivo",
  negative_adjustment: "Ajuste Negativo",
  return: "Devolução",
  loss: "Perda",
  expired: "Produto Vencido",
};

export const INBOUND_TYPES: MovementType[] = [
  "initial_entry", "purchase_entry", "return", "positive_adjustment",
];
export const OUTBOUND_TYPES: MovementType[] = [
  "consumption", "loss", "expired", "negative_adjustment",
];

// ---------- Product lookup ----------
export interface ProductLookupRow {
  id: string;
  barcode: string | null;
  internal_code: string | null;
  description: string;
  short_description: string | null;
  manufacturer: string | null;
  unit: string | null;
  category_id: string | null;
  category_name: string | null;
  default_supplier_id: string | null;
  supplier_name: string | null;
  controlled_drug: boolean;
  requires_batch: boolean;
  requires_expiration_date: boolean;
  minimum_stock: number | null;
  maximum_stock: number | null;
  average_daily_consumption: number | null;
  lead_time_days: number | null;
  last_purchase_price: number | null;
  centers: Array<{
    stock_center_id: string;
    stock_center_name: string;
    quantity: number;
  }>;
  last_batch: string | null;
  last_expiration: string | null;
}

const searchSchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(50).optional(),
});

const PRODUCT_COLS = `id, barcode, internal_code, description, short_description,
  manufacturer, unit, category_id, default_supplier_id, controlled_drug,
  requires_batch, requires_expiration_date, minimum_stock, maximum_stock,
  average_daily_consumption, lead_time_days, last_purchase_price,
  categories(name), suppliers:default_supplier_id(name)`;

async function enrich(
  supabase: NonNullable<Parameters<Parameters<typeof createServerFn>[0] extends never ? never : never>[0]> extends never ? never : never,
  _rows: unknown,
) { return _rows; /* placeholder to satisfy tree-shaker */ }
void enrich;

async function hydrateProducts(
  ctxSupabase: {
    from: (t: string) => {
      select: (cols: string) => { in: (col: string, vals: string[]) => Promise<{ data: unknown; error: { message: string } | null }> };
    };
  },
  rows: Array<Record<string, unknown>>,
): Promise<ProductLookupRow[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as string);

  const [{ data: stock, error: se }, { data: lastMv, error: le }] = await Promise.all([
    ctxSupabase.from("stock_items").select("product_id, stock_center_id, quantity, stock_centers(name)").in(
      "product_id",
      ids,
    ) as Promise<{ data: unknown; error: { message: string } | null }>,
    ctxSupabase.from("stock_items").select("product_id, batch, expiration_date, created_at").in(
      "product_id",
      ids,
    ) as Promise<{ data: unknown; error: { message: string } | null }>,
  ]);
  if (se) throw new Error(se.message);
  if (le) throw new Error(le.message);

  const centersByProduct = new Map<string, ProductLookupRow["centers"]>();
  for (const r of (stock as Array<{
    product_id: string;
    stock_center_id: string;
    quantity: number | string;
    stock_centers: { name: string } | null;
  }>) ?? []) {
    const list = centersByProduct.get(r.product_id) ?? [];
    const existing = list.find((c) => c.stock_center_id === r.stock_center_id);
    if (existing) existing.quantity += Number(r.quantity ?? 0);
    else
      list.push({
        stock_center_id: r.stock_center_id,
        stock_center_name: r.stock_centers?.name ?? "—",
        quantity: Number(r.quantity ?? 0),
      });
    centersByProduct.set(r.product_id, list);
  }

  const lastByProduct = new Map<string, { batch: string | null; expiration_date: string | null }>();
  for (const r of ((lastMv as Array<{
    product_id: string;
    batch: string | null;
    expiration_date: string | null;
    created_at: string;
  }>) ?? []).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
    if (!lastByProduct.has(r.product_id))
      lastByProduct.set(r.product_id, { batch: r.batch, expiration_date: r.expiration_date });
  }

  return rows.map((raw) => {
    const r = raw as Record<string, unknown> & {
      categories: { name: string } | null;
      suppliers: { name: string } | null;
    };
    const last = lastByProduct.get(r.id as string);
    return {
      id: r.id as string,
      barcode: (r.barcode as string) ?? null,
      internal_code: (r.internal_code as string) ?? null,
      description: r.description as string,
      short_description: (r.short_description as string) ?? null,
      manufacturer: (r.manufacturer as string) ?? null,
      unit: (r.unit as string) ?? null,
      category_id: (r.category_id as string) ?? null,
      category_name: r.categories?.name ?? null,
      default_supplier_id: (r.default_supplier_id as string) ?? null,
      supplier_name: r.suppliers?.name ?? null,
      controlled_drug: Boolean(r.controlled_drug),
      requires_batch: Boolean(r.requires_batch),
      requires_expiration_date: Boolean(r.requires_expiration_date),
      minimum_stock: r.minimum_stock == null ? null : Number(r.minimum_stock),
      maximum_stock: r.maximum_stock == null ? null : Number(r.maximum_stock),
      average_daily_consumption:
        r.average_daily_consumption == null ? null : Number(r.average_daily_consumption),
      lead_time_days: r.lead_time_days == null ? null : Number(r.lead_time_days),
      last_purchase_price: r.last_purchase_price == null ? null : Number(r.last_purchase_price),
      centers: centersByProduct.get(r.id as string) ?? [],
      last_batch: last?.batch ?? null,
      last_expiration: last?.expiration_date ?? null,
    };
  });
}

export const searchProductsForMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchSchema.parse(input))
  .handler(async ({ data, context }): Promise<ProductLookupRow[]> => {
    const term = data.q.replace(/[%_]/g, (m) => `\\${m}`);
    const like = `%${term}%`;
    // Exact barcode/internal-code lookup first
    const { data: exact, error: ee } = await context.supabase
      .from("products")
      .select(PRODUCT_COLS)
      .is("deleted_at", null)
      .or(`barcode.eq.${data.q},internal_code.eq.${data.q}`)
      .limit(5);
    if (ee) throw new Error(ee.message);
    if (exact && exact.length > 0) {
      return hydrateProducts(context.supabase as never, exact as Array<Record<string, unknown>>);
    }
    const { data: rows, error } = await context.supabase
      .from("products")
      .select(PRODUCT_COLS)
      .is("deleted_at", null)
      .or(
        `barcode.ilike.${like},internal_code.ilike.${like},description.ilike.${like},short_description.ilike.${like}`,
      )
      .order("description")
      .limit(data.limit ?? 15);
    if (error) throw new Error(error.message);
    return hydrateProducts(
      context.supabase as never,
      (rows ?? []) as Array<Record<string, unknown>>,
    );
  });

// ---------- Stock centers ----------
export interface StockCenterOption {
  id: string;
  name: string;
}

export const listMovementStockCenters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StockCenterOption[]> => {
    const { data, error } = await context.supabase
      .from("stock_centers")
      .select("id, name")
      .is("deleted_at", null)
      .eq("active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as StockCenterOption[];
  });

// ---------- Register movement ----------
const registerSchema = z.object({
  movement_type: z.enum(MOVEMENT_TYPES),
  product_id: z.string().uuid(),
  stock_center_id: z.string().uuid(),
  stock_center_dest_id: z.string().uuid().optional().nullable(),
  batch: z.string().trim().max(60).optional().nullable(),
  expiration_date: z.string().trim().optional().nullable(),
  quantity: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "number" ? v : Number(v.trim())))
    .refine((v) => Number.isFinite(v) && v > 0, { message: "Quantidade inválida" }),
  unit_cost: z
    .union([z.number(), z.string()])
    .transform((v) =>
      typeof v === "number" ? v : v.trim() === "" ? null : Number(v.trim()),
    )
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), {
      message: "Custo inválido",
    })
    .optional()
    .nullable(),
  movement_reason: z.string().trim().max(120).optional().nullable(),
  observation: z.string().trim().max(500).optional().nullable(),
  client_datetime: z.string().optional().nullable(),
});

const RPC_ERROR_MAP: Record<string, string> = {
  not_authenticated: "Sessão expirada. Faça login novamente.",
  forbidden: "Você não tem permissão para movimentar estoque.",
  no_hospital: "Perfil sem hospital vinculado.",
  invalid_movement_type: "Tipo de movimento inválido.",
  product_required: "Produto obrigatório.",
  product_not_found: "Produto não encontrado.",
  stock_center_required: "Local de estoque obrigatório.",
  invalid_stock_center: "Local de estoque inválido ou fora do seu hospital.",
  invalid_transfer_destination: "Destino da transferência inválido.",
  invalid_quantity: "Quantidade deve ser maior que zero.",
  batch_required: "Este produto exige lote.",
  expiration_required: "Este produto exige data de validade.",
  expiration_in_past: "A validade não pode ser anterior a hoje.",
  stock_not_found: "Não há estoque para este produto/lote no local informado.",
  insufficient_stock: "Estoque insuficiente para esta saída.",
};

export interface RegisterMovementResult {
  movement_id: string;
  stock_item_id: string;
  transfer_group_id: string | null;
}

export const registerMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => registerSchema.parse(input))
  .handler(async ({ data, context }): Promise<RegisterMovementResult> => {
    const { data: res, error } = await context.supabase.rpc("register_movement", {
      p: data as never,
    });
    if (error) {
      const msg = error.message ?? "";
      const key = Object.keys(RPC_ERROR_MAP).find((k) => msg.includes(k));
      throw new Error(key ? RPC_ERROR_MAP[key] : msg);
    }
    return res as unknown as RegisterMovementResult;
  });

// ---------- Recent movements ----------
export interface RecentMovement {
  id: string;
  movement_type: MovementType;
  occurred_at: string;
  quantity: number;
  batch: string | null;
  expiration_date: string | null;
  unit_cost: number | null;
  product_id: string;
  product_description: string;
  product_barcode: string | null;
  stock_center_id: string;
  stock_center_name: string;
  stock_center_dest_id: string | null;
  stock_center_dest_name: string | null;
  user_id: string | null;
  user_name: string | null;
  movement_reason: string | null;
  observation: string | null;
}

const listSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  movement_type: z.enum(MOVEMENT_TYPES).optional(),
  stock_center_id: z.string().uuid().optional(),
});

export const listRecentMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<RecentMovement[]> => {
    let q = context.supabase
      .from("movements")
      .select(
        `id, movement_type, occurred_at, quantity, batch, expiration_date, unit_cost,
         product_id, stock_center_id, stock_center_dest_id, user_id,
         movement_reason, observation,
         products(description, barcode),
         center:stock_centers!movements_stock_center_id_fkey(name),
         dest:stock_centers!movements_stock_center_dest_id_fkey(name)`,
      )
      .order("occurred_at", { ascending: false })
      .limit(data.limit ?? 20);
    if (data.movement_type) q = q.eq("movement_type", data.movement_type);
    if (data.stock_center_id) q = q.eq("stock_center_id", data.stock_center_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{
      id: string; movement_type: MovementType; occurred_at: string;
      quantity: number | string; batch: string | null; expiration_date: string | null;
      unit_cost: number | string | null; product_id: string;
      stock_center_id: string; stock_center_dest_id: string | null;
      user_id: string | null; movement_reason: string | null; observation: string | null;
      products: { description: string; barcode: string | null } | null;
      center: { name: string } | null;
      dest: { name: string } | null;
    }>;
    const userIds = Array.from(new Set(list.map((r) => r.user_id).filter((v): v is string => !!v)));
    const names = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("id, full_name").in("id", userIds);
      ((profs ?? []) as Array<{ id: string; full_name: string | null }>).forEach((p) => {
        if (p.full_name) names.set(p.id, p.full_name);
      });
    }
    return list.map((r) => ({
      id: r.id,
      movement_type: r.movement_type,
      occurred_at: r.occurred_at,
      quantity: Number(r.quantity),
      batch: r.batch,
      expiration_date: r.expiration_date,
      unit_cost: r.unit_cost == null ? null : Number(r.unit_cost),
      product_id: r.product_id,
      product_description: r.products?.description ?? "—",
      product_barcode: r.products?.barcode ?? null,
      stock_center_id: r.stock_center_id,
      stock_center_name: r.center?.name ?? "—",
      stock_center_dest_id: r.stock_center_dest_id,
      stock_center_dest_name: r.dest?.name ?? null,
      user_id: r.user_id,
      user_name: r.user_id ? names.get(r.user_id) ?? null : null,
      movement_reason: r.movement_reason,
      observation: r.observation,
    }));
  });

// ---------- Alerts + health ----------
export type AlertKind =
  | "out_of_stock" | "critical_stock" | "low_stock"
  | "expired" | "expiring_7" | "expiring_30" | "expiring_60" | "expiring_90"
  | "no_movement_30" | "no_movement_60" | "no_movement_90" | "no_movement_180" | "no_movement_365";

export interface StockAlert {
  hospital_id: string;
  product_id: string;
  stock_center_id: string;
  description: string;
  alert_kind: AlertKind;
  metric: number;
  ref_date: string | null;
}

export const listStockAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(500).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<StockAlert[]> => {
    const { data: rows, error } = await context.supabase
      .from("v_stock_alerts")
      .select("*")
      .not("alert_kind", "is", null)
      .limit(data.limit ?? 100);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      hospital_id: r.hospital_id as string,
      product_id: r.product_id as string,
      stock_center_id: r.stock_center_id as string,
      description: r.description as string,
      alert_kind: r.alert_kind as AlertKind,
      metric: Number(r.metric ?? 0),
      ref_date: (r.ref_date as string) ?? null,
    }));
  });

export interface StockHealthRow {
  product_id: string;
  stock_center_id: string;
  description: string;
  current_stock: number;
  minimum_stock: number | null;
  maximum_stock: number | null;
  coverage_days: number | null;
  stock_value: number;
  last_movement_at: string | null;
}

export const getStockHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        product_id: z.string().uuid().optional(),
        stock_center_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<StockHealthRow[]> => {
    let q = context.supabase
      .from("v_stock_health")
      .select(
        "product_id, stock_center_id, description, current_stock, minimum_stock, maximum_stock, coverage_days, stock_value, last_movement_at",
      )
      .limit(data.limit ?? 100);
    if (data.product_id) q = q.eq("product_id", data.product_id);
    if (data.stock_center_id) q = q.eq("stock_center_id", data.stock_center_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      product_id: r.product_id as string,
      stock_center_id: r.stock_center_id as string,
      description: r.description as string,
      current_stock: Number(r.current_stock ?? 0),
      minimum_stock: r.minimum_stock == null ? null : Number(r.minimum_stock),
      maximum_stock: r.maximum_stock == null ? null : Number(r.maximum_stock),
      coverage_days: r.coverage_days == null ? null : Number(r.coverage_days),
      stock_value: Number(r.stock_value ?? 0),
      last_movement_at: (r.last_movement_at as string) ?? null,
    }));
  });
