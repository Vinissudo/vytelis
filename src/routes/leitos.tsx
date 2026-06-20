import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PagePlaceholder } from "@/components/AppSidebar";

export const Route = createFileRoute("/leitos")({
  head: () => ({ meta: [{ title: "Leitos — MedControl Hospital" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="Leitos">
      <PagePlaceholder title="Leitos" description="Mapa de ocupação e gestão de leitos hospitalares." />
    </AppShell>
  );
}
