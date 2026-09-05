import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const STOCK_CENTER_TYPES = [
  "central_warehouse",
  "clinical_pharmacy",
  "surgical_pharmacy",
  "emergency_pharmacy",
  "icu_pharmacy",
  "other",
] as const;
export type StockCenterType = (typeof STOCK_CENTER_TYPES)[number];

export const STOCK_CENTER_TYPE_LABELS: Record<StockCenterType, string> = {
  central_warehouse: "Almoxarifado Central",
  clinical_pharmacy: "Farmácia Clínica",
  surgical_pharmacy: "Farmácia Centro Cirúrgico",
  emergency_pharmacy: "Farmácia Pronto Socorro",
  icu_pharmacy: "Farmácia UTI",
  other: "Outro",
};

export interface StockCenterRow {
  id: string;
  name: string;
  type: StockCenterType;
  active: boolean;
  balance_rows: number;
  total_quantity: number;
}

async function hospitalOf(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("hospital_id")
    .eq("id", userId)
    .maybeSingle();
  const hospital = (data as { hospital_id: string | null } | null)?.hospital_id;
  if (!hospital) throw new Error("Perfil sem hospital vinculado.");
  return hospital;
}

export const listStockCenters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StockCenterRow[]> => {
    const { data, error } = await context.supabase
      .from("stock_centers")
      .select("id, name, type, active")
      .is("deleted_at", null)
      .order("name");
    if (error) throw new Error(error.message);
    const centers = (data ?? []) as Array<{
      id: string;
      name: string;
      type: StockCenterType;
      active: boolean;
    }>;

    const { data: balances } = await context.supabase
      .from("stock_balances")
      .select("location_id, quantity_total");
    const agg = new Map<string, { rows: number; qty: number }>();
    for (const b of (balances ?? []) as Array<{ location_id: string; quantity_total: number }>) {
      const cur = agg.get(b.location_id) ?? { rows: 0, qty: 0 };
      cur.rows += 1;
      cur.qty += Number(b.quantity_total ?? 0);
      agg.set(b.location_id, cur);
    }

    return centers.map((c) => ({
      ...c,
      balance_rows: agg.get(c.id)?.rows ?? 0,
      total_quantity: agg.get(c.id)?.qty ?? 0,
    }));
  });

const centerInput = z.object({
  name: z.string().trim().min(2, "Informe um nome com pelo menos 2 caracteres."),
  type: z.enum(STOCK_CENTER_TYPES),
  active: z.boolean().default(true),
});

export const createStockCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => centerInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const hospital_id = await hospitalOf(context.supabase as never, context.userId);
    const { data: row, error } = await context.supabase
      .from("stock_centers")
      .insert({
        hospital_id,
        name: data.name,
        type: data.type,
        active: data.active,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) {
      throw new Error(
        error.message.includes("row-level security")
          ? "Você não tem permissão para criar locais de estoque."
          : error.message,
      );
    }
    return { id: (row as { id: string }).id };
  });

export const updateStockCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    centerInput.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("stock_centers")
      .update({
        name: data.name,
        type: data.type,
        active: data.active,
        updated_by: context.userId,
      })
      .eq("id", data.id);
    if (error) {
      throw new Error(
        error.message.includes("row-level security")
          ? "Você não tem permissão para editar locais de estoque."
          : error.message,
      );
    }
    return { ok: true };
  });

export const deleteStockCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(
    async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
      const { count } = await context.supabase
        .from("stock_balances")
        .select("id", { count: "exact", head: true })
        .eq("location_id", data.id)
        .gt("quantity_total", 0);
      if ((count ?? 0) > 0) {
        return {
          ok: false,
          error:
            "Este local possui saldo de estoque e não pode ser excluído. Desative-o ou transfira o saldo antes.",
        };
      }
      const { count: movCount } = await context.supabase
        .from("movements")
        .select("id", { count: "exact", head: true })
        .or(`stock_center_id.eq.${data.id},stock_center_dest_id.eq.${data.id}`);
      if ((movCount ?? 0) > 0) {
        return {
          ok: false,
          error:
            "Este local já possui histórico de movimentações e não pode ser excluído. Desative-o para tirá-lo dos seletores.",
        };
      }
      const { error } = await context.supabase
        .from("stock_centers")
        .update({ deleted_at: new Date().toISOString(), deleted_by: context.userId, active: false })
        .eq("id", data.id);
      if (error) {
        return {
          ok: false,
          error: error.message.includes("row-level security")
            ? "Você não tem permissão para excluir locais de estoque."
            : error.message,
        };
      }
      return { ok: true };
    },
  );
