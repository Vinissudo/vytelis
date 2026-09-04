import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Boxes,
  AlertTriangle,
  ShoppingCart,
  Timer,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/AppSidebar";
import { listInventorySnapshots } from "@/lib/movements.functions";
import {
  AlertEngine,
  InventoryEngine,
  PurchaseRecommendationEngine,
  TurnoverEngine,
} from "@/engines";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Vytelis Supply" },
      {
        name: "description",
        content:
          "Painel operacional Vytelis Supply: valor do estoque, alertas críticos, sugestões de compra e produtos sem giro.",
      },
      { property: "og:title", content: "Dashboard — Vytelis Supply" },
      {
        property: "og:description",
        content:
          "Acompanhe em tempo real o valor do estoque hospitalar, alertas críticos e reposições sugeridas.",
      },
    ],
  }),
  component: Dashboard,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Dashboard() {
  const fetchSnapshots = useServerFn(listInventorySnapshots);
  const snapshotsQuery = useQuery({
    queryKey: ["dashboard", "snapshots"],
    queryFn: () => fetchSnapshots({ data: { limit: 1000 } }),
  });

  const snapshots = useMemo(() => snapshotsQuery.data ?? [], [snapshotsQuery.data]);

  const metrics = useMemo(() => {
    const totalValue = snapshots.reduce((acc, s) => acc + InventoryEngine.stockValue(s), 0);
    const totalUnits = snapshots.reduce((acc, s) => acc + InventoryEngine.totalStock(s), 0);

    const alerts = AlertEngine.forCatalog(snapshots);
    const criticalAlerts = alerts.filter((a) => a.severity === "critical");

    const recommendations = PurchaseRecommendationEngine.forCatalog(snapshots);
    const bySupplier = PurchaseRecommendationEngine.groupBySupplier(recommendations);
    const estimatedCost = recommendations.reduce((acc, r) => acc + (r.estimated_cost ?? 0), 0);

    const stagnant = snapshots.filter((s) => {
      if (InventoryEngine.totalStock(s) <= 0) return false;
      const cls = TurnoverEngine.classify(s);
      const idle = TurnoverEngine.daysWithoutMovement(s);
      return cls === "slow" || cls === "stagnant" || (idle != null && idle >= 90);
    });
    const stagnantValue = stagnant.reduce((acc, s) => acc + InventoryEngine.stockValue(s), 0);

    return {
      totalValue,
      totalUnits,
      productCount: snapshots.length,
      criticalAlerts,
      recommendations,
      bySupplier,
      estimatedCost,
      stagnant,
      stagnantValue,
    };
  }, [snapshots]);

  const loading = snapshotsQuery.isPending;

  return (
    <AppShell title="Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Vytelis Supply</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Visão operacional do estoque hospitalar, calculada a partir das movimentações reais.
          </p>
        </div>

        {snapshotsQuery.isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Não foi possível carregar os indicadores do estoque.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card
            label="Estoque total"
            icon={Boxes}
            accent="text-sky-600 bg-sky-50"
            loading={loading}
            value={brl(metrics.totalValue)}
            sub={`${metrics.productCount} produtos cadastrados`}
            footer={`${metrics.totalUnits.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} unidades em estoque`}
            to="/saldos"
            linkLabel="Ver saldos"
          />

          <Card
            label="Alertas críticos"
            icon={AlertTriangle}
            accent="text-rose-600 bg-rose-50"
            loading={loading}
            value={String(metrics.criticalAlerts.length)}
            sub="alertas de severidade crítica"
            footer={
              metrics.criticalAlerts.length === 0
                ? "Nenhum alerta crítico no momento"
                : metrics.criticalAlerts
                    .slice(0, 2)
                    .map((a) => a.product_description)
                    .join(" · ")
            }
            to="/estoque"
            linkLabel="Resolver em Movimentações"
          />

          <Card
            label="Sugestão de compra"
            icon={ShoppingCart}
            accent="text-emerald-600 bg-emerald-50"
            loading={loading}
            value={String(metrics.recommendations.length)}
            sub={`produtos a repor · ${metrics.bySupplier.length} fornecedor(es)`}
            footer={
              metrics.estimatedCost > 0
                ? `Custo estimado ${brl(metrics.estimatedCost)}`
                : "Sem custo estimado disponível"
            }
            to="/recebimento"
            linkLabel="Ir para Recebimento"
          />

          <Card
            label="Giro parado"
            icon={Timer}
            accent="text-amber-600 bg-amber-50"
            loading={loading}
            value={String(metrics.stagnant.length)}
            sub="giro lento ou parados há 90+ dias"
            footer={`${brl(metrics.stagnantValue)} imobilizados`}
            to="/saldos"
            linkLabel="Analisar saldos"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold">Reposição mais urgente</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Três itens com maior urgência segundo o motor de recomendação.
            </p>
            <div className="mt-4 space-y-3">
              {loading && <SkeletonRows />}
              {!loading && metrics.recommendations.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhum produto atingiu o ponto de reposição.
                </p>
              )}
              {!loading &&
                metrics.recommendations.slice(0, 3).map((r) => (
                  <div
                    key={r.product_id}
                    className="flex items-start justify-between gap-3 border-b border-border last:border-0 pb-3 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{r.product_description}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.supplier_name ?? "Sem fornecedor definido"} · {r.reason}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold">
                        +{r.suggested_quantity.toLocaleString("pt-BR")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.estimated_cost != null ? brl(r.estimated_cost) : "—"}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </section>

          <section className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold">Compras por fornecedor</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Agrupamento das sugestões de compra por fornecedor padrão.
            </p>
            <div className="mt-4 space-y-3">
              {loading && <SkeletonRows />}
              {!loading && metrics.bySupplier.length === 0 && (
                <p className="text-sm text-muted-foreground">Nada a comprar agora.</p>
              )}
              {!loading &&
                metrics.bySupplier.slice(0, 5).map((g) => (
                  <div
                    key={g.supplier_id ?? "sem-fornecedor"}
                    className="flex items-center justify-between gap-3 border-b border-border last:border-0 pb-3 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{g.supplier_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {g.items.length} item(ns)
                      </div>
                    </div>
                    <div className="text-sm font-semibold shrink-0">{brl(g.total)}</div>
                  </div>
                ))}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function SkeletonRows() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Carregando…
    </div>
  );
}

function Card({
  label,
  icon: Icon,
  accent,
  value,
  sub,
  footer,
  to,
  linkLabel,
  loading,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  value: string;
  sub: string;
  footer: string;
  to: string;
  linkLabel: string;
  loading: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <div className={`size-8 rounded-md grid place-items-center ${accent}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight">
        {loading ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      <div className="mt-2 text-xs text-muted-foreground line-clamp-2">{loading ? "" : footer}</div>
      <Link to={to} className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
        {linkLabel} →
      </Link>
    </div>
  );
}
