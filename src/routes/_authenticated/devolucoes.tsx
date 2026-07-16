import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PagePlaceholder } from "@/components/AppSidebar";

export const Route = createFileRoute("/_authenticated/devolucoes")({
  head: () => ({ meta: [{ title: "Devoluções — MedControl Hospital" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="Devoluções">
      <PagePlaceholder title="Devoluções" description="Processamento de devoluções de medicamentos e materiais." />
    </AppShell>
  );
}
