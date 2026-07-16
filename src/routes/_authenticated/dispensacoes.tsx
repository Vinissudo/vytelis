import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PagePlaceholder } from "@/components/AppSidebar";

export const Route = createFileRoute("/_authenticated/dispensacoes")({
  head: () => ({ meta: [{ title: "Dispensações — MedControl Hospital" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="Dispensações">
      <PagePlaceholder title="Dispensações" description="Histórico e registro de dispensações realizadas." />
    </AppShell>
  );
}
