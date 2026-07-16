import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppSidebar";
import { Boxes, Pill, Undo2, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Vytelis Supply" }] }),
  component: Dashboard,
});

const cards = [
  {
    label: "Estoque Total",
    value: "—",
    sub: "itens cadastrados",
    trend: "Aguardando dados",
    up: true,
    icon: Boxes,
    accent: "text-sky-600 bg-sky-50",
  },
  {
    label: "Movimentações Hoje",
    value: "—",
    sub: "entradas e saídas",
    trend: "Aguardando dados",
    up: true,
    icon: Pill,
    accent: "text-emerald-600 bg-emerald-50",
  },
  {
    label: "Devoluções Hoje",
    value: "—",
    sub: "itens devolvidos",
    trend: "Aguardando dados",
    up: false,
    icon: Undo2,
    accent: "text-amber-600 bg-amber-50",
  },
  {
    label: "Produtos Vencendo",
    value: "—",
    sub: "próximos 90 dias",
    trend: "Aguardando dados",
    up: false,
    icon: AlertTriangle,
    accent: "text-rose-600 bg-rose-50",
  },
];

function Dashboard() {
  return (
    <AppShell title="Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Vytelis Supply</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Plataforma inteligente de operações hospitalares — módulo de suprimentos.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.label}
                className="bg-card border border-border rounded-lg p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {c.label}
                  </span>
                  <div className={`size-8 rounded-md grid place-items-center ${c.accent}`}>
                    <Icon className="size-4" />
                  </div>
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight">{c.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{c.sub}</div>
                <div
                  className={`mt-3 inline-flex items-center gap-1 text-xs font-medium ${
                    c.up ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {c.up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {c.trend}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <h3 className="text-base font-semibold">Fundação pronta.</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-lg mx-auto">
            O banco de dados multi-hospital, RLS, autenticação e módulo de cadastros estão ativos.
            Na próxima parte serão liberados os cadastros de Categorias, Fornecedores, Produtos,
            Lotes e Movimentações (Entrada Inicial e Saída Simples).
          </p>
        </div>
      </div>
    </AppShell>
  );
}
