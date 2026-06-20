import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { QrCode } from "lucide-react";
import { AppShell } from "@/components/AppSidebar";
import { CrudShell, FormDialog, Field, StatusBadge, Input } from "@/components/Crud";

export const Route = createFileRoute("/leitos")({
  head: () => ({ meta: [{ title: "Leitos — HospitalFlow" }] }),
  component: LeitosPage,
});

const SETORES = ["UTI", "Clínica Médica", "Centro Cirúrgico", "Pronto Socorro"] as const;
type Setor = (typeof SETORES)[number];

interface Leito {
  id: string;
  codigo: string;
  setor: Setor;
  qrCode: string;
  ativo: boolean;
}

const initial: Leito[] = [
  { id: "b1", codigo: "UTI-101", setor: "UTI", qrCode: "QR-UTI-101", ativo: true },
  { id: "b2", codigo: "UTI-102", setor: "UTI", qrCode: "QR-UTI-102", ativo: true },
  { id: "b3", codigo: "CM-201", setor: "Clínica Médica", qrCode: "QR-CM-201", ativo: true },
  { id: "b4", codigo: "CM-202", setor: "Clínica Médica", qrCode: "QR-CM-202", ativo: false },
  { id: "b5", codigo: "CC-S1", setor: "Centro Cirúrgico", qrCode: "QR-CC-S1", ativo: true },
  { id: "b6", codigo: "PS-A1", setor: "Pronto Socorro", qrCode: "QR-PS-A1", ativo: true },
];

function LeitosPage() {
  const [rows, setRows] = useState<Leito[]>(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Leito | null>(null);
  const [codigo, setCodigo] = useState("");
  const [setor, setSetor] = useState<Setor>(SETORES[0]);
  const [qrCode, setQrCode] = useState("");
  const [ativo, setAtivo] = useState(true);

  const reset = () => {
    setEditing(null);
    setCodigo("");
    setSetor(SETORES[0]);
    setQrCode("");
    setAtivo(true);
  };

  const onAdd = () => {
    reset();
    setOpen(true);
  };

  const onEdit = (l: Leito) => {
    setEditing(l);
    setCodigo(l.codigo);
    setSetor(l.setor);
    setQrCode(l.qrCode);
    setAtivo(l.ativo);
    setOpen(true);
  };

  const onDelete = (l: Leito) => {
    if (confirm(`Excluir leito "${l.codigo}"?`)) setRows((r) => r.filter((x) => x.id !== l.id));
  };

  const onSubmit = () => {
    if (!codigo.trim()) return;
    if (editing) {
      setRows((r) =>
        r.map((x) =>
          x.id === editing.id ? { ...x, codigo, setor, qrCode, ativo } : x,
        ),
      );
    } else {
      setRows((r) => [
        ...r,
        {
          id: crypto.randomUUID(),
          codigo,
          setor,
          qrCode: qrCode || `QR-${codigo}`,
          ativo,
        },
      ]);
    }
    setOpen(false);
    reset();
  };

  return (
    <AppShell title="Leitos">
      <CrudShell
        title="Leitos"
        description="Cadastro dos leitos hospitalares com código identificador e QR Code."
        rows={rows}
        columns={[
          {
            key: "codigo",
            label: "Código",
            render: (r) => <span className="font-medium">{r.codigo}</span>,
          },
          {
            key: "setor",
            label: "Setor",
            render: (r) => (
              <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {r.setor}
              </span>
            ),
          },
          {
            key: "qrCode",
            label: "QR Code",
            render: (r) => (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                <QrCode className="size-3.5" />
                {r.qrCode}
              </span>
            ),
          },
          {
            key: "ativo",
            label: "Status",
            render: (r) => <StatusBadge active={r.ativo} />,
          },
        ]}
        searchKeys={["codigo", "setor", "qrCode"]}
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
        title={editing ? "Editar leito" : "Novo leito"}
        onSubmit={onSubmit}
      >
        <Field label="Código do Leito">
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Ex: UTI-101"
            autoFocus
          />
        </Field>
        <Field label="Setor">
          <select
            value={setor}
            onChange={(e) => setSetor(e.target.value as Setor)}
            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {SETORES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="QR Code">
          <Input
            value={qrCode}
            onChange={(e) => setQrCode(e.target.value)}
            placeholder="Gerado automaticamente se vazio"
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
