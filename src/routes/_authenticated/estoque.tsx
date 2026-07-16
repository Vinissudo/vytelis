import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PagePlaceholder } from "@/components/AppSidebar";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({ meta: [{ title: "Estoque — MedControl Hospital" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="Estoque">
      <PagePlaceholder title="Estoque" description="Controle de níveis, lotes e validades em tempo real." />
    </AppShell>
  );
}
