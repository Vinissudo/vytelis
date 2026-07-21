import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppSidebar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Barcode, PackagePlus, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  lookupProductByBarcode,
  createProductWithInitialEntry,
  listMasterRefs,
  type ProductLookup,
} from "@/lib/master.functions";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({ meta: [{ title: "Cadastro Mestre — Vytelis Supply" }] }),
  component: Page,
});

type Mode = "idle" | "new" | "existing";

interface ProductForm {
  barcode: string;
  internal_code: string;
  description: string;
  short_description: string;
  manufacturer: string;
  unit: string;
  category_id: string;
  default_supplier_id: string;
  controlled_drug: boolean;
  requires_batch: boolean;
  requires_expiration_date: boolean;
  minimum_stock: string;
  maximum_stock: string;
}

interface EntryForm {
  stock_center_id: string;
  batch: string;
  expiration_date: string;
  quantity: string;
  unit_cost: string;
  observation: string;
}

const emptyProduct: ProductForm = {
  barcode: "",
  internal_code: "",
  description: "",
  short_description: "",
  manufacturer: "",
  unit: "UN",
  category_id: "",
  default_supplier_id: "",
  controlled_drug: false,
  requires_batch: true,
  requires_expiration_date: true,
  minimum_stock: "",
  maximum_stock: "",
};

const emptyEntry: EntryForm = {
  stock_center_id: "",
  batch: "",
  expiration_date: "",
  quantity: "",
  unit_cost: "",
  observation: "",
};

