import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const searchInput = z.object({
  query: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(50).optional(),
});

export interface ProductSearchResult {
  id: string;
  internal_code: string | null;
  barcode: string | null;
  description: string;
  manufacturer: string | null;
  unit: string | null;
}

/**
 * Universal product search — filters by barcode, internal code, description,
 * manufacturer. Hospital scoping is enforced by RLS via the authenticated
 * Supabase client, so no explicit hospital_id filter is required here.
 */
export const searchProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchInput.parse(input))
  .handler(async ({ data, context }): Promise<ProductSearchResult[]> => {
    const limit = data.limit ?? 20;
    const term = data.query;
    const like = `%${term}%`;

    const { data: rows, error } = await context.supabase
      .from("products")
      .select("id, internal_code, barcode, description, manufacturer, unit")
      .is("deleted_at", null)
      .or(
        [
          `barcode.ilike.${like}`,
          `internal_code.ilike.${like}`,
          `description.ilike.${like}`,
          `manufacturer.ilike.${like}`,
        ].join(","),
      )
      .limit(limit);

    if (error) throw new Error(error.message);
    return (rows ?? []) as ProductSearchResult[];
  });
