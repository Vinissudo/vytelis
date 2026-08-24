import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppSidebar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Boxes, AlertTriangle, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { listStockBalances, type StockBalanceRow } from "@/lib/stock.functions";
import { listMovementStockCenters } from "@/lib/movements.functions";

export const Route = createFileRoute("/_authenticated/saldos")({
  head: () => ({
    meta: [
      { title: "Saldos de Estoque — Vytelis Supply" },
      {
        name: "description",
        content:
          "Consulta operacional do saldo por produto, lote e localização, com validade, disponibilidade e situação de reposição.",
      },
      { property: "og:title", content: "Saldos de Estoque — Vytelis Supply" },
      {
        property: "og:description",
        content: "Saldo persistido por produto, lote e localização com alertas de reposição.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const STATUS_TONE: Record<StockBalanceRow["replenishment_status"], string> = {
  OUT: "bg-red-100 text-red-800 border-red-200",
  CRITICAL: "bg-amber-100 text-amber-800 border-amber-200",
  OVERSTOCK: "bg-sky-100 text-sky-800 border-sky-200",
  OK: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const STATUS_LABEL: Record<StockBalanceRow["replenishment_status"], string> = {
  OUT: "Sem saldo",
  CRITICAL: "Estoque crítico",
  OVERSTOCK: "Acima do máximo",
  OK: "Normal",
};

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
}
function fmtDate(d: string | null) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR") : "—";
}

function Page() {
  const balancesFn = useServerFn(listStockBalances);
  const centersFn = useServerFn(listMovementStockCenters);

  const [q, setQ] = useState("");
  const [locationId, setLocationId] = useState<string>("all");
  const [grouped, setGrouped] = useState(false);

  const centers = useQuery({
    queryKey: ["movement-centers"],
    queryFn: () => centersFn(),
    staleTime: 60_000,
  });

  const balances = useQuery({
    queryKey: ["stock-balances", q, locationId],
    queryFn: () =>
      balancesFn({
        data: {
          q: q.trim() || undefined,
          location_id: locationId === "all" ? undefined : locationId,
          limit: 500,
        },
      }),
    staleTime: 15_000,
  });

  const rows = balances.data ?? [];

  const aggregated = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string; description: string; location_name: string; batches: number;
        total: number; reserved: number; available: number;
        min: number | null; max: number | null; nextExp: string | null;
      }
    >();
    for (const r of rows) {
      const key = `${r.product_id}:${r.location_id}`;
      const cur = map.get(key) ?? {
        key, description: r.description, location_name: r.location_name, batches: 0,
        total: 0, reserved: 0, available: 0, min: r.min_quantity, max: r.max_quantity, nextExp: null,
      };
      cur.batches += 1;
      cur.total += r.quantity_total;
      cur.reserved += r.quantity_reserved;
      cur.available += r.quantity_available;
      if (r.expiration_date && (!cur.nextExp || r.expiration_date < cur.nextExp)) {
        cur.nextExp = r.expiration_date;
      }
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => a.description.localeCompare(b.description));
  }, [rows]);

  const critical = rows.filter((r) => r.replenishment_status === "CRITICAL" || r.replenishment_status === "OUT");

  return (
    <AppShell title="Saldos de Estoque">
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Saldos de Estoque</h1>
            <p className="text-sm text-muted-foreground">
              Consulta do saldo persistido por produto, lote e localização. Alterações de saldo só
              ocorrem pelo motor central de movimentações.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={grouped ? "default" : "outline"}
              size="sm"
              onClick={() => setGrouped((v) => !v)}
            >
              <Layers className="mr-2 h-4 w-4" />
              {grouped ? "Ver por lote" : "Agrupar por produto"}
            </Button>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs uppercase text-muted-foreground">Registros de saldo</p>
            <p className="mt-1 text-2xl font-semibold">{rows.length}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs uppercase text-muted-foreground">Disponível total</p>
            <p className="mt-1 text-2xl font-semibold">
              {fmt(rows.reduce((s, r) => s + r.quantity_available, 0))}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs uppercase text-muted-foreground">Reposição necessária</p>
            <p className={cn("mt-1 text-2xl font-semibold", critical.length > 0 && "text-red-600")}>
              {critical.length}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="q">Buscar</Label>
            <Input
              id="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Produto, código, código de barras ou lote"
            />
          </div>
          <div className="w-56">
            <Label>Localização</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(centers.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border bg-card">
          {balances.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando saldos…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-muted-foreground">
              <Boxes className="h-6 w-6" />
              <p className="text-sm">Nenhum saldo encontrado para os filtros atuais.</p>
            </div>
          ) : grouped ? (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Produto</th>
                  <th className="p-3">Localização</th>
                  <th className="p-3 text-right">Lotes</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Reservado</th>
                  <th className="p-3 text-right">Disponível</th>
                  <th className="p-3 text-right">Mín / Máx</th>
                  <th className="p-3">Próx. validade</th>
                </tr>
              </thead>
              <tbody>
                {aggregated.map((a) => (
                  <tr key={a.key} className="border-t">
                    <td className="p-3 font-medium">{a.description}</td>
                    <td className="p-3">{a.location_name}</td>
                    <td className="p-3 text-right">{a.batches}</td>
                    <td className="p-3 text-right">{fmt(a.total)}</td>
                    <td className="p-3 text-right">{fmt(a.reserved)}</td>
                    <td className="p-3 text-right font-semibold">{fmt(a.available)}</td>
                    <td className="p-3 text-right text-muted-foreground">
                      {a.min == null ? "—" : fmt(a.min)} / {a.max == null ? "—" : fmt(a.max)}
                    </td>
                    <td className="p-3">{fmtDate(a.nextExp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Produto</th>
                  <th className="p-3">Localização</th>
                  <th className="p-3">Lote</th>
                  <th className="p-3">Validade</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Reservado</th>
                  <th className="p-3 text-right">Disponível</th>
                  <th className="p-3 text-right">Mín / Máx</th>
                  <th className="p-3">Situação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3">
                      <div className="font-medium">{r.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.internal_code ?? r.barcode ?? "—"}
                      </div>
                    </td>
                    <td className="p-3">{r.location_name}</td>
                    <td className="p-3">{r.batch_code ?? "—"}</td>
                    <td className="p-3">
                      {fmtDate(r.expiration_date)}
                      {r.days_to_expire != null && r.days_to_expire < 30 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-700">
                          <AlertTriangle className="h-3 w-3" />
                          {r.days_to_expire < 0 ? "vencido" : `${r.days_to_expire}d`}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">{fmt(r.quantity_total)}</td>
                    <td className="p-3 text-right">{fmt(r.quantity_reserved)}</td>
                    <td className="p-3 text-right font-semibold">{fmt(r.quantity_available)}</td>
                    <td className="p-3 text-right text-muted-foreground">
                      {r.min_quantity == null ? "—" : fmt(r.min_quantity)} /{" "}
                      {r.max_quantity == null ? "—" : fmt(r.max_quantity)}
                    </td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                          STATUS_TONE[r.replenishment_status],
                        )}
                      >
                        {STATUS_LABEL[r.replenishment_status]}
                      </span>
                      {r.batch_status !== "ACTIVE" && (
                        <span className="ml-2 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
                          Lote {r.batch_status === "BLOCKED" ? "bloqueado" : "vencido"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
