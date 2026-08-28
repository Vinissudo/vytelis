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

const PRODUCT_COLS =
  "id, internal_code, barcode, description, short_description, manufacturer, unit, category_id, default_supplier_id, controlled_drug, requires_batch, requires_expiration_date, minimum_stock, maximum_stock";

export const lookupProductByBarcode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => barcodeSchema.parse(input))
  .handler(async ({ data, context }): Promise<ProductLookup | null> => {
    const { data: row, error } = await context.supabase
      .from("products")
      .select(PRODUCT_COLS)
      .eq("barcode", data.barcode)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as ProductLookup | null) ?? null;
  });

const searchSchema = z.object({ q: z.string().trim().min(1).max(120) });

export const searchProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchSchema.parse(input))
  .handler(async ({ data, context }): Promise<ProductLookup[]> => {
    const term = data.q.replace(/[%_]/g, (m) => `\\${m}`);
    const pattern = `%${term}%`;
    const { data: rows, error } = await context.supabase
      .from("products")
      .select(PRODUCT_COLS)
      .is("deleted_at", null)
      .or(
        `barcode.ilike.${pattern},internal_code.ilike.${pattern},description.ilike.${pattern},short_description.ilike.${pattern}`,
      )
      .order("description", { ascending: true })
      .limit(15);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ProductLookup[];
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

const RPC_ERROR_MAP: Record<string, string> = {
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
      throw new Error(RPC_ERROR_MAP[error.message] ?? error.message);
    }
    return result as { product_id: string; stock_item_id: string };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    barcode: z.string().trim().max(120).nullable().optional(),
    internal_code: z.string().trim().max(60).nullable().optional(),
    description: z.string().trim().min(2).max(500).optional(),
    short_description: z.string().trim().max(120).nullable().optional(),
    manufacturer: z.string().trim().max(200).nullable().optional(),
    unit: z.string().trim().max(20).nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    default_supplier_id: z.string().uuid().nullable().optional(),
    controlled_drug: z.boolean().optional(),
    requires_batch: z.boolean().optional(),
    requires_expiration_date: z.boolean().optional(),
    minimum_stock: numericString.optional(),
    maximum_stock: numericString.optional(),
    active: z.boolean().optional(),
  }),
});

export const updateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }): Promise<ProductLookup> => {
    const p = data.patch;
    const norm = (v: string | null | undefined) =>
      v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim();
    const num = (v: string | number | undefined) =>
      v === undefined || v === "" ? undefined : Number(v);

    const patch: Record<string, unknown> = {
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (p.description !== undefined) patch.description = p.description.trim();
    if (p.barcode !== undefined) patch.barcode = norm(p.barcode);
    if (p.internal_code !== undefined) patch.internal_code = norm(p.internal_code);
    if (p.short_description !== undefined) patch.short_description = norm(p.short_description);
    if (p.manufacturer !== undefined) patch.manufacturer = norm(p.manufacturer);
    if (p.unit !== undefined) patch.unit = norm(p.unit);
    if (p.category_id !== undefined) patch.category_id = p.category_id || null;
    if (p.default_supplier_id !== undefined)
      patch.default_supplier_id = p.default_supplier_id || null;
    if (p.controlled_drug !== undefined) patch.controlled_drug = p.controlled_drug;
    if (p.requires_batch !== undefined) patch.requires_batch = p.requires_batch;
    if (p.requires_expiration_date !== undefined)
      patch.requires_expiration_date = p.requires_expiration_date;
    if (p.minimum_stock !== undefined) patch.minimum_stock = num(p.minimum_stock) ?? null;
    if (p.maximum_stock !== undefined) patch.maximum_stock = num(p.maximum_stock) ?? null;
    if (p.active !== undefined) patch.active = p.active;

    const { data: row, error } = await context.supabase
      .from("products")
      .update(patch as never)
      .eq("id", data.id)
      .is("deleted_at", null)
      .select(PRODUCT_COLS)
      .single();
    if (error) {
      if (error.code === "23505") {
        if (error.message.includes("barcode"))
          throw new Error("Já existe um produto ativo com este código de barras.");
        if (error.message.includes("internal_code"))
          throw new Error("Já existe um produto ativo com este código interno.");
      }
      throw new Error(error.message);
    }

    await context.supabase.from("audit_log").insert({
      user_id: context.userId,
      entity: "products",
      entity_id: data.id,
      action: "update",
      after: patch as never,
    });

    return row as ProductLookup;
  });

