import { InventoryEngine } from "./inventory-engine";
import type { InventorySnapshot } from "./types";

/** Average daily consumption, derived from real movements with catalog fallback. */
export const ConsumptionEngine = {
  averageDaily(s: InventorySnapshot): number | null {
    if (s.consumption_30d > 0) return s.consumption_30d / 30;
    if (s.consumption_90d > 0) return s.consumption_90d / 90;
    if (s.average_daily_consumption && s.average_daily_consumption > 0) {
      return s.average_daily_consumption;
    }
    return null;
  },

  monthly(s: InventorySnapshot): number | null {
    const adc = ConsumptionEngine.averageDaily(s);
    return adc == null ? null : adc * 30;
  },

  /** Variation between the last 30 days and the previous 60-day baseline. */
  variationPct(s: InventorySnapshot): number | null {
    const previous = (s.consumption_90d - s.consumption_30d) / 2; // mean of the 2 prior months
    if (previous <= 0) return null;
    return ((s.consumption_30d - previous) / previous) * 100;
  },
};

/** Stock coverage in days. */
export const CoverageEngine = {
  coverageDays(s: InventorySnapshot): number | null {
    const adc = ConsumptionEngine.averageDaily(s);
    if (!adc || adc <= 0) return null;
    return InventoryEngine.totalStock(s) / adc;
  },

  coverageAtCenter(s: InventorySnapshot, centerId: string | null): number | null {
    const adc = ConsumptionEngine.averageDaily(s);
    if (!adc || adc <= 0) return null;
    return InventoryEngine.stockAtCenter(s, centerId) / adc;
  },

  /** Coverage needed to survive the supplier lead time (+30% safety). */
  requiredCoverageDays(s: InventorySnapshot): number {
    const lead = s.lead_time_days ?? 7;
    return Math.ceil(lead * 1.3);
  },
};

/** Simple demand projection used by the purchase engines. */
export const ForecastEngine = {
  demandForDays(s: InventorySnapshot, days: number): number | null {
    const adc = ConsumptionEngine.averageDaily(s);
    return adc == null ? null : adc * days;
  },

  /** Estimated date the stock reaches zero. */
  stockoutDate(s: InventorySnapshot, now = new Date()): Date | null {
    const cov = CoverageEngine.coverageDays(s);
    if (cov == null || !Number.isFinite(cov)) return null;
    return new Date(now.getTime() + cov * 86_400_000);
  },
};
