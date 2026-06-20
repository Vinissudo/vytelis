import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppSidebar";
import { TrendingUp, TrendingDown, Pill, BedDouble, Package, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — MedControl Hospital" }] }),
  component: Dashboard,
});

const kpis = [
  { label: "Dispensações hoje", value: "1.284", trend: "+12,4%", up: true, icon: Pill },
  { label: "Leitos ocupados", value: "186 / 240", trend: "77,5%", up: true, icon: BedDouble },
  { label: "Itens em estoque", value: "24.531", trend: "-2,1%", up: false, icon: Package },
  { label: "Alertas críticos", value: "7", trend: "Atenção", up: false, icon: AlertTriangle },
];

const activity = [
  { user: "Dra. Camila Souza", action: "dispensou Dipirona 500mg", time: "há 2 min", setor: "UTI" },
  { user: "Auxiliar Lucas R.", action: "registrou entrada de insumos", time: "há 14 min", setor: "Almoxarifado" },
  { user: "Farm. Pedro Lima", action: "validou prescrição #4821", time: "há 32 min", setor: "Farmácia Clínica" },
  { user: "Auditor André M.", action: "abriu inventário cíclico", time: "há 1 h", setor: "Inventário" },
  { user: "Enf. Marina T.", action: "transferiu paciente — Leito 412", time: "há 2 h", setor: "Leitos" },
];

function Dashboard() {
  return (
    <AppShell title="Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Bem-vindo de volta</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Visão geral das operações hospitalares em tempo real.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="bg-card border border-border rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {k.label}
                  </span>
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight">{k.value}</div>
                <div
                  className={`mt-1 inline-flex items-center gap-1 text-xs ${
                    k.up ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {k.up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {k.trend}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card border border-border rounded-lg">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="text-sm font-medium">Dispensações por setor</div>
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
              <div className="text-sm font-medium">Estoque crítico</div>
            </div>
            <div className="divide-y divide-border">
              {[
                { name: "Morfina 10mg", qty: "8 un", level: "crítico" },
                { name: "Soro Fisiológico 500ml", qty: "32 un", level: "baixo" },
                { name: "Heparina 5000UI", qty: "12 un", level: "crítico" },
                { name: "Paracetamol 750mg", qty: "45 un", level: "baixo" },
              ].map((it) => (
                <div key={it.name} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{it.name}</div>
                    <div className="text-xs text-muted-foreground">{it.qty}</div>
                  </div>
                  <span
                    className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      it.level === "crítico"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {it.level}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg">
          <div className="px-5 py-4 border-b border-border">
            <div className="text-sm font-medium">Atividade recente</div>
          </div>
          <div className="divide-y divide-border">
            {activity.map((a, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4">
                <div className="size-9 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-medium">
                  {a.user
                    .split(" ")
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="font-medium">{a.user}</span>{" "}
                    <span className="text-muted-foreground">{a.action}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.setor} · {a.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
