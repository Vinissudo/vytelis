import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PagePlaceholder } from "@/components/AppSidebar";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — MedControl Hospital" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="Usuários">
      <PagePlaceholder title="Usuários" description="Gestão de usuários, perfis e permissões." />
    </AppShell>
  );
}
