import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================
// FASE 2 — Camada de acesso ao MOTOR CENTRAL DE ESTOQUE
// Nenhuma escrita de saldo acontece aqui: tudo passa por process_movement.
// ============================================================

export const MOVEMENT_KINDS = [
  "ENTRY",
  "TRANSFER",
  "DISPENSE",
  "RETURN",
  "LOSS",
  "ADJUSTMENT",
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = {
  ENTRY: "Entrada",
  TRANSFER: "Transferência",
  DISPENSE: "Saída / Dispensação",
  RETURN: "Devolução",
  LOSS: "Perda",
  ADJUSTMENT: "Ajuste",
};

/** Regras da Seção 7A — origem/destino por tipo. */
export const LOCATION_RULES: Record<
  MovementKind,
  { origin: "required" | "forbidden" | "optional" | "conditional"; destination: "required" | "forbidden" | "conditional" }
> = {
  ENTRY: { origin: "forbidden", destination: "required" },
  TRANSFER: { origin: "required", destination: "required" },
  DISPENSE: { origin: "required", destination: "forbidden" },
  RETURN: { origin: "optional", destination: "required" },
  LOSS: { origin: "required", destination: "forbidden" },
  ADJUSTMENT: { origin: "conditional", destination: "conditional" },
};

export const ENGINE_ERRORS: Record<string, string> = {
  NAO_AUTENTICADO: "Sessão expirada. Faça login novamente.",
  SEM_PERMISSAO: "Você não tem permissão para movimentar estoque.",
  HOSPITAL_NAO_ENCONTRADO: "Perfil sem hospital vinculado.",
  TIPO_MOVIMENTO_INVALIDO: "Tipo de movimentação inválido.",
  ALOCACOES_INVALIDAS: "Informe ao menos um lote e quantidade.",
  QUANTIDADE_INVALIDA: "Quantidade deve ser maior que zero.",
  LOTE_NAO_ENCONTRADO: "Lote não encontrado.",
  PRODUTO_NAO_ENCONTRADO: "Produto não encontrado.",
  LOCATION_NAO_ENCONTRADA: "Localização inválida ou fora do seu hospital.",
  SALDO_INSUFICIENTE: "Saldo insuficiente para esta operação.",
  SALDO_NEGATIVO_NAO_PERMITIDO: "Operação geraria saldo negativo.",
  LOTE_BLOQUEADO: "Lote bloqueado — não pode ser movimentado.",
  LOTE_VENCIDO: "Lote vencido — não pode ser movimentado.",
  AJUSTE_DIRECAO_INVALIDA: "Informe a direção do ajuste (aumento ou redução).",
  MOTIVO_OBRIGATORIO: "Motivo é obrigatório para esta operação.",
  OVERRIDE_MOTIVO_OBRIGATORIO:
    "Existe lote com validade anterior. Justifique a seleção manual (override do FEFO).",
  DOCUMENTO_OBRIGATORIO: "Documento de referência é obrigatório na devolução externa.",
  DESTINO_OBRIGATORIO: "Localização de destino é obrigatória.",
  ORIGEM_OBRIGATORIA: "Localização de origem é obrigatória.",
  ORIGEM_NAO_PERMITIDA_PARA_TIPO: "Este tipo de movimentação não aceita origem.",
  DESTINO_NAO_PERMITIDO_PARA_TIPO: "Este tipo de movimentação não aceita destino.",
  TRANSFERENCIA_MESMA_LOCATION: "Origem e destino devem ser diferentes.",
  LOTE_OBRIGATORIO: "Este produto exige lote.",
  VALIDADE_OBRIGATORIA: "Este produto exige data de validade.",
};

function mapEngineError(message: string): Error {
  const key = Object.keys(ENGINE_ERRORS).find((k) => message.includes(k));
  const err = new Error(key ? ENGINE_ERRORS[key] : message);
  if (key) (err as Error & { code?: string }).code = key;
  return err;
}

// ---------- Saldos ----------
export interface StockBalanceRow {
  id: string;
  product_id: string;
  batch_id: string;
  location_id: string;
  description: string;
  internal_code: string | null;
  barcode: string | null;
  unit: string | null;
  batch_code: string | null;
  expiration_date: string | null;
  batch_status: string;
  unit_cost: number | null;
  location_name: string;
  quantity_total: number;
  quantity_reserved: number;
  quantity_available: number;
  stock_value: number;
  min_quantity: number | null;
  max_quantity: number | null;
  replenishment_status: "OUT" | "CRITICAL" | "OVERSTOCK" | "OK";
  days_to_expire: number | null;
}

const balanceFilter = z.object({
  product_id: z.string().uuid().optional(),
  location_id: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

export const listStockBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => balanceFilter.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<StockBalanceRow[]> => {
    let q = context.supabase
      .from("v_stock_balances")
      .select("*")
      .order("description")
      .order("expiration_date", { ascending: true, nullsFirst: false })
      .limit(data.limit ?? 500);
    if (data.product_id) q = q.eq("product_id", data.product_id);
    if (data.location_id) q = q.eq("location_id", data.location_id);
    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      q = q.or(
        `description.ilike.${like},barcode.ilike.${like},internal_code.ilike.${like},batch_code.ilike.${like}`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      product_id: r.product_id as string,
      batch_id: r.batch_id as string,
      location_id: r.location_id as string,
      description: r.description as string,
      internal_code: (r.internal_code as string) ?? null,
      barcode: (r.barcode as string) ?? null,
      unit: (r.consumption_unit as string) ?? (r.unit as string) ?? null,
      batch_code: (r.batch_code as string) ?? null,
      expiration_date: (r.expiration_date as string) ?? null,
      batch_status: (r.batch_status as string) ?? "ACTIVE",
      unit_cost: r.unit_cost == null ? null : Number(r.unit_cost),
      location_name: (r.location_name as string) ?? "—",
      quantity_total: Number(r.quantity_total ?? 0),
      quantity_reserved: Number(r.quantity_reserved ?? 0),
      quantity_available: Number(r.quantity_available ?? 0),
      stock_value: Number(r.stock_value ?? 0),
      min_quantity: r.min_quantity == null ? null : Number(r.min_quantity),
      max_quantity: r.max_quantity == null ? null : Number(r.max_quantity),
      replenishment_status: (r.replenishment_status as StockBalanceRow["replenishment_status"]) ?? "OK",
      days_to_expire: r.days_to_expire == null ? null : Number(r.days_to_expire),
    }));
  });

