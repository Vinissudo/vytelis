import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppSidebar";
import { CrudShell, FormDialog, Field, StatusBadge, Input } from "@/components/Crud";

export const Route = createFileRoute("/setores")({
  head: () => ({ meta: [{ title: "Setores — HospitalFlow" }] }),
  component: SetoresPage,
});

interface Setor {
  id: string;
  nome: string;
  ativo: boolean;
}

const initial: Setor[] = [
  { id: "s1", nome: "UTI", ativo: true },
  { id: "s2", nome: "Clínica Médica", ativo: true },
  { id: "s3", nome: "Centro Cirúrgico", ativo: true },
  { id: "s4", nome: "Pronto Socorro", ativo: true },
];

function SetoresPage() {
  const [rows, setRows] = useState<Setor[]>(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Setor | null>(null);
  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(true);

  const reset = () => {
    setEditing(null);
    setNome("");
    setAtivo(true);
  };

  const onAdd = () => {
    reset();
    setOpen(true);
  };

  const onEdit = (s: Setor) => {
    setEditing(s);
    setNome(s.nome);
    setAtivo(s.ativo);
    setOpen(true);
  };

  const onDelete = (s: Setor) => {
    if (confirm(`Excluir setor "${s.nome}"?`)) setRows((r) => r.filter((x) => x.id !== s.id));
  };

  const onSubmit = () => {
    if (!nome.trim()) return;
    if (editing) {
      setRows((r) => r.map((x) => (x.id === editing.id ? { ...x, nome, ativo } : x)));
    } else {
      setRows((r) => [...r, { id: crypto.randomUUID(), nome, ativo }]);
    }
    setOpen(false);
    reset();
  };

  return (
    <AppShell title="Setores">
      <CrudShell
        title="Setores"
        description="Setores do hospital onde os leitos e operações estão organizados."
        rows={rows}
        columns={[
          { key: "nome", label: "Nome" },
          {
            key: "ativo",
            label: "Status",
            render: (r) => <StatusBadge active={r.ativo} />,
          },
        ]}
        searchKeys={["nome"]}
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
        title={editing ? "Editar setor" : "Novo setor"}
        onSubmit={onSubmit}
      >
        <Field label="Nome">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: UTI"
            autoFocus
          />
        </Field>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="size-4 rounded border-input"
          />
          Ativo
        </label>
      </FormDialog>
    </AppShell>
  );
}
