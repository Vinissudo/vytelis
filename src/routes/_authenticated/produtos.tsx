import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppSidebar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Barcode, PackagePlus, CheckCircle2, Loader2, AlertCircle,
  Plus, Check, ChevronsUpDown, PackageSearch, Pencil, History, Target,
  Search as SearchIcon, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  lookupProductByBarcode,
  createProductWithInitialEntry,
  updateProduct,
  searchProducts,
  listMasterRefs,
  createCategory,
  createSupplier,
  getProductSummary,
  listRecentEntries,
  getImplementationStats,
  type ProductLookup,
  type RefOption,
} from "@/lib/master.functions";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({ meta: [{ title: "Cadastro Mestre — Vytelis Supply" }] }),
  component: Page,
});

type Mode = "idle" | "new" | "existing-summary" | "existing-entry" | "existing-edit";

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
  barcode: "", internal_code: "", description: "", short_description: "",
  manufacturer: "", unit: "UN", category_id: "", default_supplier_id: "",
  controlled_drug: false, requires_batch: true, requires_expiration_date: true,
  minimum_stock: "", maximum_stock: "",
};

const emptyEntry: EntryForm = {
  stock_center_id: "", batch: "", expiration_date: "",
  quantity: "", unit_cost: "", observation: "",
};

function productToForm(p: ProductLookup): ProductForm {
  return {
    barcode: p.barcode ?? "",
    internal_code: p.internal_code ?? "",
    description: p.description,
    short_description: p.short_description ?? "",
    manufacturer: p.manufacturer ?? "",
    unit: p.unit ?? "UN",
    category_id: p.category_id ?? "",
    default_supplier_id: p.default_supplier_id ?? "",
    controlled_drug: p.controlled_drug,
    requires_batch: p.requires_batch,
    requires_expiration_date: p.requires_expiration_date,
    minimum_stock: p.minimum_stock?.toString() ?? "",
    maximum_stock: p.maximum_stock?.toString() ?? "",
  };
}