// ---------- FEFO ----------
export interface FefoAllocation {
  batch_id: string;
  quantity: number;
  expiration_date: string | null;
}

export const previewFefo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        product_id: z.string().uuid(),
        location_id: z.string().uuid(),
        quantity: z.number().positive(),
      })
      .parse(input),
  )
  .handler(
    async ({ data, context }): Promise<{ allocations: FefoAllocation[]; missing: number }> => {
      const { data: res, error } = await context.supabase.rpc("fefo_allocate", {
        p_product_id: data.product_id,
        p_location_id: data.location_id,
        p_quantity: data.quantity,
      });
      if (error) throw mapEngineError(error.message ?? "");
      const out = res as unknown as { allocations: FefoAllocation[]; missing: number };
      return {
        allocations: (out?.allocations ?? []).map((a) => ({
          batch_id: a.batch_id,
          quantity: Number(a.quantity),
          expiration_date: a.expiration_date ?? null,
        })),
        missing: Number(out?.missing ?? 0),
      };
    },
  );

// ---------- Motor central ----------
const allocationSchema = z.object({
  batch_id: z.string().uuid(),
  quantity: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "number" ? v : Number(String(v).trim())))
    .refine((v) => Number.isFinite(v) && v > 0, { message: "Quantidade inválida" }),
});

