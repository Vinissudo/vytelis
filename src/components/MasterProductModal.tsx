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
import { createMasterProduct, type ReceivingProduct } from "@/lib/receiving.functions";

export interface MasterProductPrefill {
  gtin?: string | null;
  description?: string | null;
  manufacturer?: string | null;
  purchase_unit?: string | null;
  supplier_id?: string | null;
}

interface Props {
  open: boolean;
  prefill: MasterProductPrefill;
  onOpenChange: (open: boolean) => void;
  /** Chamado após salvar — o recebimento continua imediatamente. */
  onCreated: (product: ReceivingProduct) => void;
}

/**
 * Cadastro Mestre em modal, aberto automaticamente quando o GTIN lido não existe.
 * Não interrompe o fluxo: ao salvar, devolve o produto para o recebimento.
 */
export function MasterProductModal({ open, prefill, onOpenChange, onCreated }: Props) {
  const createFn = useServerFn(createMasterProduct);
  const [description, setDescription] = useState("");
  const [internalCode, setInternalCode] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [purchaseUnit, setPurchaseUnit] = useState("CX");
  const [consumptionUnit, setConsumptionUnit] = useState("UN");
  const [packageQuantity, setPackageQuantity] = useState("1");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [controlled, setControlled] = useState(false);
  const [coldChain, setColdChain] = useState(false);
  const [fractioning, setFractioning] = useState(false);
  const [requiresBatch, setRequiresBatch] = useState(true);
  const [requiresExpiration, setRequiresExpiration] = useState(true);

  useEffect(() => {
    if (!open) return;
    setDescription(prefill.description ?? "");
    setInternalCode("");
    setManufacturer(prefill.manufacturer ?? "");
    setPurchaseUnit((prefill.purchase_unit ?? "CX").toUpperCase());
    setConsumptionUnit("UN");
    setPackageQuantity("1");
    setMinimum(""); setMaximum("");
    setControlled(false); setColdChain(false); setFractioning(false);
    setRequiresBatch(true); setRequiresExpiration(true);
  }, [open, prefill]);

  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          gtin: prefill.gtin?.trim() || null,
          internal_code: internalCode.trim() || null,
          description: description.trim(),
          manufacturer: manufacturer.trim() || null,
          default_supplier_id: prefill.supplier_id || null,
          purchase_unit: purchaseUnit.trim() || "UN",
          consumption_unit: consumptionUnit.trim() || "UN",
          package_quantity: packageQuantity.trim() || "1",
          minimum_stock: minimum.trim() === "" ? null : Number(minimum),
          maximum_stock: maximum.trim() === "" ? null : Number(maximum),
          controlled_drug: controlled,
          cold_chain: coldChain,
          allows_fractioning: fractioning,
          requires_batch: requiresBatch,
          requires_expiration_date: requiresExpiration,
        },
      }),
    onSuccess: (product) => {
      toast.success("Produto cadastrado", { description: "✓ Produto Mestre · ✓ Auditoria" });
      onOpenChange(false);
      onCreated(product);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao cadastrar produto"),
  });

  const canSave = description.trim().length >= 2 && Number(packageQuantity) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-4 w-4" /> Cadastro Mestre
          </DialogTitle>
          <DialogDescription>
            GTIN <span className="font-mono">{prefill.gtin || "—"}</span> não existe.
            Cadastre agora e o recebimento continua automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Input
              autoFocus value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Dipirona sódica 500mg comprimido"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Código interno</Label>
              <Input value={internalCode} onChange={(e) => setInternalCode(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Fabricante</Label>
              <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Unidade de compra</Label>
              <Input value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Unidade de consumo *</Label>
              <Input
                value={consumptionUnit}
                onChange={(e) => setConsumptionUnit(e.target.value)}
                placeholder="COMPRIMIDO, AMPOLA, FRASCO…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Qtd. por embalagem *</Label>
              <Input
                type="number" inputMode="decimal" min="1" step="1"
                value={packageQuantity}
                onChange={(e) => setPackageQuantity(e.target.value)}
              />
            </div>
          </div>

          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            O estoque é sempre controlado na unidade de consumo:{" "}
            <strong>
              1 {purchaseUnit || "UN"} = {packageQuantity || "1"} {consumptionUnit || "UN"}
            </strong>
            .
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Estoque mínimo</Label>
              <Input type="number" inputMode="decimal" min="0"
                value={minimum} onChange={(e) => setMinimum(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Estoque máximo</Label>
              <Input type="number" inputMode="decimal" min="0"
                value={maximum} onChange={(e) => setMaximum(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border bg-muted/30 px-3 py-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={controlled} onCheckedChange={setControlled} /> Medicamento controlado
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={coldChain} onCheckedChange={setColdChain} /> Necessita cadeia fria
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={fractioning} onCheckedChange={setFractioning} /> Permite fracionamento
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={requiresBatch} onCheckedChange={setRequiresBatch} /> Exige lote
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={requiresExpiration} onCheckedChange={setRequiresExpiration} /> Exige validade
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!canSave || mut.isPending}>
            {mut.isPending
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando…</>
              : "Cadastrar e continuar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
