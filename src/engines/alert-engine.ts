import { InventoryEngine } from "./inventory-engine";
import { ConsumptionEngine, CoverageEngine } from "./consumption-engine";
import { FEFOEngine } from "./fefo-engine";
import { HealthEngine, TurnoverEngine } from "./health-engine";
import type {
  AlertKind,
  AlertSeverity,
  InventoryAlert,
  InventorySnapshot,
} from "./types";

export const ALERT_META: Record<
  AlertKind,
  { label: string; severity: AlertSeverity; tone: string; group: string }
> = {
  out_of_stock: { label: "Sem estoque", severity: "critical", tone: "bg-red-100 text-red-800 border-red-200", group: "Estoque" },
  critical_stock: { label: "Estoque crítico", severity: "critical", tone: "bg-red-50 text-red-700 border-red-200", group: "Estoque" },
  low_stock: { label: "Estoque mínimo", severity: "high", tone: "bg-amber-50 text-amber-700 border-amber-200", group: "Estoque" },
  overstock: { label: "Acima do máximo", severity: "info", tone: "bg-blue-50 text-blue-700 border-blue-200", group: "Estoque" },
  expired: { label: "Vencido", severity: "critical", tone: "bg-red-100 text-red-800 border-red-200", group: "Validade" },
  expiring_7: { label: "Vence em 7 dias", severity: "critical", tone: "bg-red-50 text-red-700 border-red-200", group: "Validade" },
  expiring_15: { label: "Vence em 15 dias", severity: "high", tone: "bg-orange-50 text-orange-700 border-orange-200", group: "Validade" },
  expiring_30: { label: "Vence em 30 dias", severity: "high", tone: "bg-amber-50 text-amber-700 border-amber-200", group: "Validade" },
  expiring_60: { label: "Vence em 60 dias", severity: "medium", tone: "bg-amber-50 text-amber-700 border-amber-200", group: "Validade" },
  expiring_90: { label: "Vence em 90 dias", severity: "medium", tone: "bg-yellow-50 text-yellow-700 border-yellow-200", group: "Validade" },
  expiring_180: { label: "Vence em 180 dias", severity: "info", tone: "bg-yellow-50 text-yellow-700 border-yellow-200", group: "Validade" },
  no_movement_30: { label: "Sem movimento 30d", severity: "info", tone: "bg-slate-50 text-slate-600 border-slate-200", group: "Giro" },
  no_movement_60: { label: "Sem movimento 60d", severity: "info", tone: "bg-slate-50 text-slate-600 border-slate-200", group: "Giro" },
  no_movement_90: { label: "Sem movimento 90d", severity: "medium", tone: "bg-slate-100 text-slate-700 border-slate-200", group: "Giro" },
  no_movement_180: { label: "Sem movimento 180d", severity: "medium", tone: "bg-slate-100 text-slate-700 border-slate-200", group: "Giro" },
  no_movement_365: { label: "Parado há 1 ano", severity: "high", tone: "bg-slate-200 text-slate-800 border-slate-300", group: "Giro" },
  slow_turnover: { label: "Giro lento", severity: "info", tone: "bg-slate-50 text-slate-600 border-slate-200", group: "Giro" },
  inconsistent_stock: { label: "Estoque inconsistente", severity: "high", tone: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", group: "Consistência" },
  missing_batch: { label: "Lote ausente", severity: "medium", tone: "bg-purple-50 text-purple-700 border-purple-200", group: "Consistência" },
  missing_expiration: { label: "Validade ausente", severity: "medium", tone: "bg-purple-50 text-purple-700 border-purple-200", group: "Consistência" },
  duplicate_barcode: { label: "Código duplicado", severity: "high", tone: "bg-rose-50 text-rose-700 border-rose-200", group: "Consistência" },
};

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  info: 3,
};

function expiringKind(days: number): AlertKind | null {
  if (days < 0) return "expired";
  if (days <= 7) return "expiring_7";
  if (days <= 15) return "expiring_15";
  if (days <= 30) return "expiring_30";
  if (days <= 60) return "expiring_60";
  if (days <= 90) return "expiring_90";
  if (days <= 180) return "expiring_180";
  return null;
}

function stagnationKind(days: number): AlertKind | null {
  if (days >= 365) return "no_movement_365";
  if (days >= 180) return "no_movement_180";
  if (days >= 90) return "no_movement_90";
  if (days >= 60) return "no_movement_60";
  if (days >= 30) return "no_movement_30";
  return null;
}

function make(
  kind: AlertKind,
  s: InventorySnapshot,
  extra: Partial<InventoryAlert> & { message: string },
): InventoryAlert {
  const meta = ALERT_META[kind];
  return {
    key: `${s.id}-${kind}-${extra.batch ?? ""}-${extra.stock_center_id ?? ""}`,
    kind,
    severity: meta.severity,
    product_id: s.id,
    product_description: s.description,
    barcode: s.barcode,
    stock_center_id: extra.stock_center_id ?? null,
    stock_center_name: extra.stock_center_name ?? null,
    batch: extra.batch ?? null,
    metric: extra.metric ?? null,
    ref_date: extra.ref_date ?? null,
    message: extra.message,
  };
}

