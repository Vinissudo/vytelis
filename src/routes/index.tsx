import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppSidebar";
import { Boxes, Pill, Undo2, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "HospitalFlow — Dashboard" }] }),
  component: Dashboard,
});

const cards = [
  {
    label: "Estoque Total",
    value: "24.531",
    sub: "itens cadastrados",
    trend: "+3,2%",
    up: true,
    icon: Boxes,
    accent: "text-sky-600 bg-sky-50",
  },
  {
    label: "Dispensações Hoje",
    value: "1.284",
    sub: "atendimentos realizados",
    trend: "+12,4%",
    up: true,
    icon: Pill,
    accent: "text-emerald-600 bg-emerald-50",
  },
  {
    label: "Devoluções Hoje",
    value: "47",
    sub: "itens devolvidos",
    trend: "-8,1%",
    up: false,
    icon: Undo2,
    accent: "text-amber-600 bg-amber-50",
  },
  {
    label: "Produtos Vencendo",
    value: "23",
    sub: "próximos 30 dias",
    trend: "Atenção",
    up: false,
    icon: AlertTriangle,
    accent: "text-rose-600 bg-rose-50",
  },
];

const recent = [
  { name: "Dipirona 500mg", setor: "UTI", qty: "120 un", time: "há 2 min" },
  { name: "Soro Fisiológico 500ml", setor: "Pronto-Socorro", qty: "45 un", time: "há 14 min" },
  { name: "Paracetamol 750mg", setor: "Enfermaria 3", qty: "80 un", time: "há 32 min" },
  { name: "Heparina 5000UI", setor: "Centro Cirúrgico", qty: "12 un", time: "há 1 h" },
  { name: "Morfina 10mg", setor: "UTI", qty: "8 un", time: "há 2 h" },
];

const expiring = [
  { name: "Amoxicilina 500mg", lote: "L-2487", date: "28/06/2026", days: 8 },
  { name: "Insulina NPH", lote: "L-1129", date: "05/07/2026", days: 15 },
  { name: "Captopril 25mg", lote: "L-3320", date: "12/07/2026", days: 22 },
  { name: "Omeprazol 20mg", lote: "L-4501", date: "18/07/2026", days: 28 },
];

function Dashboard() {
  return (
    <AppShell title="Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">HospitalFlow</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Visão geral das operações hospitalares em tempo real.
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card border border-border rounded-lg">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="text-sm font-medium">Dispensações da semana</div>
              <div className="text-xs text-muted-foreground">Últimos 7 dias</div>
            </div>
            <div className="p-5">
              <div className="flex items-end gap-3 h-48">
                {[40, 65, 50, 80, 72, 95, 60].map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <div
                      className="w-full rounded-t bg-primary/80"
                      style={{ height: `${h}%` }}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][i]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg">
            <div className="px-5 py-4 border-b border-border">
              <div className="text-sm font-medium">Produtos vencendo</div>
            </div>
            <div className="divide-y divide-border">
              {expiring.map((e) => (
                <div key={e.lote} className="px-5 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{e.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Lote {e.lote} · {e.date}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                    {e.days} dias
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg">
          <div className="px-5 py-4 border-b border-border">
            <div className="text-sm font-medium">Dispensações recentes</div>
          </div>
          <div className="divide-y divide-border">
            {recent.map((r, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4">
                <div className="size-9 rounded-md bg-primary/10 text-primary grid place-items-center">
                  <Pill className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.setor} · {r.qty}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{r.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
