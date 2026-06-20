import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  LayoutDashboard,
  Package,
  Boxes,
  Warehouse,
  Stethoscope,
  Scissors,
  BedDouble,
  Pill,
  Undo2,
  ClipboardList,
  BarChart3,
  Users,
  Settings,
  LogOut,
  Search,
  Bell,
} from "lucide-react";
import { useState } from "react";

export const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/produtos", label: "Produtos", icon: Package },
  { to: "/estoque", label: "Estoque", icon: Boxes },
  { to: "/almoxarifado", label: "Almoxarifado", icon: Warehouse },
  { to: "/farmacia-clinica", label: "Farmácia Clínica", icon: Stethoscope },
  { to: "/centro-cirurgico", label: "Centro Cirúrgico", icon: Scissors },
  { to: "/leitos", label: "Leitos", icon: BedDouble },
  { to: "/dispensacoes", label: "Dispensações", icon: Pill },
  { to: "/devolucoes", label: "Devoluções", icon: Undo2 },
  { to: "/inventario", label: "Inventário", icon: ClipboardList },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/usuarios", label: "Usuários", icon: Users },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

export function AppShell({ children, title }: { children: React.ReactNode; title: string }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-border flex flex-col transform transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-16 flex items-center gap-2 px-5 border-b border-border">
          <div className="size-8 rounded-lg bg-primary grid place-items-center text-primary-foreground">
            <Activity className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">MedControl</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Hospital</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {navItems.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 h-9 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <button
            onClick={() => navigate({ to: "/login" })}
            className="flex items-center gap-3 px-3 h-9 w-full rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <LogOut className="size-4" /> Sair
          </button>
        </div>
      </aside>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}

      {/* Main */}
      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        <header className="h-16 bg-card border-b border-border flex items-center gap-4 px-4 sm:px-6 sticky top-0 z-20">
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden size-9 grid place-items-center rounded-md hover:bg-muted"
            aria-label="Abrir menu"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <h1 className="text-base font-semibold tracking-tight">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:flex relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Buscar..."
                className="h-9 w-56 lg:w-72 pl-9 pr-3 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button className="size-9 grid place-items-center rounded-md hover:bg-muted text-muted-foreground">
              <Bell className="size-4" />
            </button>
            <div className="size-9 rounded-full bg-primary/10 text-primary grid place-items-center text-sm font-medium">
              AD
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PagePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-5">
            <div className="h-3 w-20 bg-muted rounded mb-3" />
            <div className="h-7 w-24 bg-muted rounded" />
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="text-sm font-medium">Visão geral</div>
          <div className="text-xs text-muted-foreground">Dados de exemplo</div>
        </div>
        <div className="p-5 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="size-8 rounded-md bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/3 bg-muted rounded" />
                <div className="h-2.5 w-1/2 bg-muted/70 rounded" />
              </div>
              <div className="h-6 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
