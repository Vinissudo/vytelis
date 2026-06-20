import { useState, type ReactNode } from "react";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Column<T> = {
  key: keyof T | string;
  label: string;
  render?: (row: T) => ReactNode;
  className?: string;
};

interface CrudShellProps<T extends { id: string }> {
  title: string;
  description: string;
  rows: T[];
  columns: Column<T>[];
  searchKeys: (keyof T)[];
  onAdd: () => void;
  onEdit: (row: T) => void;
  onDelete: (row: T) => void;
  emptyLabel?: string;
}

export function CrudShell<T extends { id: string }>({
  title,
  description,
  rows,
  columns,
  searchKeys,
  onAdd,
  onEdit,
  onDelete,
  emptyLabel = "Nenhum registro encontrado",
}: CrudShellProps<T>) {
  const [q, setQ] = useState("");
  const filtered = q
    ? rows.filter((r) =>
        searchKeys.some((k) =>
          String(r[k] ?? "").toLowerCase().includes(q.toLowerCase()),
        ),
      )
    : rows;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        <Button onClick={onAdd} className="gap-2">
          <Plus className="size-4" /> Novo
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar..."
              className="pl-9 h-9"
            />
          </div>
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} {filtered.length === 1 ? "registro" : "registros"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                {columns.map((c) => (
                  <th
                    key={String(c.key)}
                    className={`px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider ${c.className ?? ""}`}
                  >
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    {emptyLabel}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30">
                    {columns.map((c) => (
                      <td
                        key={String(c.key)}
                        className={`px-4 py-3 ${c.className ?? ""}`}
                      >
                        {c.render ? c.render(row) : String(row[c.key as keyof T] ?? "—")}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => onEdit(row)}
                          className="size-8 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Editar"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          onClick={() => onDelete(row)}
                          className="size-8 grid place-items-center rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                          aria-label="Excluir"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onSubmit: () => void;
  children: ReactNode;
  submitLabel?: string;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  onSubmit,
  children,
  submitLabel = "Salvar",
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="space-y-4"
        >
          {children}
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
        active
          ? "bg-emerald-50 text-emerald-700"
          : "bg-muted text-muted-foreground"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
      />
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}

export { Input };
