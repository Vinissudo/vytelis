import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Produto para recebimento ----------
export interface ReceivingProduct {
  id: string;
  gtin: string | null;
  barcode: string | null;
  internal_code: string | null;
  description: string;
  manufacturer: string | null;
  category_id: string | null;
  default_supplier_id: string | null;
  purchase_unit: string | null;
  consumption_unit: string | null;
  package_quantity: number;
  cold_chain: boolean;
  allows_fractioning: boolean;
  controlled_drug: boolean;
  requires_batch: boolean;
  requires_expiration_date: boolean;
  minimum_stock: number | null;
  maximum_stock: number | null;
  active: boolean;
}

const PRODUCT_COLS = `id, gtin, barcode, internal_code, description, manufacturer, category_id,
  default_supplier_id, purchase_unit, consumption_unit, package_quantity, cold_chain,
  allows_fractioning, controlled_drug, requires_batch, requires_expiration_date,
  minimum_stock, maximum_stock, active`;

function toProduct(row: Record<string, unknown>): ReceivingProduct {
  return {
    id: row.id as string,
    gtin: (row.gtin as string) ?? null,
    barcode: (row.barcode as string) ?? null,
    internal_code: (row.internal_code as string) ?? null,
    description: row.description as string,
    manufacturer: (row.manufacturer as string) ?? null,
    category_id: (row.category_id as string) ?? null,
    default_supplier_id: (row.default_supplier_id as string) ?? null,
    purchase_unit: (row.purchase_unit as string) ?? null,
    consumption_unit: (row.consumption_unit as string) ?? null,
    package_quantity: Number(row.package_quantity ?? 1),
    cold_chain: Boolean(row.cold_chain),
    allows_fractioning: Boolean(row.allows_fractioning),
    controlled_drug: Boolean(row.controlled_drug),
    requires_batch: Boolean(row.requires_batch),
    requires_expiration_date: Boolean(row.requires_expiration_date),
    minimum_stock: row.minimum_stock == null ? null : Number(row.minimum_stock),
    maximum_stock: row.maximum_stock == null ? null : Number(row.maximum_stock),
    active: Boolean(row.active),
  };
}

/** Busca por GTIN/EAN/código interno — aceita as variações geradas pelo GS1Parser. */
export const findProductByKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ keys: z.array(z.string().trim().min(1).max(60)).min(1).max(8) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ReceivingProduct | null> => {
    const list = data.keys.map((k) => `"${k.replace(/"/g, "")}"`).join(",");
    const { data: rows, error } = await context.supabase
      .from("products")
      .select(PRODUCT_COLS)
      .is("deleted_at", null)
      .or(`gtin.in.(${list}),barcode.in.(${list}),internal_code.in.(${list})`)
      .limit(1);
    if (error) throw new Error(error.message);
    if (rows && rows.length > 0) return toProduct(rows[0] as Record<string, unknown>);

    const { data: alt, error: ae } = await context.supabase
      .from("product_gtins")
      .select(`product_id, products(${PRODUCT_COLS})`)
      .in("gtin", data.keys)
      .limit(1);
    if (ae) throw new Error(ae.message);
    const linked = (alt ?? [])[0] as unknown as
      | { products: Record<string, unknown> | null }
      | undefined;
    return linked?.products ? toProduct(linked.products) : null;
  });

/** Busca textual usada na entrada manual. */
export const searchReceivingProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ q: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ReceivingProduct[]> => {
    const term = data.q.replace(/[%_]/g, (m) => `\\${m}`);
    const like = `%${term}%`;
    const { data: rows, error } = await context.supabase
      .from("products")
      .select(PRODUCT_COLS)
      .is("deleted_at", null)
      .or(
        `description.ilike.${like},gtin.ilike.${like},barcode.ilike.${like},internal_code.ilike.${like}`,
      )
      .order("description")
      .limit(15);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map(toProduct);
  });

// ---------- Fornecedores ----------
export interface SupplierOption {
  id: string;
  name: string;
  cnpj: string | null;
}

export const listReceivingSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SupplierOption[]> => {
    const { data, error } = await context.supabase
      .from("suppliers")
      .select("id, name, cnpj")
      .is("deleted_at", null)
      .eq("active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as SupplierOption[];
  });

