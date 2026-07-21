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

const productPayload = z.object({
  id: z.string().uuid().optional(),
  barcode: z.string().trim().optional(),
  internal_code: z.string().trim().optional(),
  description: z.string().trim().min(1).max(500).optional(),
  short_description: z.string().trim().max(120).optional(),
  manufacturer: z.string().trim().max(200).optional(),
  unit: z.string().trim().max(20).optional(),
  category_id: z.string().uuid().optional().or(z.literal("")),
  default_supplier_id: z.string().uuid().optional().or(z.literal("")),
  controlled_drug: z.boolean().optional(),
  requires_batch: z.boolean().optional(),
  requires_expiration_date: z.boolean().optional(),
  minimum_stock: z.union([z.number(), z.string()]).optional(),
  maximum_stock: z.union([z.number(), z.string()]).optional(),
});

const entryPayload = z.object({
  stock_center_id: z.string().uuid().optional(),
  batch: z.string().trim().max(60).optional(),
  expiration_date: z.string().trim().optional(),
  quantity: z.union([z.number(), z.string()]),
  unit_cost: z.union([z.number(), z.string()]).optional(),
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
    const [cats, sups, centers] = await Promise.all([
      context.supabase.from("categories").select("id, name").is("deleted_at", null).eq("active", true).order("name"),
      context.supabase.from("suppliers").select("id, name").is("deleted_at", null).eq("active", true).order("name"),
      context.supabase.from("stock_centers").select("id, name").eq("active", true).order("name"),
    ]);
    if (cats.error) throw new Error(cats.error.message);
    if (sups.error) throw new Error(sups.error.message);
    if (centers.error) throw new Error(centers.error.message);
    return {
      categories: (cats.data ?? []) as RefOption[],
      suppliers: (sups.data ?? []) as RefOption[],
      stockCenters: (centers.data ?? []) as RefOption[],
    };
  });