export interface RefOption { id: string; name: string }

export const listMasterRefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [cats, sups, centers, prods] = await Promise.all([
      context.supabase.from("categories").select("id, name").is("deleted_at", null).eq("active", true).order("name"),
      context.supabase.from("suppliers").select("id, name").is("deleted_at", null).eq("active", true).order("name"),
      context.supabase.from("stock_centers").select("id, name").eq("active", true).order("name"),
      context.supabase.from("products").select("manufacturer, unit").is("deleted_at", null),
    ]);
    if (cats.error) throw new Error(cats.error.message);
    if (sups.error) throw new Error(sups.error.message);
    if (centers.error) throw new Error(centers.error.message);
    if (prods.error) throw new Error(prods.error.message);
    const rows = (prods.data ?? []) as { manufacturer: string | null; unit: string | null }[];
    const manufacturers = Array.from(
      new Set(rows.map((r) => (r.manufacturer ?? "").trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
    const units = Array.from(
      new Set([
        "UN", "CX", "FR", "AMP", "CP", "ML", "MG", "G", "KG", "L",
        ...rows.map((r) => (r.unit ?? "").trim()).filter(Boolean),
      ]),
    ).sort((a, b) => a.localeCompare(b));
    return {
      categories: (cats.data ?? []) as RefOption[],
      suppliers: (sups.data ?? []) as RefOption[],
      stockCenters: (centers.data ?? []) as RefOption[],
      manufacturers,
      units,
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
    if (error) {
      if (error.code === "23505") throw new Error("Já existe uma categoria com este nome.");
      throw new Error(error.message);
    }
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
    if (error) {
      if (error.code === "23505") throw new Error("Já existe um fornecedor com este nome.");
      throw new Error(error.message);
    }
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
        .from("v_stock_balances")
        .select("quantity_available")
        .eq("product_id", data.product_id),
      context.supabase
        .from("v_stock_balances")
        .select("batch_code, expiration_date, updated_at")
        .eq("product_id", data.product_id)
        .order("expiration_date", { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (ie) throw new Error(ie.message);
    if (le) throw new Error(le.message);
    const current_stock = ((items ?? []) as unknown as { quantity_available: number | string }[])
      .reduce((s, r) => s + Number(r.quantity_available ?? 0), 0);
    const row = last as unknown as {
      batch_code: string | null; expiration_date: string | null; updated_at: string;
    } | null;
    return {
      current_stock,
      last_batch: row?.batch_code ?? null,
      last_expiration: row?.expiration_date ?? null,
      last_entry_at: row?.updated_at ?? null,
    };

  });

export interface RecentEntry {
  id: string;
  product_id: string;
  occurred_at: string;
  quantity: number;
  batch: string | null;
  barcode: string | null;
  description: string;
  category_name: string | null;
  user_name: string | null;
}

export const listRecentEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RecentEntry[]> => {
    const { data, error } = await context.supabase
      .from("movements")
      .select(
        "id, occurred_at, quantity, batch, user_id, product_id, products(barcode, description, category_id)",
      )
      .eq("movement_type", "initial_entry")
      .order("occurred_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      id: string; occurred_at: string; quantity: number; batch: string | null;
      user_id: string | null; product_id: string;
      products: { barcode: string | null; description: string; category_id: string | null } | null;
    }>;
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v)));
    const catIds = Array.from(
      new Set(rows.map((r) => r.products?.category_id).filter((v): v is string => !!v)),
    );
    const names = new Map<string, string>();
    const cats = new Map<string, string>();
    await Promise.all([
      userIds.length
        ? context.supabase.from("profiles").select("id, full_name").in("id", userIds).then((r) => {
            ((r.data ?? []) as { id: string; full_name: string | null }[]).forEach((p) => {
              if (p.full_name) names.set(p.id, p.full_name);
            });
          })
        : Promise.resolve(),
      catIds.length
        ? context.supabase.from("categories").select("id, name").in("id", catIds).then((r) => {
            ((r.data ?? []) as { id: string; name: string }[]).forEach((c) => cats.set(c.id, c.name));
          })
        : Promise.resolve(),
    ]);
    return rows.map((r) => ({
      id: r.id,
      product_id: r.product_id,
      occurred_at: r.occurred_at,
      quantity: Number(r.quantity),
      batch: r.batch,
      barcode: r.products?.barcode ?? null,
      description: r.products?.description ?? "—",
      category_name: r.products?.category_id ? cats.get(r.products.category_id) ?? null : null,
      user_name: r.user_id ? names.get(r.user_id) ?? null : null,
    }));
  });

