import { InventoryEngine } from "./inventory-engine";
import { ConsumptionEngine, CoverageEngine } from "./consumption-engine";
import type { HealthStatus, InventorySnapshot, TurnoverClass } from "./types";

const HEALTH_META: Record<HealthStatus, { label: string; tone: string }> = {
  out: { label: "Sem estoque", tone: "bg-red-100 text-red-800 border-red-200" },
  critical: { label: "Crítico", tone: "bg-red-50 text-red-700 border-red-200" },
  low: { label: "Baixo", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  healthy: { label: "Saudável", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  overstock: { label: "Acima do máximo", tone: "bg-blue-50 text-blue-700 border-blue-200" },
  unknown: { label: "Sem parâmetro", tone: "bg-slate-50 text-slate-600 border-slate-200" },
};

/** Classifies the operational health of a product. */
export const HealthEngine = {
  status(s: InventorySnapshot): HealthStatus {
    const total = InventoryEngine.totalStock(s);
    if (total <= 0) return "out";
    const min = s.minimum_stock;
    const max = s.maximum_stock;
    if (min != null && min > 0) {
      if (total <= min * 0.5) return "critical";
      if (total <= min) return "low";
    }
    const coverage = CoverageEngine.coverageDays(s);
    if (min == null && coverage != null) {
      if (coverage <= CoverageEngine.requiredCoverageDays(s) / 2) return "critical";
      if (coverage <= CoverageEngine.requiredCoverageDays(s)) return "low";
    }
    if (max != null && max > 0 && total > max) return "overstock";
    if (min == null && coverage == null) return "unknown";
    return "healthy";
  },

  meta(status: HealthStatus) {
    return HEALTH_META[status];
  },
};

/** Turnover / stagnation analysis. */
export const TurnoverEngine = {
  daysWithoutMovement(s: InventorySnapshot, now = new Date()): number | null {
    return InventoryEngine.daysSince(s.last_movement_at, now);
  },

  /** Consumption over average stock, annualised-ish over the 90-day window. */
  turnoverRate(s: InventorySnapshot): number | null {
    const stock = InventoryEngine.totalStock(s);
    if (stock <= 0) return null;
    if (s.consumption_90d <= 0) return 0;
    return (s.consumption_90d / stock) * (365 / 90);
  },

  classify(s: InventorySnapshot): TurnoverClass {
    const rate = TurnoverEngine.turnoverRate(s);
    if (rate == null) return "unknown";
    if (rate === 0) return "stagnant";
    if (rate < 2) return "slow";
    if (rate < 8) return "medium";
    return "fast";
  },

  label(cls: TurnoverClass): string {
    return {
      fast: "Giro rápido",
      medium: "Giro médio",
      slow: "Giro lento",
      stagnant: "Sem giro",
      unknown: "Sem histórico",
    }[cls];
  },

  monthlyConsumption(s: InventorySnapshot): number | null {
    return ConsumptionEngine.monthly(s);
  },
};
