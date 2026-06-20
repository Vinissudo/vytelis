import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PagePlaceholder } from "@/components/AppSidebar";

export const Route = createFileRoute("/centro-cirurgico")({
  head: () => ({ meta: [{ title: "Centro Cirúrgico — MedControl Hospital" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="Centro Cirúrgico">
      <PagePlaceholder title="Centro Cirúrgico" description="Gestão de materiais e medicamentos do bloco cirúrgico." />
    </AppShell>
  );
}
