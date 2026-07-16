import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PagePlaceholder } from "@/components/AppSidebar";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — MedControl Hospital" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="Configurações">
      <PagePlaceholder title="Configurações" description="Parâmetros gerais do sistema e integrações." />
    </AppShell>
  );
}
