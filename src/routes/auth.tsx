import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Activity, Lock, Mail, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — MedControl Hospital" },
      { name: "description", content: "Acesse o sistema MedControl Hospital." },
    ],
  }),
  component: LoginPage,
});

const profiles = [
  { id: "admin", label: "Administrador" },
  { id: "farmaceutico", label: "Farmacêutico" },
  { id: "auxiliar", label: "Auxiliar" },
  { id: "auditor", label: "Auditor" },
];

function LoginPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState("admin");

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-lg bg-white/15 grid place-items-center backdrop-blur">
            <Activity className="size-5" />
          </div>
          <span className="font-semibold tracking-tight">MedControl Hospital</span>
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold leading-tight">
            Gestão hospitalar<br />moderna e segura.
          </h1>
          <p className="text-primary-foreground/80 max-w-sm">
            Controle de estoque, dispensações, leitos e relatórios em uma única plataforma.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-primary-foreground/70">
          <ShieldCheck className="size-4" /> Conexão criptografada
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ to: "/" });
          }}
          className="w-full max-w-sm space-y-6"
        >
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="size-9 rounded-lg bg-primary grid place-items-center text-primary-foreground">
              <Activity className="size-5" />
            </div>
            <span className="font-semibold tracking-tight">MedControl Hospital</span>
          </div>

          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Entrar na sua conta</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Acesse o painel com suas credenciais.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">E-mail</label>
              <div className="relative">
                <Mail className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  required
                  placeholder="usuario@hospital.com"
                  className="w-full h-10 pl-9 pr-3 rounded-md border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Senha</label>
              <div className="relative">
                <Lock className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full h-10 pl-9 pr-3 rounded-md border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Perfil</label>
              <div className="grid grid-cols-2 gap-2">
                {profiles.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setProfile(p.id)}
                    className={`h-10 rounded-md border text-sm transition-colors ${
                      profile === p.id
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-input bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Entrar
          </button>

          <p className="text-xs text-muted-foreground text-center">
            Esqueceu sua senha? Contate o administrador do sistema.
          </p>
        </form>
      </div>
    </div>
  );
}
