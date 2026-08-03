import { InventoryEngine } from "./inventory-engine";
import type { BatchLot, InventorySnapshot } from "./types";

/** First Expire, First Out. */
export const FEFOEngine = {
  /** Batches sorted by expiration (earliest first); undated batches go last. */
  sort(batches: BatchLot[]): BatchLot[] {
    return [...batches].sort((a, b) => {
      if (!a.expiration_date && !b.expiration_date) return 0;
      if (!a.expiration_date) return 1;
      if (!b.expiration_date) return -1;
      return a.expiration_date < b.expiration_date ? -1 : 1;
    });
  },

  /** The batch that must be consumed next in a given center. */
  next(s: InventorySnapshot, centerId: string | null): BatchLot | null {
    const available = InventoryEngine.batchesAtCenter(s, centerId);
    return FEFOEngine.sort(available)[0] ?? null;
  },

  /** Splits a requested quantity across batches following FEFO. */
  allocate(
    s: InventorySnapshot,
    centerId: string | null,
    quantity: number,
  ): { batch: BatchLot; quantity: number }[] {
    let remaining = quantity;
    const plan: { batch: BatchLot; quantity: number }[] = [];
    for (const batch of FEFOEngine.sort(InventoryEngine.batchesAtCenter(s, centerId))) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.quantity);
      plan.push({ batch, quantity: take });
      remaining -= take;
    }
    return plan;
  },

  daysToExpire(batch: BatchLot | null, now = new Date()): number | null {
    return batch ? InventoryEngine.daysUntil(batch.expiration_date, now) : null;
  },
};