/** Derives every operational alert from snapshots. Pure, deterministic. */
export const AlertEngine = {
  forProduct(s: InventorySnapshot, now = new Date()): InventoryAlert[] {
    const alerts: InventoryAlert[] = [];
    const total = InventoryEngine.totalStock(s);
    const status = HealthEngine.status(s);

    if (status === "out") {
      alerts.push(make("out_of_stock", s, { metric: 0, message: "Produto sem saldo em nenhum local." }));
    } else if (status === "critical") {
      alerts.push(make("critical_stock", s, { metric: total, message: `Saldo ${total} abaixo de 50% do mínimo.` }));
    } else if (status === "low") {
      alerts.push(make("low_stock", s, { metric: total, message: `Saldo ${total} no ou abaixo do estoque mínimo.` }));
    } else if (status === "overstock") {
      alerts.push(make("overstock", s, { metric: total, message: `Saldo ${total} acima do estoque máximo.` }));
    }

    for (const b of s.batches) {
      if (b.quantity <= 0) continue;
      if (s.requires_batch && !b.batch) {
        alerts.push(make("missing_batch", s, {
          stock_center_id: b.stock_center_id,
          stock_center_name: b.stock_center_name,
          metric: b.quantity,
          message: "Saldo sem lote informado em produto que exige lote.",
        }));
      }
      if (s.requires_expiration_date && !b.expiration_date) {
        alerts.push(make("missing_expiration", s, {
          stock_center_id: b.stock_center_id,
          stock_center_name: b.stock_center_name,
          batch: b.batch,
          metric: b.quantity,
          message: "Saldo sem validade informada em produto que exige validade.",
        }));
        continue;
      }
      const days = InventoryEngine.daysUntil(b.expiration_date, now);
      if (days == null) continue;
      const kind = expiringKind(days);
      if (!kind) continue;
      alerts.push(make(kind, s, {
        stock_center_id: b.stock_center_id,
        stock_center_name: b.stock_center_name,
        batch: b.batch,
        metric: b.quantity,
        ref_date: b.expiration_date,
        message:
          days < 0
            ? `Lote ${b.batch ?? "—"} vencido há ${Math.abs(days)} dias (${b.quantity} un).`
            : `Lote ${b.batch ?? "—"} vence em ${days} dias (${b.quantity} un).`,
      }));
    }

    const idle = TurnoverEngine.daysWithoutMovement(s, now);
    if (idle != null && total > 0) {
      const kind = stagnationKind(idle);
      if (kind) {
        alerts.push(make(kind, s, {
          metric: idle,
          ref_date: s.last_movement_at,
          message: `Sem movimentação há ${idle} dias com ${total} un em estoque.`,
        }));
      }
    }
    if (total > 0 && TurnoverEngine.classify(s) === "slow") {
      alerts.push(make("slow_turnover", s, {
        metric: TurnoverEngine.turnoverRate(s),
        message: "Giro anual abaixo de 2x — capital parado.",
      }));
    }

    if (InventoryEngine.hasInconsistentStock(s)) {
      alerts.push(make("inconsistent_stock", s, {
        metric: total,
        message: "Divergência entre saldo por local e saldo por lote.",
      }));
    }

    return alerts;
  },

  forCatalog(snapshots: InventorySnapshot[], now = new Date()): InventoryAlert[] {
    const alerts = snapshots.flatMap((s) => AlertEngine.forProduct(s, now));

    // Duplicate barcode detection is catalog-wide.
    const byBarcode = new Map<string, InventorySnapshot[]>();
    for (const s of snapshots) {
      if (!s.barcode) continue;
      const list = byBarcode.get(s.barcode) ?? [];
      list.push(s);
      byBarcode.set(s.barcode, list);
    }
    for (const [code, list] of byBarcode) {
      if (list.length < 2) continue;
      for (const s of list) {
        alerts.push(make("duplicate_barcode", s, {
          metric: list.length,
          message: `Código ${code} usado por ${list.length} produtos ativos.`,
        }));
      }
    }

    return AlertEngine.sort(alerts);
  },

  sort(alerts: InventoryAlert[]): InventoryAlert[] {
    return [...alerts].sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        a.product_description.localeCompare(b.product_description),
    );
  },

  /** Compact warnings for the product summary panel. */
  warningsFor(s: InventorySnapshot, centerId: string | null, now = new Date()): string[] {
    const out: string[] = [];
    const fefo = FEFOEngine.next(s, centerId);
    const fefoDays = FEFOEngine.daysToExpire(fefo, now);
    if (fefoDays != null && fefoDays < 0) out.push(`Lote FEFO vencido há ${Math.abs(fefoDays)} dias`);
    else if (fefoDays != null && fefoDays <= 30) out.push(`Lote FEFO vence em ${fefoDays} dias`);
    const cov = CoverageEngine.coverageDays(s);
    if (cov != null && cov < CoverageEngine.requiredCoverageDays(s)) {
      out.push(`Cobertura de ${Math.floor(cov)} dias abaixo do lead time`);
    }
    const variation = ConsumptionEngine.variationPct(s);
    if (variation != null && Math.abs(variation) >= 40) {
      out.push(`Consumo ${variation > 0 ? "subiu" : "caiu"} ${Math.abs(Math.round(variation))}% no mês`);
    }
    if (InventoryEngine.hasInconsistentStock(s)) out.push("Divergência entre saldo e lotes");
    return out;
  },
};
