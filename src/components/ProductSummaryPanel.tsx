import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CalendarClock,
  Layers,
  PackageSearch,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import {
  AlertEngine,
  ConsumptionEngine,
  CoverageEngine,
  FEFOEngine,
  HealthEngine,
  InventoryEngine,
  TurnoverEngine,
  type InventorySnapshot,
} from "@/engines";

const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function fmtQty(n: number | null | undefined) {
  return n == null ? "—" : nf.format(n);
}
function fmtDate(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

interface Props {
  product: InventorySnapshot;
  stockCenterId: string | null;
  className?: string;
  actions?: React.ReactNode;
}

/**
 * ProductSummaryPanel — the single operational summary component.
 * All numbers come from the engines; this component only renders.
 */
export function ProductSummaryPanel({ product, stockCenterId, className, actions }: Props) {
  const view = useMemo(() => {
    const status = HealthEngine.status(product);
    const fefo = FEFOEngine.next(product, stockCenterId);
    return {
      status,
      health: HealthEngine.meta(status),
      total: InventoryEngine.totalStock(product),
      atCenter: InventoryEngine.stockAtCenter(product, stockCenterId),
      value: InventoryEngine.stockValue(product),
      coverage: CoverageEngine.coverageDays(product),
      adc: ConsumptionEngine.averageDaily(product),
      variation: ConsumptionEngine.variationPct(product),
      fefo,
      fefoDays: FEFOEngine.daysToExpire(fefo),
      turnover: TurnoverEngine.label(TurnoverEngine.classify(product)),
      idleDays: TurnoverEngine.daysWithoutMovement(product),
      warnings: AlertEngine.warningsFor(product, stockCenterId),
      batches: FEFOEngine.sort(InventoryEngine.batchesAtCenter(product, null)).slice(0, 6),
    };
  }, [product, stockCenterId]);

  return (
    <section className={cn("rounded-xl border bg-card shadow-sm", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-5">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">
            {product.barcode ?? "sem código"} · {product.internal_code ?? "—"}
          </p>
          <h2 className="mt-1 text-base font-semibold sm:text-lg">{product.description}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {product.category_name ?? "Sem categoria"} · {product.manufacturer ?? "Sem fabricante"} ·{" "}
            {product.supplier_name ?? "Sem fornecedor"} · {product.unit ?? "UN"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {product.controlled_drug && (
            <span className="flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] text-purple-700">
              <ShieldAlert className="h-3 w-3" /> Controlado
            </span>
          )}
          <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", view.health.tone)}>
            {view.health.label}
          </span>
          {actions}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 p-4 sm:p-5 md:grid-cols-4">
        <Metric label="Estoque total" value={fmtQty(view.total)} />
        <Metric
          label="Neste local"
          value={fmtQty(view.atCenter)}
          tone={view.atCenter <= 0 ? "danger" : undefined}
        />
        <Metric label="Mínimo" value={fmtQty(product.minimum_stock)} />
        <Metric label="Máximo" value={fmtQty(product.maximum_stock)} />
        <Metric
          label="Cobertura"
          value={view.coverage == null ? "—" : `${Math.floor(view.coverage)} dias`}
          tone={
            view.coverage != null && view.coverage < CoverageEngine.requiredCoverageDays(product)
              ? "danger"
              : undefined
          }
        />
        <Metric
          label="Consumo médio/dia"
          value={view.adc == null ? "—" : nf.format(Number(view.adc.toFixed(2)))}
        />
        <Metric label="Giro" value={view.turnover} />
        <Metric label="Valor em estoque" value={money.format(view.value)} />
      </div>

      <div className="grid gap-4 border-t p-4 sm:p-5 md:grid-cols-2">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" /> Lote FEFO (próximo a vencer)
          </p>
          {view.fefo ? (
            <p className="text-sm">
              <span className="font-mono font-medium">{view.fefo.batch ?? "sem lote"}</span> ·{" "}
              {fmtDate(view.fefo.expiration_date)} ·{" "}
              <b>{fmtQty(view.fefo.quantity)}</b> un
              {view.fefoDays != null && (
                <span
                  className={cn(
                    "ml-2 rounded border px-1.5 py-0.5 text-[11px]",
                    view.fefoDays < 0
                      ? "border-red-200 bg-red-50 text-red-700"
                      : view.fefoDays <= 30
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700",
                  )}
                >
                  {view.fefoDays < 0 ? `vencido há ${Math.abs(view.fefoDays)}d` : `${view.fefoDays}d`}
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Sem lotes disponíveis neste local.</p>
          )}

          <p className="flex items-center gap-2 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Histórico
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>
              Última movimentação: <b className="text-foreground">{fmtDate(product.last_movement_at)}</b>
              {view.idleDays != null && ` (${view.idleDays}d)`}
            </li>
            <li>
              Última compra: <b className="text-foreground">{fmtDate(product.last_purchase_at)}</b>
              {product.last_purchase_price != null &&
                ` · ${money.format(product.last_purchase_price)}`}
            </li>
            <li>
              Consumo 30d: <b className="text-foreground">{fmtQty(product.consumption_30d)}</b> · 90d:{" "}
              <b className="text-foreground">{fmtQty(product.consumption_90d)}</b>
              {view.variation != null && ` · variação ${Math.round(view.variation)}%`}
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Layers className="h-3.5 w-3.5" /> Estoque por local e lote
          </p>
          <div className="flex flex-wrap gap-2">
            {product.centers.map((c) => (
              <span
                key={c.stock_center_id}
                className={cn(
                  "rounded-full border px-2 py-1 text-xs",
                  c.stock_center_id === stockCenterId ? "border-primary/40 bg-primary/5" : "bg-muted/40",
                )}
              >
                {c.stock_center_name}: <b>{fmtQty(c.quantity)}</b>
              </span>
            ))}
            {product.centers.length === 0 && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <PackageSearch className="h-4 w-4" /> Sem saldo registrado
              </span>
            )}
          </div>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {view.batches.map((b, i) => (
              <li key={`${b.stock_center_id}-${b.batch}-${i}`} className="font-mono">
                {b.stock_center_name} · {b.batch ?? "sem lote"} · {fmtDate(b.expiration_date)} ·{" "}
                {fmtQty(b.quantity)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {view.warnings.length > 0 && (
        <div className="border-t bg-amber-50/60 p-4 sm:p-5">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" /> Avisos operacionais
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {view.warnings.map((w) => (
              <li key={w}>• {w}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/30 px-3 py-2",
        tone === "danger" && "border-red-200 bg-red-50",
      )}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-base font-semibold sm:text-lg", tone === "danger" && "text-red-700")}>
        {value}
      </p>
    </div>
  );
}