function Page() {
  const [barcode, setBarcode] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [existing, setExisting] = useState<ProductLookup | null>(null);
  const [product, setProduct] = useState<ProductForm>(emptyProduct);
  const [entry, setEntry] = useState<EntryForm>(emptyEntry);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);

  const qc = useQueryClient();
  const lookup = useServerFn(lookupProductByBarcode);
  const create = useServerFn(createProductWithInitialEntry);
  const refs = useServerFn(listMasterRefs);

  const refsQuery = useQuery({
    queryKey: ["master-refs"],
    queryFn: () => refs(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  useEffect(() => {
    if (refsQuery.data?.stockCenters.length && !entry.stock_center_id) {
      setEntry((e) => ({ ...e, stock_center_id: refsQuery.data!.stockCenters[0].id }));
    }
  }, [refsQuery.data, entry.stock_center_id]);

  const lookupMut = useMutation({
    mutationFn: (code: string) => lookup({ data: { barcode: code } }),
    onSuccess: (row, code) => {
      if (row) {
        setExisting(row);
        setMode("existing");
        setEntry((e) => ({
          ...e,
          batch: "",
          expiration_date: "",
          quantity: "",
          unit_cost: "",
          observation: "",
        }));
        setTimeout(() => qtyRef.current?.focus(), 30);
      } else {
        setExisting(null);
        setProduct({ ...emptyProduct, barcode: code });
        setMode("new");
        setTimeout(() => descRef.current?.focus(), 30);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const centers = refsQuery.data?.stockCenters ?? [];
  const cats = refsQuery.data?.categories ?? [];
  const sups = refsQuery.data?.suppliers ?? [];

  const requiresBatch = mode === "existing" ? !!existing?.requires_batch : product.requires_batch;
  const requiresExpiration =
    mode === "existing" ? !!existing?.requires_expiration_date : product.requires_expiration_date;

  const validation = useMemo(() => {
    const errs: string[] = [];
    if (mode === "idle") return errs;
    if (!entry.stock_center_id) errs.push("Selecione o local de estoque.");
    const qty = Number(entry.quantity);
    if (!entry.quantity || Number.isNaN(qty) || qty <= 0) errs.push("Quantidade deve ser maior que zero.");
    if (entry.unit_cost && Number(entry.unit_cost) < 0) errs.push("Custo não pode ser negativo.");
    if (mode === "new" && product.description.trim().length < 2)
      errs.push("Informe a descrição do produto.");
    if (requiresBatch && !entry.batch.trim()) errs.push("Lote é obrigatório para este produto.");
    if (requiresExpiration && !entry.expiration_date) errs.push("Validade é obrigatória para este produto.");
    if (entry.expiration_date && entry.expiration_date < new Date().toISOString().slice(0, 10))
      errs.push("Validade não pode ser anterior a hoje.");
    return errs;
  }, [mode, existing, product, entry, requiresBatch, requiresExpiration]);

  const canSubmit = validation.length === 0 && mode !== "idle";

  const reset = useCallback(() => {
    setBarcode("");
    setExisting(null);
    setProduct(emptyProduct);
    setEntry({ ...emptyEntry, stock_center_id: refsQuery.data?.stockCenters[0]?.id ?? "" });
    setMode("idle");
    setTimeout(() => barcodeRef.current?.focus(), 30);
  }, [refsQuery.data?.stockCenters]);

  const submitMut = useMutation({
    mutationFn: async () => {
      const productPayload =
        mode === "existing" && existing
          ? { id: existing.id }
          : {
              barcode: product.barcode || undefined,
              internal_code: product.internal_code || undefined,
              description: product.description,
              short_description: product.short_description || undefined,
              manufacturer: product.manufacturer || undefined,
              unit: product.unit || undefined,
              category_id: product.category_id || undefined,
              default_supplier_id: product.default_supplier_id || undefined,
              controlled_drug: product.controlled_drug,
              requires_batch: product.requires_batch,
              requires_expiration_date: product.requires_expiration_date,
              minimum_stock: product.minimum_stock || undefined,
              maximum_stock: product.maximum_stock || undefined,
            };
      return create({
        data: {
          product: productPayload,
          entry: {
            stock_center_id: entry.stock_center_id || undefined,
            batch: entry.batch || undefined,
            expiration_date: entry.expiration_date || undefined,
            quantity: entry.quantity,
            unit_cost: entry.unit_cost || undefined,
            observation: entry.observation || undefined,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success(
        mode === "existing"
          ? "Entrada registrada no estoque."
          : "Produto cadastrado com entrada inicial.",
        { icon: <CheckCircle2 className="size-4" /> },
      );
      reset();
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = useCallback(() => {
    if (!canSubmit || submitMut.isPending) return;
    submitMut.mutate();
  }, [canSubmit, submitMut]);

  const onBarcodeKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const code = barcode.trim();
        if (!code || lookupMut.isPending) return;
        lookupMut.mutate(code);
      }
    },
    [barcode, lookupMut],
  );

  // Ctrl/Cmd + Enter anywhere = submit; Esc = reset
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && mode !== "idle") {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape" && mode !== "idle") {
        e.preventDefault();
        reset();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, submit, reset]);

  const onFormKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLFormElement>) => {
      // Enter in a normal input submits (except textarea / date pickers already fine)
      const target = e.target as HTMLElement;
      if (e.key === "Enter" && target.tagName === "INPUT") {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  return (
    <AppShell title="Cadastro Mestre">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={onFormKeyDown}
        className="space-y-6 max-w-5xl"
      >
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Cadastro Mestre</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Escaneie o código de barras para localizar o produto ou cadastrar um novo com sua
            entrada inicial em um único fluxo.{" "}
            <span className="text-xs">
              Atalhos: <kbd className="px-1 py-0.5 rounded bg-muted">Enter</kbd> confirma,{" "}
              <kbd className="px-1 py-0.5 rounded bg-muted">Esc</kbd> cancela.
            </span>
          </p>
        </div>

        {/* Barcode input */}
        <div className="bg-card border border-border rounded-lg p-5">
          <Label htmlFor="barcode" className="text-xs uppercase tracking-wider text-muted-foreground">
            Código de barras
          </Label>
          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <Barcode className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="barcode"
                ref={barcodeRef}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={onBarcodeKey}
                placeholder="Escaneie ou digite e pressione Enter..."
                className="pl-9 h-11 text-base font-mono"
                autoComplete="off"
                spellCheck={false}
                disabled={lookupMut.isPending || submitMut.isPending}
              />
            </div>
            {mode !== "idle" && (
              <Button variant="outline" onClick={reset} type="button" disabled={submitMut.isPending}>
                Limpar
              </Button>
            )}
          </div>
          {lookupMut.isPending && (
            <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" /> Consultando...
            </p>
          )}
        </div>

        {mode === "existing" && existing && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-5 text-emerald-600 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium text-emerald-900">Produto encontrado</div>
                <div className="text-sm text-emerald-800 mt-0.5">{existing.description}</div>
                <div className="text-xs text-emerald-700 mt-1 flex gap-3 flex-wrap">
                  {existing.internal_code && <span>Cód. {existing.internal_code}</span>}
                  {existing.manufacturer && <span>{existing.manufacturer}</span>}
                  {existing.unit && <span>{existing.unit}</span>}
                  {existing.controlled_drug && <span className="text-red-700">Controlado</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {mode === "new" && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <PackagePlus className="size-4 text-primary" />
              Novo produto
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Descrição *">
                <Input
                  ref={descRef}
                  value={product.description}
                  onChange={(e) => setProduct({ ...product, description: e.target.value })}
                  placeholder="Ex.: Dipirona 500mg comprimido"
                  maxLength={500}
                  required
                />
              </Field>
              <Field label="Descrição curta">
                <Input
                  value={product.short_description}
                  onChange={(e) => setProduct({ ...product, short_description: e.target.value })}
                  placeholder="Dipirona 500mg"
                  maxLength={120}
                />
              </Field>
              <Field label="Código interno">
                <Input
                  value={product.internal_code}
                  onChange={(e) => setProduct({ ...product, internal_code: e.target.value })}
                  maxLength={60}
                />
              </Field>
              <Field label="Código de barras">
                <Input
                  value={product.barcode}
                  onChange={(e) => setProduct({ ...product, barcode: e.target.value })}
                  className="font-mono"
                  maxLength={120}
                />
              </Field>
              <Field label="Fabricante">
                <Input
                  value={product.manufacturer}
                  onChange={(e) => setProduct({ ...product, manufacturer: e.target.value })}
                  maxLength={200}
                />
              </Field>
              <Field label="Unidade">
                <Input
                  value={product.unit}
                  onChange={(e) => setProduct({ ...product, unit: e.target.value })}
                  placeholder="UN, CX, FR..."
                  maxLength={20}
                />
              </Field>
              <Field label="Categoria">
                <Select
                  value={product.category_id || undefined}
                  onValueChange={(v) => setProduct({ ...product, category_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {cats.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Fornecedor padrão">
                <Select
                  value={product.default_supplier_id || undefined}
                  onValueChange={(v) => setProduct({ ...product, default_supplier_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {sups.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Estoque mínimo">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.001"
                  value={product.minimum_stock}
                  onChange={(e) => setProduct({ ...product, minimum_stock: e.target.value })}
                />
              </Field>
              <Field label="Estoque máximo">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.001"
                  value={product.maximum_stock}
                  onChange={(e) => setProduct({ ...product, maximum_stock: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-border">
              <ToggleRow
                label="Controlado"
                checked={product.controlled_drug}
                onChange={(v) => setProduct({ ...product, controlled_drug: v })}
              />
              <ToggleRow
                label="Exige lote"
                checked={product.requires_batch}
                onChange={(v) => setProduct({ ...product, requires_batch: v })}
              />
              <ToggleRow
                label="Exige validade"
                checked={product.requires_expiration_date}
                onChange={(v) => setProduct({ ...product, requires_expiration_date: v })}
              />
            </div>
          </div>
        )}

        {mode !== "idle" && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="text-sm font-medium">Entrada inicial no estoque</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Local de estoque *">
                <Select
                  value={entry.stock_center_id || undefined}
                  onValueChange={(v) => setEntry({ ...entry, stock_center_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {centers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Quantidade *">
                <Input
                  ref={qtyRef}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.001"
                  value={entry.quantity}
                  onChange={(e) => setEntry({ ...entry, quantity: e.target.value })}
                  required
                />
              </Field>
              <Field label="Custo unitário">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.0001"
                  value={entry.unit_cost}
                  onChange={(e) => setEntry({ ...entry, unit_cost: e.target.value })}
                />
              </Field>
              <Field label={`Lote${requiresBatch ? " *" : ""}`}>
                <Input
                  value={entry.batch}
                  onChange={(e) => setEntry({ ...entry, batch: e.target.value })}
                  maxLength={60}
                  required={requiresBatch}
                />
              </Field>
              <Field label={`Validade${requiresExpiration ? " *" : ""}`}>
                <Input
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={entry.expiration_date}
                  onChange={(e) => setEntry({ ...entry, expiration_date: e.target.value })}
                  required={requiresExpiration}
                />
              </Field>
              <Field label="Observação">
                <Input
                  value={entry.observation}
                  onChange={(e) => setEntry({ ...entry, observation: e.target.value })}
                  placeholder="Opcional"
                  maxLength={500}
                />
              </Field>
            </div>
          </div>
        )}

        {mode !== "idle" && validation.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-sm text-amber-900">
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            <ul className="list-disc list-inside space-y-0.5">
              {validation.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </div>
        )}

        {mode !== "idle" && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset} type="button" disabled={submitMut.isPending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit || submitMut.isPending}
              className="min-w-40"
            >
              {submitMut.isPending ? (
                <><Loader2 className="size-4 mr-2 animate-spin" /> Salvando...</>
              ) : mode === "existing" ? (
                "Registrar entrada"
              ) : (
                "Cadastrar + Entrada"
              )}
            </Button>
          </div>
        )}
      </form>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 px-3 h-10 rounded-md border border-border bg-background text-sm cursor-pointer">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
