import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PagePlaceholder } from "@/components/AppSidebar";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — MedControl Hospital" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="Relatórios">
      <PagePlaceholder title="Relatórios" description="Relatórios gerenciais, operacionais e regulatórios." />
    </AppShell>
  );
}
