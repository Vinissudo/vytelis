import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, PackagePlus } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createProductWithInitialEntry } from "@/lib/master.functions";

interface Props {
  open: boolean;
  barcode: string;
  stockCenterId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful creation so the movement flow can resume. */
  onCreated: (barcode: string) => void;
}

/**
 * Quick Master Catalog registration invoked from the movement screen when a
 * scanned code does not exist. Returns straight back to the movement flow.
 */
export function QuickProductModal({ open, barcode, stockCenterId, onOpenChange, onCreated }: Props) {
  const createFn = useServerFn(createProductWithInitialEntry);
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("UN");
  const [requiresBatch, setRequiresBatch] = useState(true);
  const [requiresExpiration, setRequiresExpiration] = useState(true);
  const [batch, setBatch] = useState("");
  const [expiration, setExpiration] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [minimum, setMinimum] = useState("");

  useEffect(() => {
    if (open) {
      setDescription(""); setUnit("UN"); setRequiresBatch(true); setRequiresExpiration(true);
      setBatch(""); setExpiration(""); setQuantity(""); setUnitCost(""); setMinimum("");
    }
  }, [open]);

  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          product: {
            barcode: barcode || undefined,
            description: description.trim(),
            unit: unit.trim() || undefined,
            requires_batch: requiresBatch,
            requires_expiration_date: requiresExpiration,
            minimum_stock: minimum.trim() === "" ? undefined : minimum.trim(),
          },
          entry: {
            stock_center_id: stockCenterId ?? undefined,
            batch: batch.trim() || undefined,
            expiration_date: expiration || undefined,
            quantity: quantity.trim(),
            unit_cost: unitCost.trim() || undefined,
            observation: "Cadastro rápido a partir da tela de movimentações",
          },
        },
      }),
    onSuccess: () => {
      toast.success("Produto cadastrado", {
        description: "✓ Produto · ✓ Estoque inicial · ✓ Auditoria",
      });
      onOpenChange(false);
      onCreated(barcode);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao cadastrar"),
  });

  const canSave =
    description.trim().length >= 2 &&
    Number(quantity) > 0 &&
    (!requiresBatch || batch.trim() !== "") &&
    (!requiresExpiration || expiration !== "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-4 w-4" /> Cadastrar produto agora
          </DialogTitle>
          <DialogDescription>
            Código <span className="font-mono">{barcode || "—"}</span> não existe no Cadastro Mestre.
            Cadastre com o estoque inicial e volte direto à movimentação.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Input
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Dipirona 500mg comprimido"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Estoque mínimo</Label>
              <Input
                type="number" inputMode="decimal" min="0"
                value={minimum} onChange={(e) => setMinimum(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-6 rounded-lg border bg-muted/30 px-3 py-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={requiresBatch} onCheckedChange={setRequiresBatch} /> Exige lote
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={requiresExpiration} onCheckedChange={setRequiresExpiration} /> Exige validade
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Lote {requiresBatch && <span className="text-red-600">*</span>}</Label>
              <Input className="font-mono" value={batch} onChange={(e) => setBatch(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Validade {requiresExpiration && <span className="text-red-600">*</span>}</Label>
              <Input type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade inicial *</Label>
              <Input
                type="number" inputMode="decimal" step="0.001" min="0"
                value={quantity} onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Custo unitário</Label>
              <Input
                type="number" inputMode="decimal" step="0.0001" min="0"
                value={unitCost} onChange={(e) => setUnitCost(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!canSave || mut.isPending}>
            {mut.isPending
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando…</>
              : "Cadastrar e voltar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