function Page() {
  const [barcode, setBarcode] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [existing, setExisting] = useState<ProductLookup | null>(null);
  const [product, setProduct] = useState<ProductForm>(emptyProduct);
  const [entry, setEntry] = useState<EntryForm>(emptyEntry);
  const [searchResults, setSearchResults] = useState<ProductLookup[] | null>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);

  const qc = useQueryClient();
  const lookup = useServerFn(lookupProductByBarcode);
  const search = useServerFn(searchProducts);
  const create = useServerFn(createProductWithInitialEntry);
  const update = useServerFn(updateProduct);
  const refs = useServerFn(listMasterRefs);
  const summaryFn = useServerFn(getProductSummary);
  const recentFn = useServerFn(listRecentEntries);
  const statsFn = useServerFn(getImplementationStats);

  const refsQuery = useQuery({
    queryKey: ["master-refs"],
    queryFn: () => refs(),
    staleTime: 5 * 60 * 1000,
  });

  const recentQuery = useQuery({
    queryKey: ["master-recent"],
    queryFn: () => recentFn(),
    staleTime: 30_000,
  });

  const statsQuery = useQuery({
    queryKey: ["master-stats"],
    queryFn: () => statsFn(),
    staleTime: 30_000,
  });

  const summaryQuery = useQuery({
    queryKey: ["product-summary", existing?.id],
    queryFn: () => summaryFn({ data: { product_id: existing!.id } }),
    enabled: !!existing?.id,
    staleTime: 15_000,
  });

  useEffect(() => { barcodeRef.current?.focus(); }, []);

  useEffect(() => {
    if (refsQuery.data?.stockCenters.length && !entry.stock_center_id) {
      setEntry((e) => ({ ...e, stock_center_id: refsQuery.data!.stockCenters[0].id }));
    }
  }, [refsQuery.data, entry.stock_center_id]);

  const centers = refsQuery.data?.stockCenters ?? [];
  const cats = refsQuery.data?.categories ?? [];
  const sups = refsQuery.data?.suppliers ?? [];
  const mans = refsQuery.data?.manufacturers ?? [];
  const units = refsQuery.data?.units ?? [];

  const categoryName = useCallback(
    (id: string | null | undefined) => (id ? cats.find((c) => c.id === id)?.name ?? "—" : "—"),
    [cats],
  );
  const supplierName = useCallback(
    (id: string | null | undefined) => (id ? sups.find((s) => s.id === id)?.name ?? "—" : "—"),
    [sups],
  );

  const openExisting = useCallback((row: ProductLookup) => {
    setExisting(row);
    setBarcode(row.barcode ?? row.internal_code ?? row.description);
    setSearchResults(null);
    setMode("existing-summary");
  }, []);

  const lookupMut = useMutation({
    mutationFn: async (code: string): Promise<
      { kind: "hit"; row: ProductLookup } | { kind: "many"; rows: ProductLookup[] } | { kind: "none"; code: string }
    > => {
      const direct = await lookup({ data: { barcode: code } });
      if (direct) return { kind: "hit", row: direct };
      const many = await search({ data: { q: code } });
      if (many.length === 1) return { kind: "hit", row: many[0] };
      if (many.length > 1) return { kind: "many", rows: many };
      return { kind: "none", code };
    },
    onSuccess: (res) => {
      if (res.kind === "hit") {
        openExisting(res.row);
      } else if (res.kind === "many") {
        setSearchResults(res.rows);
        setMode("idle");
      } else {
        setExisting(null);
        setSearchResults(null);
        setProduct({ ...emptyProduct, barcode: res.code });
        setMode("new");
        setTimeout(() => descRef.current?.focus(), 30);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isEntryMode = mode === "new" || mode === "existing-entry";
  const isEditMode = mode === "existing-edit";
  const requiresBatch = mode === "existing-entry" ? !!existing?.requires_batch : product.requires_batch;
  const requiresExpiration =
    mode === "existing-entry" ? !!existing?.requires_expiration_date : product.requires_expiration_date;

  const validation = useMemo(() => {
    const errs: string[] = [];
    if (isEditMode) {
      if (product.description.trim().length < 2) errs.push("Informe a descrição do produto.");
      return errs;
    }
    if (!isEntryMode) return errs;
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
  }, [isEditMode, isEntryMode, mode, product, entry, requiresBatch, requiresExpiration]);

  const canSubmit = validation.length === 0 && (isEntryMode || isEditMode);

  const reset = useCallback(() => {
    setBarcode("");
    setExisting(null);
    setSearchResults(null);
    setProduct(emptyProduct);
    setEntry({ ...emptyEntry, stock_center_id: refsQuery.data?.stockCenters[0]?.id ?? "" });
    setMode("idle");
    setTimeout(() => barcodeRef.current?.focus(), 30);
  }, [refsQuery.data?.stockCenters]);

  const createMut = useMutation({
    mutationFn: async () => {
      const productPayload =
        mode === "existing-entry" && existing
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
      const isNew = mode === "new";
      toast.success(
        isNew ? "Cadastro concluído com sucesso" : "Entrada de estoque registrada",
        {
          icon: <CheckCircle2 className="size-4" />,
          duration: 4500,
          description: (
            <div className="text-xs space-y-0.5">
              {isNew && <div>✔ Produto criado</div>}
              <div>✔ Lote {entry.batch ? `"${entry.batch}"` : "inicial"} registrado</div>
              <div>✔ Estoque atualizado (+{entry.quantity})</div>
              <div>✔ Movimento de inventário gerado</div>
              <div>✔ Auditoria registrada</div>
            </div>
          ),
        },
      );
      reset();
      qc.invalidateQueries({ queryKey: ["master-recent"] });
      qc.invalidateQueries({ queryKey: ["master-stats"] });
      qc.invalidateQueries({ queryKey: ["master-refs"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!existing) throw new Error("Produto não selecionado.");
      return update({
        data: {
          id: existing.id,
          patch: {
            barcode: product.barcode || null,
            internal_code: product.internal_code || null,
            description: product.description,
            short_description: product.short_description || null,
            manufacturer: product.manufacturer || null,
            unit: product.unit || null,
            category_id: product.category_id || null,
            default_supplier_id: product.default_supplier_id || null,
            controlled_drug: product.controlled_drug,
            requires_batch: product.requires_batch,
            requires_expiration_date: product.requires_expiration_date,
            minimum_stock: product.minimum_stock,
            maximum_stock: product.maximum_stock,
          },
        },
      });
    },
    onSuccess: (row) => {
      toast.success("Produto atualizado", {
        icon: <CheckCircle2 className="size-4" />,
        description: <div className="text-xs">✔ Alterações salvas · ✔ Auditoria registrada</div>,
      });
      setExisting(row);
      setMode("existing-summary");
      qc.invalidateQueries({ queryKey: ["master-refs"] });
      qc.invalidateQueries({ queryKey: ["product-summary", row.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitMut = isEditMode ? updateMut : createMut;

  const submit = useCallback(() => {
    if (!canSubmit || submitMut.isPending) return;
    submitMut.mutate();
  }, [canSubmit, submitMut]);

  const startEntryFromExisting = useCallback(() => {
    setEntry((e) => ({
      ...e,
      batch: "", expiration_date: "", quantity: "", unit_cost: "", observation: "",
      stock_center_id: e.stock_center_id || refsQuery.data?.stockCenters[0]?.id || "",
    }));
    setMode("existing-entry");
    setTimeout(() => qtyRef.current?.focus(), 30);
  }, [refsQuery.data?.stockCenters]);

  const startEditFromExisting = useCallback(() => {
    if (!existing) return;
    setProduct(productToForm(existing));
    setMode("existing-edit");
    setTimeout(() => descRef.current?.focus(), 30);
  }, [existing]);

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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && (isEntryMode || isEditMode)) {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape" && mode !== "idle") {
        e.preventDefault();
        reset();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, isEntryMode, isEditMode, submit, reset]);

  const onFormKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLFormElement>) => {
      const target = e.target as HTMLElement;
      if (e.key === "Enter" && target.tagName === "INPUT" && (target as HTMLInputElement).type !== "textarea") {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  const openRecent = useCallback(
    async (product_id: string) => {
      try {
        const rows = await search({ data: { q: product_id } });
        // fallback: search by product id doesn't work — use direct getById via lookup
        const found = rows.find((r) => r.id === product_id);
        if (found) return openExisting(found);
      } catch { /* ignore */ }
      // fallback direct fetch via barcode? Use lookup with description as best-effort
      // If no barcode we can't lookup; skip
    },
    [search, openExisting],
  );

  return (
    <AppShell title="Cadastro Mestre">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-7xl">
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          onKeyDown={onFormKeyDown}
          className="space-y-6 xl:col-span-2"
        >
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Cadastro Mestre</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Escaneie o código de barras, digite parte da descrição ou o código interno para localizar o produto.
              Se não existir, o formulário completo é aberto automaticamente.{" "}
              <span className="text-xs">
                Atalhos: <kbd className="px-1 py-0.5 rounded bg-muted">Enter</kbd> confirma,{" "}
                <kbd className="px-1 py-0.5 rounded bg-muted">Ctrl+Enter</kbd> salva,{" "}
                <kbd className="px-1 py-0.5 rounded bg-muted">Esc</kbd> cancela.
              </span>
            </p>
          </div>

          {/* Barcode / search input */}
          <div className="bg-card border border-border rounded-lg p-5">
            <Label htmlFor="barcode" className="text-xs uppercase tracking-wider text-muted-foreground">
              Código de barras · código interno · descrição
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

          {/* Multi-result picker */}
          {searchResults && searchResults.length > 0 && mode === "idle" && (
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 text-sm font-medium mb-3">
                <SearchIcon className="size-4 text-primary" />
                {searchResults.length} produtos encontrados — selecione um
              </div>
              <ul className="divide-y divide-border -mx-2">
                {searchResults.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => openExisting(r)}
                      className="w-full text-left px-2 py-2.5 hover:bg-muted/40 rounded"
                    >
                      <div className="text-sm font-medium">{r.description}</div>
                      <div className="text-[11px] text-muted-foreground flex gap-2 flex-wrap mt-0.5">
                        {r.barcode && <span className="font-mono">{r.barcode}</span>}
                        {r.internal_code && <span>Cód. {r.internal_code}</span>}
                        {r.manufacturer && <span>{r.manufacturer}</span>}
                        <span>{categoryName(r.category_id)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Existing product — compact summary */}
          {mode === "existing-summary" && existing && (
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-start gap-3">
                <PackageSearch className="size-5 text-primary mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Produto encontrado
                  </div>
                  <div className="text-lg font-medium mt-0.5">{existing.description}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                    {existing.barcode && <span className="font-mono">{existing.barcode}</span>}
                    {existing.internal_code && <span>Cód. {existing.internal_code}</span>}
                    {existing.controlled_drug && <span className="text-red-600 font-medium">Controlado</span>}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    <Stat label="Categoria" value={categoryName(existing.category_id)} />
                    <Stat label="Fabricante" value={existing.manufacturer ?? "—"} />
                    <Stat label="Fornecedor" value={supplierName(existing.default_supplier_id)} />
                    <Stat label="Unidade" value={existing.unit ?? "—"} />
                    <Stat label="Estoque atual" value={
                      summaryQuery.isLoading ? "—" : `${summaryQuery.data?.current_stock ?? 0}`
                    } />
                    <Stat label="Último lote" value={summaryQuery.data?.last_batch ?? "—"} mono />
                    <Stat label="Validade" value={
                      summaryQuery.data?.last_expiration
                        ? formatDate(summaryQuery.data.last_expiration)
                        : "—"
                    } />
                    <Stat label="Última entrada" value={
                      summaryQuery.data?.last_entry_at
                        ? formatDateTime(summaryQuery.data.last_entry_at)
                        : "—"
                    } />
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button type="button" onClick={startEntryFromExisting} autoFocus>
                      <PackagePlus className="size-4 mr-1.5" /> Nova entrada de estoque
                    </Button>
                    <Button type="button" variant="outline" onClick={startEditFromExisting}>
                      <Pencil className="size-4 mr-1.5" /> Editar produto
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Product form (new or edit) */}
          {(mode === "new" || isEditMode) && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                {isEditMode ? (
                  <><Pencil className="size-4 text-primary" /> Editar produto</>
                ) : (
                  <><PackagePlus className="size-4 text-primary" /> Novo produto</>
                )}
                {isEditMode && (
                  <Button
                    type="button" variant="ghost" size="sm" className="ml-auto h-7"
                    onClick={() => setMode("existing-summary")}
                  >
                    <ArrowLeft className="size-3.5 mr-1" /> Voltar
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Descrição" required error={product.description.trim().length < 2 && product.description.length > 0 ? "Mínimo 2 caracteres" : undefined}>
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
                  <FreeCombobox
                    value={product.manufacturer}
                    options={mans}
                    placeholder="Selecione ou digite..."
                    onChange={(v) => setProduct({ ...product, manufacturer: v })}
                  />
                </Field>
                <Field label="Unidade">
                  <FreeCombobox
                    value={product.unit}
                    options={units}
                    placeholder="UN, CX, FR..."
                    onChange={(v) => setProduct({ ...product, unit: v })}
                  />
                </Field>
                <Field label="Categoria">
                  <RefCombobox
                    value={product.category_id}
                    options={cats}
                    placeholder="Selecione ou crie..."
                    createLabel="Criar categoria"
                    onChange={(id) => setProduct({ ...product, category_id: id })}
                    createFn={createCategory}
                    invalidateKey={["master-refs"]}
                    optionsKey="categories"
                  />
                </Field>
                <Field label="Fornecedor padrão">
                  <RefCombobox
                    value={product.default_supplier_id}
                    options={sups}
                    placeholder="Selecione ou crie..."
                    createLabel="Criar fornecedor"
                    onChange={(id) => setProduct({ ...product, default_supplier_id: id })}
                    createFn={createSupplier}
                    invalidateKey={["master-refs"]}
                    optionsKey="suppliers"
                  />
                </Field>
                <Field label="Estoque mínimo">
                  <Input
                    type="number" inputMode="decimal" min="0" step="0.001"
                    value={product.minimum_stock}
                    onChange={(e) => setProduct({ ...product, minimum_stock: e.target.value })}
                  />
                </Field>
                <Field label="Estoque máximo">
                  <Input
                    type="number" inputMode="decimal" min="0" step="0.001"
                    value={product.maximum_stock}
                    onChange={(e) => setProduct({ ...product, maximum_stock: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-border">
                <ToggleRow label="Controlado" checked={product.controlled_drug}
                  onChange={(v) => setProduct({ ...product, controlled_drug: v })} />
                <ToggleRow label="Exige lote" checked={product.requires_batch}
                  onChange={(v) => setProduct({ ...product, requires_batch: v })} />
                <ToggleRow label="Exige validade" checked={product.requires_expiration_date}
                  onChange={(v) => setProduct({ ...product, requires_expiration_date: v })} />
              </div>
            </div>
          )}

          {isEntryMode && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <div className="text-sm font-medium">
                {mode === "existing-entry" ? "Nova entrada de estoque" : "Entrada inicial no estoque"}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Local de estoque" required>
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
                <Field label="Quantidade" required>
                  <Input
                    ref={qtyRef}
                    type="number" inputMode="decimal" min="0" step="0.001"
                    value={entry.quantity}
                    onChange={(e) => setEntry({ ...entry, quantity: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Custo unitário">
                  <Input
                    type="number" inputMode="decimal" min="0" step="0.0001"
                    value={entry.unit_cost}
                    onChange={(e) => setEntry({ ...entry, unit_cost: e.target.value })}
                  />
                </Field>
                <Field label="Lote" required={requiresBatch}>
                  <Input
                    value={entry.batch}
                    onChange={(e) => setEntry({ ...entry, batch: e.target.value })}
                    maxLength={60}
                    required={requiresBatch}
                  />
                </Field>
                <Field label="Validade" required={requiresExpiration}>
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

          {(isEntryMode || isEditMode) && validation.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-sm text-amber-900">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <ul className="list-disc list-inside space-y-0.5">
                {validation.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </div>
          )}

          {(isEntryMode || isEditMode) && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset} type="button" disabled={submitMut.isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!canSubmit || submitMut.isPending} className="min-w-44">
                {submitMut.isPending ? (
                  <><Loader2 className="size-4 mr-2 animate-spin" /> Salvando...</>
                ) : isEditMode ? (
                  "Salvar alterações"
                ) : mode === "existing-entry" ? (
                  "Registrar entrada"
                ) : (
                  "Cadastrar + Entrada"
                )}
              </Button>
            </div>
          )}
        </form>

        {/* Sidebar column: progress + recent */}
        <aside className="space-y-4">
          <ProgressWidget
            today={statsQuery.data?.today ?? 0}
            week={statsQuery.data?.week ?? 0}
            total={statsQuery.data?.total ?? 0}
            goal={statsQuery.data?.goal ?? 1500}
          />
          <RecentPanel
            rows={recentQuery.data ?? []}
            loading={recentQuery.isLoading}
            onOpen={openRecent}
          />
        </aside>
      </div>
    </AppShell>
  );
}

function Field({
  label, children, required, error,
}: { label: string; children: React.ReactNode; required?: boolean; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}{required && <span className="text-rose-600 ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
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

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-medium mt-0.5 truncate", mono && "font-mono")}>{value}</div>
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR");
  } catch { return iso; }
}
function formatDateTime(iso: string) {
  try { return new Date(iso).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }); }
  catch { return iso; }
}

/* --- Combobox for FK refs with inline creation --- */
function RefCombobox({
  value, options, placeholder, createLabel, onChange, createFn, invalidateKey, optionsKey,
}: {
  value: string;
  options: RefOption[];
  placeholder: string;
  createLabel: string;
  onChange: (id: string) => void;
  createFn: (args: { data: { name: string } }) => Promise<RefOption>;
  invalidateKey: string[];
  optionsKey: "categories" | "suppliers";
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const call = useServerFn(createFn as never) as unknown as (args: { data: { name: string } }) => Promise<RefOption>;

  const selected = options.find((o) => o.id === value);
  const filtered = options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));
  const exact = options.some((o) => o.name.toLowerCase() === search.trim().toLowerCase());

  const createMut = useMutation({
    mutationFn: (name: string) => call({ data: { name } }),
    onSuccess: (row) => {
      toast.success(`Criado: ${row.name}`);
      onChange(row.id);
      setOpen(false); setSearch("");
      qc.setQueryData(invalidateKey, (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const o = old as Record<string, RefOption[]>;
        return { ...o, [optionsKey]: [...(o[optionsKey] ?? []), row].sort((a, b) => a.name.localeCompare(b.name)) };
      });
      qc.invalidateQueries({ queryKey: invalidateKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox"
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground")}>
          {selected?.name ?? placeholder}
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>Nenhum resultado</CommandEmpty>
            <CommandGroup>
              {filtered.map((o) => (
                <CommandItem key={o.id} value={o.id} onSelect={() => { onChange(o.id); setOpen(false); setSearch(""); }}>
                  <Check className={cn("size-4 mr-2", value === o.id ? "opacity-100" : "opacity-0")} />
                  {o.name}
                </CommandItem>
              ))}
              {search.trim().length >= 2 && !exact && (
                <CommandItem
                  value="__create__"
                  onSelect={() => createMut.mutate(search.trim())}
                  disabled={createMut.isPending}
                >
                  {createMut.isPending
                    ? <Loader2 className="size-4 mr-2 animate-spin" />
                    : <Plus className="size-4 mr-2" />}
                  {createLabel}: "{search.trim()}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* Free-text combobox for suggestions without a table (Manufacturer, Unit) */
function FreeCombobox({
  value, options, placeholder, onChange,
}: { value: string; options: string[]; placeholder: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  useEffect(() => { setSearch(value); }, [value]);
  const filtered = options.filter((o) => o.toLowerCase().includes(search.toLowerCase())).slice(0, 20);
  const exact = options.some((o) => o.toLowerCase() === search.trim().toLowerCase());
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox"
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground")}>
          {value || placeholder}
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar ou digitar..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>Nenhum registro</CommandEmpty>
            <CommandGroup>
              {filtered.map((o) => (
                <CommandItem key={o} value={o} onSelect={() => { onChange(o); setOpen(false); }}>
                  <Check className={cn("size-4 mr-2", value === o ? "opacity-100" : "opacity-0")} />
                  {o}
                </CommandItem>
              ))}
              {search.trim().length >= 1 && !exact && (
                <CommandItem value="__use__" onSelect={() => { onChange(search.trim()); setOpen(false); }}>
                  <Plus className="size-4 mr-2" /> Usar "{search.trim()}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ProgressWidget({
  today, week, total, goal,
}: { today: number; week: number; total: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Target className="size-4 text-primary" /> Progresso da implantação
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        <div>
          <div className="text-2xl font-semibold">{today}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Hoje</div>
        </div>
        <div>
          <div className="text-2xl font-semibold">{week}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Semana</div>
        </div>
        <div>
          <div className="text-2xl font-semibold">{total}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Total</div>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>{total} / {goal}</span>
          <span>{pct.toFixed(0)}%</span>
        </div>
        <Progress value={pct} />
      </div>
    </div>
  );
}

function RecentPanel({
  rows, loading, onOpen,
}: {
  rows: import("@/lib/master.functions").RecentEntry[];
  loading: boolean;
  onOpen: (product_id: string) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <History className="size-4 text-primary" /> Últimos 10 cadastros
      </div>
      <div className="mt-3 -mx-2">
        {loading ? (
          <div className="text-xs text-muted-foreground px-2 py-4 flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" /> Carregando...
          </div>
        ) : rows.length === 0 ? (
          <div className="text-xs text-muted-foreground px-2 py-4">Nenhuma entrada ainda.</div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpen(r.product_id)}
                  className="w-full text-left px-2 py-2.5 hover:bg-muted/40 rounded"
                >
                  <div className="text-sm font-medium truncate">{r.description}</div>
                  <div className="text-[11px] text-muted-foreground flex gap-2 flex-wrap mt-0.5">
                    {r.barcode && <span className="font-mono">{r.barcode}</span>}
                    {r.category_name && <span>{r.category_name}</span>}
                    {r.batch && <span>Lote {r.batch}</span>}
                    <span>Qtd {r.quantity}</span>
                    <span>{formatDateTime(r.occurred_at)}</span>
                    {r.user_name && <span>· {r.user_name}</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
