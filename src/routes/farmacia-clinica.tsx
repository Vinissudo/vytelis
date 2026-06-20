import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PagePlaceholder } from "@/components/AppSidebar";

export const Route = createFileRoute("/farmacia-clinica")({
  head: () => ({ meta: [{ title: "Farmácia Clínica — MedControl Hospital" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="Farmácia Clínica">
      <PagePlaceholder title="Farmácia Clínica" description="Validação de prescrições e acompanhamento clínico." />
    </AppShell>
  );
}