/** Localiza (ou cria) o fornecedor da NF-e pelo CNPJ. */
export const ensureSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(200),
        cnpj: z.string().trim().max(20).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<SupplierOption> => {
    const cnpj = data.cnpj?.replace(/\D/g, "") || null;
    if (cnpj) {
      const { data: found } = await context.supabase
        .from("suppliers")
        .select("id, name, cnpj")
        .eq("cnpj", cnpj)
        .is("deleted_at", null)
        .maybeSingle();
      if (found) return found as SupplierOption;
    }
    const { data: byName } = await context.supabase
      .from("suppliers")
      .select("id, name, cnpj")
      .eq("name", data.name)
      .is("deleted_at", null)
      .maybeSingle();
    if (byName) return byName as SupplierOption;

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("hospital_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.hospital_id) throw new Error("Perfil sem hospital vinculado.");

    const { data: created, error } = await context.supabase
      .from("suppliers")
      .insert({
        hospital_id: profile.hospital_id,
        name: data.name,
        cnpj,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id, name, cnpj")
      .single();
    if (error) throw new Error(error.message);
    return created as SupplierOption;
  });

// ---------- Recebimento ----------
const receiptSchema = z.object({
  source: z.enum(["xml", "gs1", "manual"]),
  supplier_id: z.string().uuid().optional().nullable(),
  stock_center_id: z.string().uuid().optional().nullable(),
  nfe_key: z.string().trim().max(60).optional().nullable(),
  nfe_number: z.string().trim().max(30).optional().nullable(),
  nfe_series: z.string().trim().max(10).optional().nullable(),
  issue_date: z.string().trim().optional().nullable(),
  total_value: z.number().optional().nullable(),
  observation: z.string().trim().max(500).optional().nullable(),
});

export interface ReceiptRow {
  id: string;
  source: "xml" | "gs1" | "manual";
  status: "draft" | "completed" | "cancelled";
  supplier_id: string | null;
  supplier_name: string | null;
  nfe_key: string | null;
  nfe_number: string | null;
  issue_date: string | null;
  total_value: number | null;
  created_at: string;
  item_count: number;
}

export const createReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => receiptSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("hospital_id, stock_center_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.hospital_id) throw new Error("Perfil sem hospital vinculado.");

    if (data.nfe_key) {
      const { data: dup } = await context.supabase
        .from("receipts")
        .select("id")
        .eq("nfe_key", data.nfe_key)
        .maybeSingle();
      if (dup) return { id: (dup as { id: string }).id };
    }

    const { data: row, error } = await context.supabase
      .from("receipts")
      .insert({
        hospital_id: profile.hospital_id,
        stock_center_id: data.stock_center_id ?? profile.stock_center_id ?? null,
        supplier_id: data.supplier_id ?? null,
        source: data.source,
        nfe_key: data.nfe_key || null,
        nfe_number: data.nfe_number || null,
        nfe_series: data.nfe_series || null,
        issue_date: data.issue_date || null,
        total_value: data.total_value ?? null,
        observation: data.observation || null,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row as { id: string };
  });

export const completeReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("receipts")
      .update({ status: "completed", updated_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RPC_ERROR_MAP: Record<string, string> = {
  not_authenticated: "Sessão expirada. Faça login novamente.",
  forbidden: "Você não tem permissão para receber mercadorias.",
  no_hospital: "Perfil sem hospital vinculado.",
  stock_center_required: "Informe o centro de estoque de destino.",
  invalid_stock_center: "Centro de estoque inválido ou fora do seu hospital.",
  product_required: "Produto obrigatório.",
  product_not_found: "Produto não encontrado.",
  invalid_quantity: "Quantidade deve ser maior que zero.",
  invalid_package_quantity: "Quantidade por embalagem inválida.",
  batch_required: "Este produto exige lote.",
  expiration_required: "Este produto exige data de validade.",
  expiration_in_past: "A validade não pode ser anterior a hoje.",
};

const receiveSchema = z.object({
  product_id: z.string().uuid(),
  stock_center_id: z.string().uuid().optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
  receipt_id: z.string().uuid().optional().nullable(),
  source: z.enum(["xml", "gs1", "manual"]),
  gtin: z.string().trim().max(20).optional().nullable(),
  supplier_code: z.string().trim().max(60).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  batch: z.string().trim().max(60).optional().nullable(),
  expiration_date: z.string().trim().optional().nullable(),
  manufacture_date: z.string().trim().optional().nullable(),
  purchase_unit: z.string().trim().max(20).optional().nullable(),
  purchase_quantity: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "number" ? v : Number(String(v).trim())))
    .refine((v) => Number.isFinite(v) && v > 0, { message: "Quantidade inválida" }),
  package_quantity: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "number" ? v : Number(String(v).trim())))
    .refine((v) => Number.isFinite(v) && v > 0, { message: "Embalagem inválida" }),
  unit_cost: z
    .union([z.number(), z.string()])
    .transform((v) =>
      typeof v === "number" ? v : String(v).trim() === "" ? null : Number(String(v).trim()),
    )
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), { message: "Custo inválido" })
    .optional()
    .nullable(),
  observation: z.string().trim().max(500).optional().nullable(),
  client_datetime: z.string().optional().nullable(),
});

export interface ReceiveResult {
  product_id: string;
  stock_item_id: string;
  movement_id: string;
  consumption_quantity: number;
}

/** Entrada única: converte para unidade de consumo, atualiza lote, movimenta e audita. */
export const receiveProductBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => receiveSchema.parse(input))
  .handler(async ({ data, context }): Promise<ReceiveResult> => {
    const { data: res, error } = await context.supabase.rpc("receive_product_batch", {
      p: data as never,
    });
    if (error) {
      const msg = error.message ?? "";
      const key = Object.keys(RPC_ERROR_MAP).find((k) => msg.includes(k));
      throw new Error(key ? RPC_ERROR_MAP[key] : msg);
    }
    const out = res as unknown as ReceiveResult;
    return { ...out, consumption_quantity: Number(out.consumption_quantity) };
  });

export const listReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(50).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<ReceiptRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("receipts")
      .select(
        `id, source, status, supplier_id, nfe_key, nfe_number, issue_date, total_value,
         created_at, suppliers(name), receipt_items(id)`,
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 15);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      source: r.source as ReceiptRow["source"],
      status: r.status as ReceiptRow["status"],
      supplier_id: (r.supplier_id as string) ?? null,
      supplier_name: (r.suppliers as { name: string } | null)?.name ?? null,
      nfe_key: (r.nfe_key as string) ?? null,
      nfe_number: (r.nfe_number as string) ?? null,
      issue_date: (r.issue_date as string) ?? null,
      total_value: r.total_value == null ? null : Number(r.total_value),
      created_at: r.created_at as string,
      item_count: ((r.receipt_items as unknown[]) ?? []).length,
    }));
  });
