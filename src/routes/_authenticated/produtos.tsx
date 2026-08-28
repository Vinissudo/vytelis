import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Package, Plus, Pencil, Eye, Search, Snowflake, ShieldAlert, X } from "lucide-react";

import { AppShell } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ProductGtinsEditor, type GtinItem } from "@/components/ProductGtinsEditor";
import {
  listCatalogProducts,
  createProduct,
  updateCatalogProduct,
  listMasterRefs,
  createCategory,
  listProductGtins,
  addProductGtin,
  removeProductGtin,
  findSimilarProducts,
  type CatalogProduct,
} from "@/lib/master.functions";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({
    meta: [
      { title: "Produtos — Cadastro operacional | Vytelis Supply" },
      {
        name: "description",
        content:
          "Cadastro operacional de produtos hospitalares: identificação, códigos GTIN, unidades de compra e consumo e regras de controle.",
      },
      { property: "og:title", content: "Produtos — Cadastro operacional | Vytelis Supply" },
      {
        property: "og:description",
        content:
          "Cadastre e mantenha o catálogo de produtos do hospital, sem interferir no estoque.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProdutosPage,
});

type Mode = "create" | "edit" | "view";

interface FormState {
  description: string;
  short_description: string;
  manufacturer: string;
  category_id: string;
  default_supplier_id: string;
  purchase_unit: string;
  consumption_unit: string;
  package_quantity: string;
  controlled_drug: boolean;
  requires_batch: boolean;
  requires_expiration_date: boolean;
  cold_chain: boolean;
  allows_fractioning: boolean;
}

const emptyForm = (): FormState => ({
  description: "",
  short_description: "",
  manufacturer: "",
  category_id: "",
  default_supplier_id: "",
  purchase_unit: "",
  consumption_unit: "",
  package_quantity: "1",
  controlled_drug: false,
  requires_batch: true,
  requires_expiration_date: true,
  cold_chain: false,
  allows_fractioning: false,
});

function ProdutosPage() {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [gtins, setGtins] = useState<GtinItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [similar, setSimilar] = useState<{ id: string; description: string }[]>([]);
  const [similarAck, setSimilarAck] = useState(false);

  const fetchList = useServerFn(listCatalogProducts);
  const fetchRefs = useServerFn(listMasterRefs);
  const fetchGtins = useServerFn(listProductGtins);
  const doCreate = useServerFn(createProduct);
  const doUpdate = useServerFn(updateCatalogProduct);
  const doAddGtin = useServerFn(addProductGtin);
  const doRemoveGtin = useServerFn(removeProductGtin);
  const doCreateCategory = useServerFn(createCategory);
  const doFindSimilar = useServerFn(findSimilarProducts);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(term.trim()), 250);
    return () => window.clearTimeout(id);
  }, [term]);

  const listQuery = useQuery({
    queryKey: ["catalog-products", debounced],
    queryFn: () => fetchList({ data: { q: debounced } }),
  });

  const refsQuery = useQuery({ queryKey: ["master-refs"], queryFn: () => fetchRefs({}) });
  const refs = refsQuery.data;

  const categoryName = useCallback(
    (id: string | null) => refs?.categories.find((c) => c.id === id)?.name ?? "—",
    [refs],
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => {
    setMode("create");
    setEditing(null);
    setForm(emptyForm());
    setGtins([]);
    setErrors([]);
    setSimilar([]);
    setSimilarAck(false);
    setOpen(true);
  };

  const openProduct = async (row: CatalogProduct, m: Mode) => {
    setMode(m);
    setEditing(row);
    setErrors([]);
    setSimilar([]);
    setSimilarAck(true);
    setForm({
      description: row.description,
      short_description: row.short_description ?? "",
      manufacturer: row.manufacturer ?? "",
      category_id: row.category_id ?? "",
      default_supplier_id: row.default_supplier_id ?? "",
      purchase_unit: row.purchase_unit ?? "",
      consumption_unit: row.consumption_unit ?? row.unit ?? "",
      package_quantity: String(row.package_quantity ?? 1),
      controlled_drug: row.controlled_drug,
      requires_batch: row.requires_batch,
      requires_expiration_date: row.requires_expiration_date,
      cold_chain: row.cold_chain,
      allows_fractioning: row.allows_fractioning,
    });
    setGtins([]);
    setOpen(true);
    try {
      const rows = await fetchGtins({ data: { product_id: row.id } });
      setGtins(
        rows.map((r) => ({
          id: r.id,
          gtin: r.gtin,
          packaging_level: r.packaging_level,
          quantity_per_gtin: Number(r.quantity_per_gtin),
        })),
      );
    } catch {
      /* silencioso: GTINs opcionais */
    }
  };

  const validate = (): string[] => {
    const e: string[] = [];
    if (form.description.trim().length < 2) e.push("Informe a descrição do produto (mín. 2 caracteres).");
    if (!form.consumption_unit.trim()) e.push("A unidade de consumo é obrigatória.");
    const pkg = Number(form.package_quantity.replace(",", "."));
    if (!Number.isFinite(pkg) || pkg <= 0) e.push("A quantidade por embalagem deve ser maior que zero.");
    return e;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const pkg = Number(form.package_quantity.replace(",", "."));
      const payload = {
        description: form.description.trim(),
        short_description: form.short_description.trim() || null,
        manufacturer: form.manufacturer.trim() || null,
        category_id: form.category_id || null,
        default_supplier_id: form.default_supplier_id || null,
        purchase_unit: form.purchase_unit.trim() || null,
        consumption_unit: form.consumption_unit.trim(),
        package_quantity: pkg,
        controlled_drug: form.controlled_drug,
        requires_batch: form.requires_batch,
        requires_expiration_date: form.requires_expiration_date,
        cold_chain: form.cold_chain,
        allows_fractioning: form.allows_fractioning,
      };

      if (mode === "edit" && editing) {
        await doUpdate({ data: { id: editing.id, patch: payload } });
        return { internal_code: editing.internal_code ?? "" };
      }

      const first = gtins[0];
      const created = await doCreate({
        data: { ...payload, gtin: first?.gtin ?? null },
      });
      for (const extra of gtins.slice(1)) {
        await doAddGtin({
          data: {
            product_id: created.id,
            gtin: extra.gtin,
            packaging_level: extra.packaging_level,
            quantity_per_gtin: extra.quantity_per_gtin,
          },
        });
      }
      return { internal_code: created.internal_code };
    },
    onSuccess: (res) => {
      toast.success(
        mode === "edit"
          ? "Produto atualizado."
          : `Produto cadastrado — código interno ${res.internal_code}.`,
      );
      void qc.invalidateQueries({ queryKey: ["catalog-products"] });
      setOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar o produto.");
    },
  });

  const handleSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (e.length) return;

    if (mode === "create" && !similarAck) {
      try {
        const found = await doFindSimilar({ data: { description: form.description.trim() } });
        if (found.length) {
          setSimilar(found);
          setSimilarAck(true);
          return;
        }
      } catch {
        /* aviso é opcional */
      }
      setSimilarAck(true);
    }
    saveMutation.mutate();
  };

  const handleAddGtin = async (item: GtinItem) => {
    if (mode === "edit" && editing) {
      const row = await doAddGtin({
        data: {
          product_id: editing.id,
          gtin: item.gtin,
          packaging_level: item.packaging_level,
          quantity_per_gtin: item.quantity_per_gtin,
        },
      });
      setGtins((g) => [...g, { ...item, id: row.id }]);
      return;
    }
    setGtins((g) => [...g, item]);
  };

  const handleRemoveGtin = async (item: GtinItem, index: number) => {
    if (item.id) await doRemoveGtin({ data: { id: item.id } });
    setGtins((g) => g.filter((_, i) => i !== index));
  };

  const addCategory = async () => {
    const name = window.prompt("Nome da nova categoria");
    if (!name || name.trim().length < 2) return;
    try {
      const cat = await doCreateCategory({ data: { name: name.trim() } });
      await qc.invalidateQueries({ queryKey: ["master-refs"] });
      set("category_id", cat.id);
      toast.success("Categoria criada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar categoria.");
    }
  };

  const rows = listQuery.data ?? [];
  const readOnly = mode === "view";

  const conversionHint = useMemo(() => {
    const pkg = Number(form.package_quantity.replace(",", "."));
    if (!Number.isFinite(pkg) || pkg <= 0 || !form.consumption_unit.trim()) return null;
    const pu = form.purchase_unit.trim() || "embalagem";
    return `1 ${pu} = ${pkg} ${form.consumption_unit.trim()}`;
  }, [form.package_quantity, form.purchase_unit, form.consumption_unit]);

  return (
    <AppShell title="Produtos">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Produtos</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Cadastro operacional do catálogo. Não movimenta estoque.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-4" /> Novo produto
          </Button>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Buscar por código, descrição, fabricante ou GTIN..."
                className="pl-9 h-9"
              />
            </div>
            <span className="text-xs text-muted-foreground ml-auto">
              {listQuery.isFetching ? "Buscando..." : `${rows.length} produto(s)`}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  {["Código", "Produto", "Categoria", "Fabricante", "Un. consumo", "GTIN", "Status"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ),
                  )}
                  <th className="px-4 py-2.5 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      {listQuery.isLoading ? "Carregando..." : "Nenhum produto encontrado."}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{row.internal_code ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium flex items-center gap-1.5">
                          {row.description}
                          {row.controlled_drug && (
                            <ShieldAlert className="size-3.5 text-amber-600" aria-label="Controlado" />
                          )}
                          {row.cold_chain && (
                            <Snowflake className="size-3.5 text-sky-600" aria-label="Cadeia fria" />
                          )}
                        </div>
                        {row.short_description && (
                          <div className="text-xs text-muted-foreground">{row.short_description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">{categoryName(row.category_id)}</td>
                      <td className="px-4 py-3">{row.manufacturer ?? "—"}</td>
                      <td className="px-4 py-3">{row.consumption_unit ?? row.unit ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">{row.gtin ?? row.barcode ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                            row.active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {row.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => void openProduct(row, "view")}
                            className="size-8 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="Visualizar"
                          >
                            <Eye className="size-4" />
                          </button>
                          <button
                            onClick={() => void openProduct(row, "edit")}
                            className="size-8 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="Editar"
                          >
                            <Pencil className="size-4" />
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="size-4" />
              {mode === "create"
                ? "Novo produto"
                : mode === "edit"
                  ? "Editar produto"
                  : "Detalhes do produto"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <Block title="Identificação">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label>Descrição *</Label>
                  <Input
                    value={form.description}
                    disabled={readOnly}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="Ex.: Dipirona sódica 500mg comprimido"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição curta</Label>
                  <Input
                    value={form.short_description}
                    disabled={readOnly}
                    onChange={(e) => set("short_description", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Código interno</Label>
                  <Input
                    value={editing?.internal_code ?? "Gerado automaticamente ao salvar"}
                    readOnly
                    className="bg-muted/50 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <div className="flex gap-2">
                    <select
                      value={form.category_id}
                      disabled={readOnly}
                      onChange={(e) => set("category_id", e.target.value)}
                      className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">Sem categoria</option>
                      {(refs?.categories ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {!readOnly && (
                      <Button type="button" variant="outline" size="sm" onClick={() => void addCategory()}>
                        <Plus className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Fabricante</Label>
                  <Input
                    value={form.manufacturer}
                    disabled={readOnly}
                    list="fabricantes"
                    onChange={(e) => set("manufacturer", e.target.value)}
                  />
                  <datalist id="fabricantes">
                    {(refs?.manufacturers ?? []).map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label>Fornecedor padrão</Label>
                  <select
                    value={form.default_supplier_id}
                    disabled={readOnly}
                    onChange={(e) => set("default_supplier_id", e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">Nenhum</option>
                    {(refs?.suppliers ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </Block>

            <Block title="Códigos (GTIN)">
              <ProductGtinsEditor
                items={gtins}
                onAdd={handleAddGtin}
                onRemove={handleRemoveGtin}
                disabled={readOnly}
              />
            </Block>

            <Block title="Unidades">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Unidade de compra</Label>
                  <Input
                    value={form.purchase_unit}
                    disabled={readOnly}
                    list="unidades"
                    onChange={(e) => set("purchase_unit", e.target.value.toUpperCase())}
                    placeholder="CX"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Unidade de consumo *</Label>
                  <Input
                    value={form.consumption_unit}
                    disabled={readOnly}
                    list="unidades"
                    onChange={(e) => set("consumption_unit", e.target.value.toUpperCase())}
                    placeholder="COMPRIMIDO"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Qtd. por embalagem *</Label>
                  <Input
                    value={form.package_quantity}
                    disabled={readOnly}
                    onChange={(e) => set("package_quantity", e.target.value)}
                  />
                </div>
                <datalist id="unidades">
                  {(refs?.units ?? []).map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
              {conversionHint && (
                <p className="text-xs text-muted-foreground mt-2">{conversionHint}</p>
              )}
            </Block>

            <Block title="Regras">
              <div className="grid sm:grid-cols-2 gap-3">
                <Toggle
                  label="Medicamento controlado"
                  checked={form.controlled_drug}
                  disabled={readOnly}
                  onChange={(v) => set("controlled_drug", v)}
                />
                <Toggle
                  label="Exige lote"
                  checked={form.requires_batch}
                  disabled={readOnly}
                  onChange={(v) => set("requires_batch", v)}
                />
                <Toggle
                  label="Exige validade"
                  checked={form.requires_expiration_date}
                  disabled={readOnly}
                  onChange={(v) => set("requires_expiration_date", v)}
                />
                <Toggle
                  label="Cadeia fria"
                  checked={form.cold_chain}
                  disabled={readOnly}
                  onChange={(v) => set("cold_chain", v)}
                />
                <Toggle
                  label="Permite fracionamento"
                  checked={form.allows_fractioning}
                  disabled={readOnly}
                  onChange={(v) => set("allows_fractioning", v)}
                />
              </div>
            </Block>

            {errors.length > 0 && (
              <ul className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive space-y-1">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}

            {similar.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    {similar.map((s) => (
                      <p key={s.id}>Já existe produto semelhante: {s.description}.</p>
                    ))}
                    <p className="mt-1">
                      Deseja revisar antes de cadastrar? Clique em Salvar novamente para continuar
                      mesmo assim.
                    </p>
                  </div>
                  <button onClick={() => setSimilar([])} aria-label="Fechar aviso">
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {readOnly ? "Fechar" : "Cancelar"}
            </Button>
            {!readOnly && (
              <Button onClick={() => void handleSubmit()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 h-10 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}
