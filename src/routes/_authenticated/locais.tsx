import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppSidebar";
import { CrudShell, FormDialog, Field, Input } from "@/components/Crud";

export const Route = createFileRoute("/_authenticated/locais")({
  head: () => ({ meta: [{ title: "Locais — HospitalFlow" }] }),
  component: LocaisPage,
});

const TIPOS = [
  "Almoxarifado Central",
  "Farmácia Clínica",
  "Farmácia UTI",
  "Centro Cirúrgico",
  "Pronto Socorro",
] as const;
type Tipo = (typeof TIPOS)[number];

interface Local {
  id: string;
  nome: string;
  tipo: Tipo;
  observacao: string;
}

const initial: Local[] = [
  { id: "l1", nome: "Almoxarifado Principal", tipo: "Almoxarifado Central", observacao: "Estoque geral" },
  { id: "l2", nome: "Farmácia Clínica - 2º Andar", tipo: "Farmácia Clínica", observacao: "" },
  { id: "l3", nome: "Farmácia UTI Adulto", tipo: "Farmácia UTI", observacao: "Atende UTI 1 e 2" },
  { id: "l4", nome: "Centro Cirúrgico - Sala 3", tipo: "Centro Cirúrgico", observacao: "" },
];

function LocaisPage() {
  const [rows, setRows] = useState<Local[]>(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Local | null>(null);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<Tipo>(TIPOS[0]);
  const [observacao, setObservacao] = useState("");

  const reset = () => {
    setEditing(null);
    setNome("");
    setTipo(TIPOS[0]);
    setObservacao("");
  };

  const onAdd = () => {
    reset();
    setOpen(true);
  };

  const onEdit = (l: Local) => {
    setEditing(l);
    setNome(l.nome);
    setTipo(l.tipo);
    setObservacao(l.observacao);
    setOpen(true);
  };

  const onDelete = (l: Local) => {
    if (confirm(`Excluir local "${l.nome}"?`)) setRows((r) => r.filter((x) => x.id !== l.id));
  };

  const onSubmit = () => {
    if (!nome.trim()) return;
    if (editing) {
      setRows((r) =>
        r.map((x) => (x.id === editing.id ? { ...x, nome, tipo, observacao } : x)),
      );
    } else {
      setRows((r) => [...r, { id: crypto.randomUUID(), nome, tipo, observacao }]);
    }
    setOpen(false);
    reset();
  };

  return (
    <AppShell title="Locais">
      <CrudShell
        title="Locais"
        description="Locais físicos do hospital — almoxarifados, farmácias e setores operacionais."
        rows={rows}
        columns={[
          { key: "nome", label: "Nome" },
          {
            key: "tipo",
            label: "Tipo",
            render: (r) => (
              <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {r.tipo}
              </span>
            ),
          },
          {
            key: "observacao",
            label: "Observação",
            render: (r) => (
              <span className="text-muted-foreground">
                {r.observacao || "—"}
              </span>
            ),
          },
        ]}
        searchKeys={["nome", "tipo", "observacao"]}
        onAdd={onAdd}
        onEdit={onEdit}
        onDelete={onDelete}
      />

      <FormDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
        title={editing ? "Editar local" : "Novo local"}
        onSubmit={onSubmit}
      >
        <Field label="Nome">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Farmácia Clínica - 2º Andar"
            autoFocus
          />
        </Field>
        <Field label="Tipo">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as Tipo)}
            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Observação">
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Observações sobre o local"
            rows={3}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </Field>
      </FormDialog>
    </AppShell>
  );
}
