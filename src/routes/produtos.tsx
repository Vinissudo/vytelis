import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PagePlaceholder } from "@/components/AppSidebar";

export const Route = createFileRoute("/produtos")({
  head: () => ({ meta: [{ title: "Produtos — MedControl Hospital" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="Produtos">
      <PagePlaceholder title="Produtos" description="Cadastro e gestão do catálogo de medicamentos e materiais." />
    </AppShell>
  );
}
