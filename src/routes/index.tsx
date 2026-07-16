import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, ArrowRight, Boxes, ShieldCheck, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vytelis — Plataforma inteligente de operações hospitalares" },
      {
        name: "description",
        content:
          "Vytelis é a plataforma inteligente de operações hospitalares. O módulo Supply oferece rastreabilidade completa de medicamentos e materiais.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        navigate({ to: "/dashboard", replace: true });
      } else {
        setChecking(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (checking) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-16 border-b border-border flex items-center px-6">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary grid place-items-center text-primary-foreground">
            <Activity className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Vytelis</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Supply</div>
          </div>
        </div>
        <div className="ml-auto">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            Entrar <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-primary bg-primary/10 rounded-full px-3 py-1">
            <ShieldCheck className="size-3" /> Ambiente hospitalar seguro
          </div>
          <h1 className="mt-6 text-4xl sm:text-5xl font-semibold tracking-tight">
            Operações hospitalares com inteligência de ponta a ponta.
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            Vytelis substitui planilhas e controles manuais por rastreabilidade completa de
            medicamentos, materiais e movimentações. Comece pelo módulo <strong>Supply</strong>.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 h-11 px-6 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              Acessar sistema <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            {[
              {
                icon: Boxes,
                title: "Estoque como consequência",
                desc: "O estoque nunca é editado — ele é sempre o resultado de uma movimentação auditável.",
              },
              {
                icon: Search,
                title: "Busca universal",
                desc: "Encontre por código de barras, código interno, descrição, fabricante ou lote.",
              },
              {
                icon: ShieldCheck,
                title: "Multi-hospital nativo",
                desc: "Arquitetura pronta para escalar para múltiplas unidades e centros de custo.",
              },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="bg-card border border-border rounded-lg p-5">
                  <div className="size-9 rounded-md bg-primary/10 text-primary grid place-items-center">
                    <Icon className="size-4" />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Vytelis · Todos os direitos reservados.
      </footer>
    </div>
  );
}
