import { InventoryEngine } from "./inventory-engine";
import { ConsumptionEngine, CoverageEngine, ForecastEngine } from "./consumption-engine";
import { HealthEngine } from "./health-engine";
import type { AlertSeverity, InventorySnapshot, PurchaseRecommendation } from "./types";

/**
 * Prepares intelligent purchasing. Quotation and supplier comparison are future
 * extensions — this engine exposes the calculation contract they will consume.
 */
export const PurchaseRecommendationEngine = {
  reorderPoint(s: InventorySnapshot): number {
    const adc = ConsumptionEngine.averageDaily(s) ?? 0;
    const lead = s.lead_time_days ?? 7;
    const byConsumption = adc * lead * 1.3; // 30% safety stock
    return Math.max(s.minimum_stock ?? 0, byConsumption);
  },

  suggestedQuantity(s: InventorySnapshot, horizonDays = 30): number {
    const stock = InventoryEngine.totalStock(s);
    const target =
      s.maximum_stock ??
      Math.max(
        PurchaseRecommendationEngine.reorderPoint(s) +
          (ForecastEngine.demandForDays(s, horizonDays) ?? 0),
        (s.minimum_stock ?? 0) * 2,
      );
    return Math.max(0, Math.ceil(target - stock));
  },

  urgency(s: InventorySnapshot): AlertSeverity {
    const status = HealthEngine.status(s);
    if (status === "out") return "critical";
    if (status === "critical") return "high";
    if (status === "low") return "medium";
    return "info";
  },

  forProduct(s: InventorySnapshot): PurchaseRecommendation | null {
    const stock = InventoryEngine.totalStock(s);
    const reorder = PurchaseRecommendationEngine.reorderPoint(s);
    if (reorder <= 0 || stock > reorder) return null;
    const qty = PurchaseRecommendationEngine.suggestedQuantity(s);
    if (qty <= 0) return null;
    return {
      product_id: s.id,
      product_description: s.description,
      supplier_id: s.default_supplier_id,
      supplier_name: s.supplier_name,
      current_stock: stock,
      reorder_point: Math.round(reorder * 100) / 100,
      suggested_quantity: qty,
      estimated_cost: s.last_purchase_price != null ? qty * s.last_purchase_price : null,
      coverage_days: CoverageEngine.coverageDays(s),
      urgency: PurchaseRecommendationEngine.urgency(s),
      reason:
        stock <= 0
          ? "Produto zerado."
          : `Saldo ${stock} atingiu o ponto de reposição (${Math.round(reorder)}).`,
    };
  },

  forCatalog(snapshots: InventorySnapshot[]): PurchaseRecommendation[] {
    const order: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2, info: 3 };
    return snapshots
      .map((s) => PurchaseRecommendationEngine.forProduct(s))
      .filter((r): r is PurchaseRecommendation => r !== null)
      .sort((a, b) => order[a.urgency] - order[b.urgency]);
  },

  /** Future extension point: grouping for supplier minimum order value. */
  groupBySupplier(recs: PurchaseRecommendation[]) {
    const map = new Map<string, { supplier_id: string | null; supplier_name: string; items: PurchaseRecommendation[]; total: number }>();
    for (const r of recs) {
      const key = r.supplier_id ?? "__none__";
      const entry = map.get(key) ?? {
        supplier_id: r.supplier_id,
        supplier_name: r.supplier_name ?? "Sem fornecedor definido",
        items: [],
        total: 0,
      };
      entry.items.push(r);
      entry.total += r.estimated_cost ?? 0;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  },
};
