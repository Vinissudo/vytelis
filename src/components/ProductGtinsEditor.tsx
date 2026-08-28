import { useState } from "react";
import { Plus, X, Barcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface GtinItem {
  /** Presente quando já persistido em product_gtins. */
  id?: string;
  gtin: string;
  packaging_level: string;
  quantity_per_gtin: number;
}

interface Props {
  items: GtinItem[];
  onAdd: (item: GtinItem) => void | Promise<void>;
  onRemove: (item: GtinItem, index: number) => void | Promise<void>;
  disabled?: boolean;
}

const LEVELS = [
  { value: "each", label: "Unidade" },
  { value: "pack", label: "Embalagem" },
  { value: "case", label: "Caixa" },
];

export function ProductGtinsEditor({ items, onAdd, onRemove, disabled }: Props) {
  const [gtin, setGtin] = useState("");
  const [level, setLevel] = useState("each");
  const [qty, setQty] = useState("1");
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const code = gtin.trim();
    setError(null);
    if (!code) return;
    if (code.length < 6) {
      setError("GTIN deve ter ao menos 6 dígitos.");
      return;
    }
    if (items.some((i) => i.gtin === code)) {
      setError("Este GTIN já foi informado neste produto.");
      return;
    }
    const quantity = Number(qty.replace(",", ".")) || 1;
    try {
      await onAdd({ gtin: code, packaging_level: level, quantity_per_gtin: quantity });
      setGtin("");
      setQty("1");
      setLevel("each");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível adicionar o GTIN.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {items.length === 0 && (
          <span className="text-sm text-muted-foreground">
            Nenhum código informado (opcional).
          </span>
        )}
        {items.map((item, index) => (
          <span
            key={item.id ?? item.gtin}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 pl-3 pr-1.5 py-1 text-xs"
          >
            <Barcode className="size-3.5 text-muted-foreground" />
            <span className="font-mono">{item.gtin}</span>
            <span className="text-muted-foreground">
              {LEVELS.find((l) => l.value === item.packaging_level)?.label ??
                item.packaging_level}
              {item.quantity_per_gtin > 1 ? ` · ${item.quantity_per_gtin}` : ""}
            </span>
            {!disabled && (
              <button
                type="button"
                onClick={() => void onRemove(item, index)}
                className="size-5 grid place-items-center rounded-full hover:bg-background"
                aria-label={`Remover GTIN ${item.gtin}`}
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
      </div>

      {!disabled && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={gtin}
            onChange={(e) => setGtin(e.target.value.replace(/\s/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="GTIN / código de barras"
            className="h-9 font-mono sm:flex-1"
          />
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <Input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Qtd"
            className="h-9 w-24"
          />
          <Button type="button" variant="outline" onClick={() => void add()} className="gap-1.5">
            <Plus className="size-4" /> Adicionar
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