export interface ImplementationStats {
  today: number;
  week: number;
  total: number;
  goal: number;
}

export const getImplementationStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImplementationStats> => {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfDay);
    // Monday-based week
    const day = startOfWeek.getDay(); // 0=Sun
    const diff = (day + 6) % 7;
    startOfWeek.setDate(startOfWeek.getDate() - diff);
    const [tRes, wRes, totRes] = await Promise.all([
      context.supabase
        .from("products").select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", startOfDay.toISOString()),
      context.supabase
        .from("products").select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", startOfWeek.toISOString()),
      context.supabase
        .from("products").select("id", { count: "exact", head: true })
        .is("deleted_at", null),
    ]);
    if (tRes.error) throw new Error(tRes.error.message);
    if (wRes.error) throw new Error(wRes.error.message);
    if (totRes.error) throw new Error(totRes.error.message);
    return {
      today: tRes.count ?? 0,
      week: wRes.count ?? 0,
      total: totRes.count ?? 0,
      goal: 1500,
    };
  });

/* ==========================================================================
 * Cadastro Operacional de Produtos (tela /produtos) — cadastro puro,
 * sem qualquer interação com o motor de estoque.
 * ======================================================================== */

const CREATE_PRODUCT_ERRORS: Record<string, string> = {
  not_authenticated: "Sessão expirada. Faça login novamente.",
  no_hospital: "Perfil sem hospital vinculado. Contate o administrador.",
  forbidden: "Você não tem permissão para cadastrar produtos.",
  invalid_description: "Informe uma descrição com pelo menos 2 caracteres.",
  invalid_consumption_unit: "A unidade de consumo é obrigatória.",
  invalid_package_quantity: "A quantidade por embalagem deve ser maior que zero.",
  duplicate_gtin: "Este GTIN já está cadastrado em outro produto.",
};

const catalogProductSchema = z.object({
  description: z.string().trim().min(2).max(500),
  short_description: z.string().trim().max(120).optional().nullable(),
  manufacturer: z.string().trim().max(200).optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  default_supplier_id: z.string().uuid().optional().nullable(),
  gtin: z.string().trim().max(60).optional().nullable(),
  purchase_unit: z.string().trim().max(20).optional().nullable(),
  consumption_unit: z.string().trim().min(1).max(20),
  package_quantity: z.coerce.number().positive(),
  controlled_drug: z.boolean().optional(),
  requires_batch: z.boolean().optional(),
  requires_expiration_date: z.boolean().optional(),
  cold_chain: z.boolean().optional(),
  allows_fractioning: z.boolean().optional(),
});

