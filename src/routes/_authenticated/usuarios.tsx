import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppSidebar";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  APP_ROLES,
  ROLE_LABELS,
  listUsers,
  setUserRole,
  removeUserRole,
  type AppRole,
} from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — Vytelis Supply" },
      {
        name: "description",
        content: "Gestão de usuários e papéis de acesso do hospital.",
      },
      { property: "og:title", content: "Usuários — Vytelis Supply" },
      {
        property: "og:description",
        content: "Gestão de usuários e papéis de acesso do hospital.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const queryClient = useQueryClient();
  const isAdmin = me?.roles.includes("administrator") ?? false;

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["managed-users"],
    queryFn: () => listUsers(),
    enabled: isAdmin,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["managed-users"] });

  const addMutation = useMutation({
    mutationFn: (input: { user_id: string; role: AppRole }) =>
      setUserRole({ data: input }),
    onSuccess: () => {
      toast.success("Papel atribuído com sucesso.");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (input: { user_id: string; role: AppRole }) =>
      removeUserRole({ data: input }),
    onSuccess: () => {
      toast.success("Papel removido.");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (meLoading) {
    return (
      <AppShell title="Usuários">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell title="Usuários">
        <div className="bg-card border border-border rounded-lg p-8 text-center max-w-lg mx-auto mt-8">
          <ShieldAlert className="size-8 text-muted-foreground mx-auto" />
          <h2 className="text-base font-semibold mt-3">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Apenas administradores podem gerenciar usuários.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Usuários">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Usuários</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Pessoas que já criaram conta em /auth aparecem aqui. Atribua um
            papel para que possam acessar as funcionalidades do sistema.
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Nome
                  </th>
                  <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    E-mail
                  </th>
                  <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Papéis atuais
                  </th>
                  <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-sm text-muted-foreground"
                    >
                      Carregando usuários...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-sm text-muted-foreground"
                    >
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const available = APP_ROLES.filter(
                      (r) => !u.roles.includes(r),
                    );
                    return (
                      <tr key={u.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">
                          {u.fullName ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {u.email ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {u.roles.length === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                Sem papel
                              </span>
                            ) : (
                              u.roles.map((role) => (
                                <span
                                  key={role}
                                  className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary"
                                >
                                  {ROLE_LABELS[role]}
                                  <button
                                    onClick={() =>
                                      removeMutation.mutate({
                                        user_id: u.id,
                                        role,
                                      })
                                    }
                                    disabled={removeMutation.isPending}
                                    className="hover:text-rose-600"
                                    aria-label={`Remover papel ${ROLE_LABELS[role]}`}
                                  >
                                    <X className="size-3" />
                                  </button>
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                            value=""
                            disabled={addMutation.isPending || available.length === 0}
                            onChange={(e) => {
                              const role = e.target.value as AppRole;
                              if (role)
                                addMutation.mutate({ user_id: u.id, role });
                              e.target.value = "";
                            }}
                          >
                            <option value="">
                              {available.length === 0
                                ? "Todos atribuídos"
                                : "Atribuir papel..."}
                            </option>
                            {available.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
