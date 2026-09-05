import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/AppSidebar";
import { CrudShell, FormDialog, Field, StatusBadge, Input } from "@/components/Crud";
import { Loader2 } from "lucide-react";
import {
  listStockCenters,
  createStockCenter,
  updateStockCenter,
  deleteStockCenter,
  STOCK_CENTER_TYPES,
  STOCK_CENTER_TYPE_LABELS,
  type StockCenterRow,
  type StockCenterType,
} from "@/lib/locations.functions";

export const Route = createFileRoute("/_authenticated/locais")({
  head: () => ({
    meta: [
      { title: "Locais de Estoque — Vytelis Supply" },
      {
        name: "description",
        content:
          "Cadastro dos locais físicos de estoque do hospital: almoxarifados, farmácias satélites e setores operacionais.",
      },
      { property: "og:title", content: "Locais de Estoque — Vytelis Supply" },
      {
        property: "og:description",
        content: "Crie, edite e desative os locais de estoque usados nas movimentações.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LocaisPage,
});

function LocaisPage() {
  const listFn = useServerFn(listStockCenters);
  const createFn = useServerFn(createStockCenter);
  const updateFn = useServerFn(updateStockCenter);
  const deleteFn = useServerFn(deleteStockCenter);
  const qc = useQueryClient();

  const centers = useQuery({
    queryKey: ["stock-centers-admin"],
    queryFn: () => listFn(),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StockCenterRow | null>(null);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<StockCenterType>("other");
  const [ativo, setAtivo] = useState(true);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["stock-centers-admin"] });
    qc.invalidateQueries({ queryKey: ["movement-centers"] });
    qc.invalidateQueries({ queryKey: ["stock-centers"] });
  };

  const reset = () => {
    setEditing(null);
    setNome("");
    setTipo("other");
    setAtivo(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: nome.trim(), type: tipo, active: ativo };
      if (editing) return updateFn({ data: { id: editing.id, ...payload } });
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success(editing ? "Local atualizado." : "Local criado.");
      setOpen(false);
      reset();
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (row: StockCenterRow) => {
      const res = await deleteFn({ data: { id: row.id } });
      if (!res.ok) throw new Error(res.error ?? "Não foi possível excluir este local.");
      return res;
    },
    onSuccess: () => {
      toast.success("Local excluído.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message, { duration: 7000 }),
  });

  const onAdd = () => {
    reset();
    setOpen(true);
  };

  const onEdit = (row: StockCenterRow) => {
    setEditing(row);
    setNome(row.name);
    setTipo(row.type);
    setAtivo(row.active);
    setOpen(true);
  };

  const onDelete = (row: StockCenterRow) => {
    if (row.balance_rows > 0) {
      toast.error(
        `"${row.name}" possui saldo de estoque e não pode ser excluído. Edite o local e marque como inativo para tirá-lo dos seletores.`,
        { duration: 8000 },
      );
      return;
    }
    if (confirm(`Excluir o local "${row.name}"?`)) remove.mutate(row);
  };

  return (
    <AppShell title="Locais">
      {centers.isLoading ? (
        <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando locais…
        </div>
      ) : centers.isError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Não foi possível carregar os locais de estoque.
        </p>
      ) : (
        <CrudShell
          title="Locais de estoque"
          description="Almoxarifados, farmácias e setores usados como origem e destino das movimentações."
          rows={centers.data ?? []}
          columns={[
            { key: "name", label: "Nome" },
            {
              key: "type",
              label: "Tipo",
              render: (r) => (
                <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {STOCK_CENTER_TYPE_LABELS[r.type] ?? r.type}
                </span>
              ),
            },
            {
              key: "balance_rows",
              label: "Saldos",
              render: (r) => (
                <span className="text-muted-foreground">
                  {r.balance_rows === 0
                    ? "Sem saldo"
                    : `${r.balance_rows} lote(s) · ${r.total_quantity} un.`}
                </span>
              ),
            },
            {
              key: "active",
              label: "Situação",
              render: (r) => <StatusBadge active={r.active} />,
            },
          ]}
          searchKeys={["name"]}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={onDelete}
          emptyLabel="Nenhum local de estoque cadastrado"
        />
      )}

      <FormDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
        title={editing ? "Editar local" : "Novo local"}
        onSubmit={() => {
          if (nome.trim().length < 2) {
            toast.error("Informe um nome com pelo menos 2 caracteres.");
            return;
          }
          save.mutate();
        }}
        submitLabel={save.isPending ? "Salvando…" : "Salvar"}
      >
        <Field label="Nome">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Farmácia UTI"
            autoFocus
          />
        </Field>
        <Field label="Tipo">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as StockCenterType)}
            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {STOCK_CENTER_TYPES.map((t) => (
              <option key={t} value={t}>
                {STOCK_CENTER_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Situação">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="size-4 rounded border-input"
            />
            Local ativo (aparece nos seletores de origem/destino)
          </label>
        </Field>
      </FormDialog>
    </AppShell>
  );
}
