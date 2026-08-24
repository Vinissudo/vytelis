import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  LayoutDashboard,
  PackageCheck,
  Boxes,
  Warehouse,
  BedDouble,
  ClipboardList,
  Users,
  Settings,
  LogOut,
  Search,
  Bell,
  MapPin,
  Building2,
  ShieldCheck,

} from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const navGroups = [
  {
    label: "Geral",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Suprimentos",
    items: [
      { to: "/recebimento", label: "Recebimento", icon: PackageCheck },
      { to: "/estoque", label: "Movimentações", icon: Boxes },
      { to: "/saldos", label: "Saldos", icon: Layers },
      { to: "/almoxarifado", label: "Almoxarifado", icon: Warehouse },
      { to: "/inventario", label: "Inventário", icon: ClipboardList },
    ],
  },

  {
    label: "Cadastros",
    items: [
      { to: "/locais", label: "Locais", icon: MapPin },
      { to: "/setores", label: "Setores", icon: Building2 },
      { to: "/leitos", label: "Leitos", icon: BedDouble },
    ],
  },
  {
    label: "Administração",
    items: [
      { to: "/usuarios", label: "Usuários", icon: Users },
      { to: "/relatorios", label: "Auditoria", icon: ShieldCheck },
      { to: "/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
] as const;


export function AppShell({ children, title }: { children: React.ReactNode; title: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-muted/30 flex">
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
            <div className="text-sm font-semibold tracking-tight">Vytelis</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Supply</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-0.5">
              <div className="px-3 mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {group.label}
              </div>
              {group.items.map((item) => {
                const active = pathname === item.to;
                const Icon = item.icon;
                return (
                  <Link
                    key={`${group.label}-${item.label}`}
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
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <button
            onClick={handleSignOut}
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
              VS
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

      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <h3 className="text-base font-semibold">Módulo em preparação</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Esta funcionalidade será liberada na próxima parte do Vytelis Supply.
        </p>
      </div>
    </div>
  );
}
