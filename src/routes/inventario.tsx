import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PagePlaceholder } from "@/components/AppSidebar";

export const Route = createFileRoute("/inventario")({
  head: () => ({ meta: [{ title: "Inventário — MedControl Hospital" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="Inventário">
      <PagePlaceholder title="Inventário" description="Contagens cíclicas e ajustes de estoque." />
    </AppShell>
  );
}