const processSchema = z.object({
  type: z.enum(MOVEMENT_KINDS),
  allocations: z.array(allocationSchema).min(1),
  origin_location_id: z.string().uuid().nullable().optional(),
  destination_location_id: z.string().uuid().nullable().optional(),
  reason: z.string().trim().max(300).nullable().optional(),
  document_ref: z.string().trim().max(120).nullable().optional(),
  adjustment_direction: z.enum(["increase", "decrease"]).nullable().optional(),
  override_reason: z.string().trim().max(300).nullable().optional(),
  reference_type: z.string().trim().max(40).nullable().optional(),
  reference_id: z.string().uuid().nullable().optional(),
});

export interface ProcessMovementResult {
  type: MovementKind;
  movements: Array<{
    movement_id: string;
    batch_id: string;
    product_id: string;
    quantity: number;
  }>;
}

export const processMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => processSchema.parse(input))
  .handler(async ({ data, context }): Promise<ProcessMovementResult> => {
    const { data: res, error } = await context.supabase.rpc("process_movement", {
      p_type: data.type,
      p_allocations: data.allocations as never,
      p_origin_location_id: data.origin_location_id ?? undefined,
      p_destination_location_id: data.destination_location_id ?? undefined,
      p_user_id: context.userId,
      p_reason: data.reason ?? undefined,
      p_document_ref: data.document_ref ?? undefined,
      p_adjustment_direction: data.adjustment_direction ?? undefined,
      p_override_reason: data.override_reason ?? undefined,
      p_reference_type: data.reference_type ?? undefined,
      p_reference_id: data.reference_id ?? undefined,
    });
    if (error) throw mapEngineError(error.message ?? "");
    const out = res as unknown as ProcessMovementResult;
    return {
      type: out.type,
      movements: (out.movements ?? []).map((m) => ({ ...m, quantity: Number(m.quantity) })),
    };
  });

// ---------- Limites (mínimo/máximo por produto + localização) ----------
export interface ThresholdRow {
  id: string;
  product_id: string;
  location_id: string;
  min_quantity: number;
  max_quantity: number | null;
}

export const listThresholds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        product_id: z.string().uuid().optional(),
        location_id: z.string().uuid().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<ThresholdRow[]> => {
    let q = context.supabase
      .from("stock_thresholds")
      .select("id, product_id, location_id, min_quantity, max_quantity");
    if (data.product_id) q = q.eq("product_id", data.product_id);
    if (data.location_id) q = q.eq("location_id", data.location_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      product_id: r.product_id as string,
      location_id: r.location_id as string,
      min_quantity: Number(r.min_quantity ?? 0),
      max_quantity: r.max_quantity == null ? null : Number(r.max_quantity),
    }));
  });

export const upsertThreshold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        product_id: z.string().uuid(),
        location_id: z.string().uuid(),
        min_quantity: z.number().min(0),
        max_quantity: z.number().min(0).nullable().optional(),
      })
      .refine((v) => v.max_quantity == null || v.max_quantity >= v.min_quantity, {
        message: "Máximo deve ser maior ou igual ao mínimo.",
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ThresholdRow> => {
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("hospital_id")
      .eq("id", context.userId)
      .maybeSingle();
    const hospital_id = (prof as { hospital_id: string | null } | null)?.hospital_id;
    if (!hospital_id) throw new Error("Perfil sem hospital vinculado.");
    const { data: row, error } = await context.supabase
      .from("stock_thresholds")
      .upsert(
        {
          hospital_id,
          product_id: data.product_id,
          location_id: data.location_id,
          min_quantity: data.min_quantity,
          max_quantity: data.max_quantity ?? null,
          updated_by: context.userId,
        },
        { onConflict: "product_id,location_id" },
      )
      .select("id, product_id, location_id, min_quantity, max_quantity")
      .single();
    if (error) throw new Error(error.message);
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      product_id: r.product_id as string,
      location_id: r.location_id as string,
      min_quantity: Number(r.min_quantity ?? 0),
      max_quantity: r.max_quantity == null ? null : Number(r.max_quantity),
    };
  });
