import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const barcodeSchema = z.object({ barcode: z.string().trim().min(1).max(120) });

export interface ProductLookup {
  id: string;
  internal_code: string | null;
  barcode: string | null;
  description: string;
  short_description: string | null;
  manufacturer: string | null;
  unit: string | null;
  category_id: string | null;
  default_supplier_id: string | null;
  controlled_drug: boolean;
  requires_batch: boolean;
  requires_expiration_date: boolean;
  minimum_stock: number | null;
  maximum_stock: number | null;
}

export const lookupProductByBarcode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => barcodeSchema.parse(input))
  .handler(async ({ data, context }): Promise<ProductLookup | null> => {
    const { data: row, error } = await context.supabase
      .from("products")
      .select(
        "id, internal_code, barcode, description, short_description, manufacturer, unit, category_id, default_supplier_id, controlled_drug, requires_batch, requires_expiration_date, minimum_stock, maximum_stock",
      )
      .eq("barcode", data.barcode)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as ProductLookup | null) ?? null;
  });

const numericString = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "number" ? v : v.trim()))
  .refine((v) => v === "" || !Number.isNaN(Number(v)), { message: "Valor numérico inválido" });

const productPayload = z.object({
  id: z.string().uuid().optional(),
  barcode: z.string().trim().max(120).optional(),
  internal_code: z.string().trim().max(60).optional(),
  description: z.string().trim().min(2, "Descrição obrigatória").max(500).optional(),
  short_description: z.string().trim().max(120).optional(),
  manufacturer: z.string().trim().max(200).optional(),
  unit: z.string().trim().max(20).optional(),
  category_id: z.string().uuid().optional().or(z.literal("")),
  default_supplier_id: z.string().uuid().optional().or(z.literal("")),
  controlled_drug: z.boolean().optional(),
  requires_batch: z.boolean().optional(),
  requires_expiration_date: z.boolean().optional(),
  minimum_stock: numericString.optional(),
  maximum_stock: numericString.optional(),
});

const entryPayload = z.object({
  stock_center_id: z.string().uuid().optional(),
  batch: z.string().trim().max(60).optional(),
  expiration_date: z.string().trim().optional(),
  quantity: numericString.refine(
    (v) => v !== "" && Number(v) > 0,
    { message: "A quantidade deve ser maior que zero" },
  ),
  unit_cost: numericString
    .refine((v) => v === "" || Number(v) >= 0, { message: "O custo não pode ser negativo" })
    .optional(),
  observation: z.string().trim().max(500).optional(),
});

const createSchema = z.object({
  product: productPayload,
  entry: entryPayload,
});

export const createProductWithInitialEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "create_product_with_initial_entry",
      {
        p_product: data.product as never,
        p_entry: data.entry as never,
      },
    );
    if (error) {
      const map: Record<string, string> = {
        duplicate_barcode: "Já existe um produto ativo com este código de barras.",
        duplicate_internal_code: "Já existe um produto ativo com este código interno.",
        invalid_quantity: "A quantidade deve ser maior que zero.",
        invalid_cost: "Custo inválido — informe um valor igual ou maior que zero.",
        invalid_description: "Descrição do produto é obrigatória (mínimo 2 caracteres).",
        invalid_stock_center: "Local de estoque inválido ou inativo.",
        stock_center_hospital_mismatch: "Local de estoque não pertence ao seu hospital.",
        no_stock_center: "Nenhum local de estoque disponível para o seu hospital.",
        no_hospital: "Perfil sem hospital vinculado. Contate o administrador.",
        forbidden: "Você não tem permissão para cadastrar produtos.",
        not_authenticated: "Sessão expirada. Faça login novamente.",
        product_not_found: "Produto não encontrado ou removido.",
        batch_required: "Este produto exige informação de lote.",
        expiration_required: "Este produto exige data de validade.",
        expiration_in_past: "A data de validade não pode ser anterior a hoje.",
      };
      const msg = map[error.message] ?? error.message;
      throw new Error(msg);
    }
    return result as { product_id: string; stock_item_id: string };
  });

export interface RefOption { id: string; name: string }

export const listMasterRefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [cats, sups, centers, mans] = await Promise.all([
      context.supabase.from("categories").select("id, name").is("deleted_at", null).eq("active", true).order("name"),
      context.supabase.from("suppliers").select("id, name").is("deleted_at", null).eq("active", true).order("name"),
      context.supabase.from("stock_centers").select("id, name").eq("active", true).order("name"),
      context.supabase.from("products").select("manufacturer").is("deleted_at", null).not("manufacturer", "is", null),
    ]);
    if (cats.error) throw new Error(cats.error.message);
    if (sups.error) throw new Error(sups.error.message);
    if (centers.error) throw new Error(centers.error.message);
    if (mans.error) throw new Error(mans.error.message);
    const manufacturers = Array.from(
      new Set(((mans.data ?? []) as { manufacturer: string | null }[])
        .map((r) => (r.manufacturer ?? "").trim())
        .filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
    return {
      categories: (cats.data ?? []) as RefOption[],
      suppliers: (sups.data ?? []) as RefOption[],
      stockCenters: (centers.data ?? []) as RefOption[],
      manufacturers,
    };
  });

