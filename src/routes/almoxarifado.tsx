import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PagePlaceholder } from "@/components/AppSidebar";

export const Route = createFileRoute("/almoxarifado")({
  head: () => ({ meta: [{ title: "Almoxarifado — MedControl Hospital" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="Almoxarifado">
      <PagePlaceholder title="Almoxarifado" description="Movimentação de insumos e materiais hospitalares." />
    </AppShell>
  );
}