export const createProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => catalogProductSchema.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: true; id: string; internal_code: string }
      | { ok: false; error: string }
    > => {
      const { data: result, error } = await context.supabase.rpc("create_product", {
        p: data as never,
      });
      // Falhas de validação de negócio voltam como resultado, não como exceção,
      // para não derrubar a tela com um erro de runtime.
      if (error) {
        return { ok: false, error: CREATE_PRODUCT_ERRORS[error.message] ?? error.message };
      }
      const r = result as { id: string; internal_code: string };
      return { ok: true, id: r.id, internal_code: r.internal_code };
    },
  );


const updateCatalogSchema = z.object({
  id: z.string().uuid(),
  patch: catalogProductSchema.partial().omit({ gtin: true }),
});

export const updateCatalogProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateCatalogSchema.parse(input))
  .handler(async ({ data, context }) => {
    const p = data.patch;
    const norm = (v: string | null | undefined) =>
      v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim();
    const patch: Record<string, unknown> = {
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (p.description !== undefined) patch.description = p.description.trim();
    if (p.short_description !== undefined) patch.short_description = norm(p.short_description);
    if (p.manufacturer !== undefined) patch.manufacturer = norm(p.manufacturer);
    if (p.category_id !== undefined) patch.category_id = p.category_id || null;
    if (p.default_supplier_id !== undefined)
      patch.default_supplier_id = p.default_supplier_id || null;
    if (p.purchase_unit !== undefined) patch.purchase_unit = norm(p.purchase_unit);
    if (p.consumption_unit !== undefined) {
      patch.consumption_unit = norm(p.consumption_unit);
      patch.unit = norm(p.consumption_unit);
    }
    if (p.package_quantity !== undefined) patch.package_quantity = p.package_quantity;
    if (p.controlled_drug !== undefined) patch.controlled_drug = p.controlled_drug;
    if (p.requires_batch !== undefined) patch.requires_batch = p.requires_batch;
    if (p.requires_expiration_date !== undefined)
      patch.requires_expiration_date = p.requires_expiration_date;
    if (p.cold_chain !== undefined) patch.cold_chain = p.cold_chain;
    if (p.allows_fractioning !== undefined) patch.allows_fractioning = p.allows_fractioning;

    const { error } = await context.supabase
      .from("products")
      .update(patch as never)
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      user_id: context.userId,
      entity: "products",
      entity_id: data.id,
      action: "update",
      after: patch as never,
    });
    return { ok: true };
  });

export interface CatalogProduct {
  id: string;
  internal_code: string | null;
  description: string;
  short_description: string | null;
  manufacturer: string | null;
  category_id: string | null;
  default_supplier_id: string | null;
  gtin: string | null;
  barcode: string | null;
  purchase_unit: string | null;
  consumption_unit: string | null;
  unit: string | null;
  package_quantity: number;
  controlled_drug: boolean;
  requires_batch: boolean;
  requires_expiration_date: boolean;
  cold_chain: boolean;
  allows_fractioning: boolean;
  active: boolean;
}

const CATALOG_COLS =
  "id, internal_code, description, short_description, manufacturer, category_id, default_supplier_id, gtin, barcode, purchase_unit, consumption_unit, unit, package_quantity, controlled_drug, requires_batch, requires_expiration_date, cold_chain, allows_fractioning, active";

const catalogListSchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
});