const nameSchema = z.object({ name: z.string().trim().min(2).max(120) });

export const createCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => nameSchema.parse(input))
  .handler(async ({ data, context }): Promise<RefOption> => {
    const { data: prof, error: pe } = await context.supabase
      .from("profiles").select("hospital_id").eq("id", context.userId).maybeSingle();
    if (pe) throw new Error(pe.message);
    const hospital_id = (prof as { hospital_id: string | null } | null)?.hospital_id;
    if (!hospital_id) throw new Error("Perfil sem hospital vinculado.");
    const { data: row, error } = await context.supabase
      .from("categories")
      .insert({ name: data.name, hospital_id, active: true, created_by: context.userId, updated_by: context.userId })
      .select("id, name").single();
    if (error) throw new Error(error.message);
    return row as RefOption;
  });

export const createSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => nameSchema.parse(input))
  .handler(async ({ data, context }): Promise<RefOption> => {
    const { data: prof, error: pe } = await context.supabase
      .from("profiles").select("hospital_id").eq("id", context.userId).maybeSingle();
    if (pe) throw new Error(pe.message);
    const hospital_id = (prof as { hospital_id: string | null } | null)?.hospital_id;
    if (!hospital_id) throw new Error("Perfil sem hospital vinculado.");
    const { data: row, error } = await context.supabase
      .from("suppliers")
      .insert({ name: data.name, hospital_id, active: true, created_by: context.userId, updated_by: context.userId })
      .select("id, name").single();
    if (error) throw new Error(error.message);
    return row as RefOption;
  });

export interface ProductSummary {
  current_stock: number;
  last_batch: string | null;
  last_expiration: string | null;
  last_entry_at: string | null;
}

const idSchema = z.object({ product_id: z.string().uuid() });

export const getProductSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }): Promise<ProductSummary> => {
    const [{ data: items, error: ie }, { data: last, error: le }] = await Promise.all([
      context.supabase
        .from("stock_items")
        .select("quantity")
        .eq("product_id", data.product_id)
        .is("deleted_at", null),
      context.supabase
        .from("stock_items")
        .select("batch, expiration_date, created_at")
        .eq("product_id", data.product_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (ie) throw new Error(ie.message);
    if (le) throw new Error(le.message);
    const current_stock = ((items ?? []) as { quantity: number | string }[])
      .reduce((s, r) => s + Number(r.quantity ?? 0), 0);
    const row = last as { batch: string | null; expiration_date: string | null; created_at: string } | null;
    return {
      current_stock,
      last_batch: row?.batch ?? null,
      last_expiration: row?.expiration_date ?? null,
      last_entry_at: row?.created_at ?? null,
    };
  });

export interface RecentEntry {
  id: string;
  occurred_at: string;
  quantity: number;
  batch: string | null;
  barcode: string | null;
  description: string;
  user_name: string | null;
}

export const listRecentEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RecentEntry[]> => {
    const { data, error } = await context.supabase
      .from("movements")
      .select("id, occurred_at, quantity, batch, user_id, products(barcode, description)")
      .eq("movement_type", "initial_entry")
      .order("occurred_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      id: string; occurred_at: string; quantity: number; batch: string | null; user_id: string | null;
      products: { barcode: string | null; description: string } | null;
    }>;
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v)));
    const names = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("id, full_name").in("id", userIds);
      ((profs ?? []) as { id: string; full_name: string | null }[]).forEach((p) => {
        if (p.full_name) names.set(p.id, p.full_name);
      });
    }
    return rows.map((r) => ({
      id: r.id,
      occurred_at: r.occurred_at,
      quantity: Number(r.quantity),
      batch: r.batch,
      barcode: r.products?.barcode ?? null,
      description: r.products?.description ?? "—",
      user_name: r.user_id ? names.get(r.user_id) ?? null : null,
    }));
  });

export interface ImplementationStats {
  today: number;
  total: number;
  goal: number;
}

export const getImplementationStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImplementationStats> => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [{ count: today, error: te }, { count: total, error: toe }] = await Promise.all([
      context.supabase
        .from("products").select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", startOfDay.toISOString()),
      context.supabase
        .from("products").select("id", { count: "exact", head: true })
        .is("deleted_at", null),
    ]);
    if (te) throw new Error(te.message);
    if (toe) throw new Error(toe.message);
    return { today: today ?? 0, total: total ?? 0, goal: 1500 };
  });
