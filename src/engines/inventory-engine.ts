import type { BatchLot, InventorySnapshot } from "./types";

/** Stock math. Single source of truth for quantities and values. */
export const InventoryEngine = {
  totalStock(s: InventorySnapshot): number {
    return s.centers.reduce((acc, c) => acc + c.quantity, 0);
  },

  stockAtCenter(s: InventorySnapshot, centerId: string | null | undefined): number {
    if (!centerId) return 0;
    return s.centers.find((c) => c.stock_center_id === centerId)?.quantity ?? 0;
  },

  /** Batches available in a given center (quantity > 0). */
  batchesAtCenter(s: InventorySnapshot, centerId: string | null | undefined): BatchLot[] {
    return s.batches.filter(
      (b) => b.quantity > 0 && (!centerId || b.stock_center_id === centerId),
    );
  },

  /** Financial value of the stock on hand, using batch cost or last purchase price. */
  stockValue(s: InventorySnapshot): number {
    const fallback = s.last_purchase_price ?? 0;
    return s.batches.reduce(
      (acc, b) => acc + b.quantity * (b.unit_cost ?? fallback),
      0,
    );
  },

  /** True when the aggregated center totals diverge from the batch ledger. */
  hasInconsistentStock(s: InventorySnapshot): boolean {
    const byCenters = InventoryEngine.totalStock(s);
    const byBatches = s.batches.reduce((acc, b) => acc + b.quantity, 0);
    return Math.abs(byCenters - byBatches) > 0.001;
  },

  daysSince(iso: string | null | undefined, now = new Date()): number | null {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return null;
    return Math.floor((now.getTime() - then) / 86_400_000);
  },

  daysUntil(dateOnly: string | null | undefined, now = new Date()): number | null {
    if (!dateOnly) return null;
    const then = new Date(`${dateOnly}T00:00:00`).getTime();
    if (Number.isNaN(then)) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Math.round((then - today) / 86_400_000);
  },
};