export const listCatalogProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => catalogListSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<CatalogProduct[]> => {
    const term = (data.q ?? "").trim();
    let query = context.supabase
      .from("products")
      .select(CATALOG_COLS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (term) {
      const esc = term.replace(/[%_]/g, (m) => `\\${m}`);
      const pattern = `%${esc}%`;
      const { data: gtinRows } = await context.supabase
        .from("product_gtins")
        .select("product_id")
        .ilike("gtin", pattern)
        .limit(50);
      const ids = Array.from(
        new Set(((gtinRows ?? []) as { product_id: string }[]).map((r) => r.product_id)),
      );
      const clauses = [
        `internal_code.ilike.${pattern}`,
        `description.ilike.${pattern}`,
        `short_description.ilike.${pattern}`,
        `manufacturer.ilike.${pattern}`,
        `gtin.ilike.${pattern}`,
        `barcode.ilike.${pattern}`,
      ];
      if (ids.length) clauses.push(`id.in.(${ids.join(",")})`);
      query = query.or(clauses.join(","));
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as CatalogProduct[];
  });

export interface ProductGtin {
  id: string;
  product_id: string;
  gtin: string;
  packaging_level: string;
  quantity_per_gtin: number;
}

const productIdSchema = z.object({ product_id: z.string().uuid() });

export const listProductGtins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => productIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<ProductGtin[]> => {
    const { data: rows, error } = await context.supabase
      .from("product_gtins")
      .select("id, product_id, gtin, packaging_level, quantity_per_gtin")
      .eq("product_id", data.product_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ProductGtin[];
  });

const addGtinSchema = z.object({
  product_id: z.string().uuid(),
  gtin: z.string().trim().min(6).max(60),
  packaging_level: z.string().trim().max(30).optional(),
  quantity_per_gtin: z.coerce.number().positive().optional(),
});

export const addProductGtin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => addGtinSchema.parse(input))
  .handler(async ({ data, context }): Promise<ProductGtin> => {
    const { data: prof } = await context.supabase
      .from("profiles").select("hospital_id").eq("id", context.userId).maybeSingle();
    const hospital_id = (prof as { hospital_id: string | null } | null)?.hospital_id;
    if (!hospital_id) throw new Error("Perfil sem hospital vinculado.");

    const { data: dupProduct } = await context.supabase
      .from("products")
      .select("id")
      .is("deleted_at", null)
      .neq("id", data.product_id)
      .or(`gtin.eq.${data.gtin},barcode.eq.${data.gtin}`)
      .maybeSingle();
    if (dupProduct) throw new Error("Este GTIN já está cadastrado em outro produto.");

    const { data: row, error } = await context.supabase
      .from("product_gtins")
      .insert({
        hospital_id,
        product_id: data.product_id,
        gtin: data.gtin,
        packaging_level: data.packaging_level?.trim() || "each",
        quantity_per_gtin: data.quantity_per_gtin ?? 1,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id, product_id, gtin, packaging_level, quantity_per_gtin")
      .single();
    if (error) {
      if (error.code === "23505")
        throw new Error("Este GTIN já está cadastrado em outro produto.");
      throw new Error(error.message);
    }
    return row as ProductGtin;
  });

export const removeProductGtin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("product_gtins").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Aviso não bloqueante de produto semelhante (trigramas calculados no servidor). */
export const findSimilarProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ description: z.string().trim().min(2).max(500) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; description: string }[]> => {
    const words = data.description
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .slice(0, 3);
    if (!words.length) return [];
    const clauses = words.map((w) => `description.ilike.%${w.replace(/[%_]/g, "")}%`);
    const { data: rows } = await context.supabase
      .from("products")
      .select("id, description")
      .is("deleted_at", null)
      .eq("active", true)
      .or(clauses.join(","))
      .limit(50);

    const trigrams = (s: string) => {
      const t = ` ${s.toLowerCase().replace(/\s+/g, " ").trim()} `;
      const set = new Set<string>();
      for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
      return set;
    };
    const a = trigrams(data.description);
    return ((rows ?? []) as { id: string; description: string }[])
      .map((r) => {
        const b = trigrams(r.description);
        let inter = 0;
        a.forEach((g) => { if (b.has(g)) inter++; });
        return { ...r, score: inter / (a.size + b.size - inter || 1) };
      })
      .filter((r) => r.score > 0.6)
      .sort((x, y) => y.score - x.score)
      .slice(0, 3)
      .map(({ id, description }) => ({ id, description }));
  });
