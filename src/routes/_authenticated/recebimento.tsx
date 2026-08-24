import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Barcode, FileCode2, Keyboard, Loader2, PackageCheck, Snowflake, ShieldAlert,
  ScanLine, Upload, RotateCcw,
} from "lucide-react";
import { AppShell } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MasterProductModal, type MasterProductPrefill } from "@/components/MasterProductModal";
import { GS1Parser } from "@/services/gs1-parser";
import { NFeParser, type NFeItem } from "@/services/nfe-parser";
import { UnitConversionService } from "@/services/unit-conversion";
import { ScannerService } from "@/services/scanner-service";
import { listMovementStockCenters } from "@/lib/movements.functions";
import {
  createReceipt, ensureSupplier, findProductByKeys, listReceipts,
  listReceivingSuppliers, receiveProductBatch, searchReceivingProducts,
  type ReceivingProduct,
} from "@/lib/receiving.functions";

export const Route = createFileRoute("/_authenticated/recebimento")({
  head: () => ({
    meta: [
      { title: "Recebimento — Vytelis Supply" },
      {
        name: "description",
        content:
          "Motor de recebimento de medicamentos por XML de NF-e, GS1 DataMatrix ou entrada manual, com rastreabilidade por lote.",
      },
      { property: "og:title", content: "Recebimento — Vytelis Supply" },
      {
        property: "og:description",
        content: "Entrada de medicamentos com controle por lote e unidade mínima de consumo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReceivingPage,
});

type Source = "xml" | "gs1" | "manual";

interface ItemDraft {
  batch: string;
  expiration: string;
  manufacture: string;
  purchaseQuantity: string;
  packageQuantity: string;
  purchaseUnit: string;
  unitCost: string;
}

const emptyDraft = (p?: ReceivingProduct | null): ItemDraft => ({
  batch: "",
  expiration: "",
  manufacture: "",
  purchaseQuantity: "1",
  packageQuantity: String(p?.package_quantity ?? 1),
  purchaseUnit: p?.purchase_unit ?? "UN",
  unitCost: "",
});

function ReceivingPage() {
  const qc = useQueryClient();
  const centersFn = useServerFn(listMovementStockCenters);
  const suppliersFn = useServerFn(listReceivingSuppliers);
  const findFn = useServerFn(findProductByKeys);
  const searchFn = useServerFn(searchReceivingProducts);
  const receiveFn = useServerFn(receiveProductBatch);
  const createReceiptFn = useServerFn(createReceipt);
  const ensureSupplierFn = useServerFn(ensureSupplier);
  const receiptsFn = useServerFn(listReceipts);

  const [tab, setTab] = useState<Source>("gs1");
  const [centerId, setCenterId] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");

  const centers = useQuery({ queryKey: ["centers"], queryFn: () => centersFn({}) });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => suppliersFn({}) });
  const receipts = useQuery({
    queryKey: ["receipts", "recent"],
    queryFn: () => receiptsFn({ data: { limit: 10 } }),
  });

  useEffect(() => {
    if (!centerId && centers.data?.length) setCenterId(centers.data[0].id);
  }, [centers.data, centerId]);

  // ---------- fluxo por leitura / manual ----------
  const scanRef = useRef<HTMLInputElement>(null);
  const manualRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [product, setProduct] = useState<ReceivingProduct | null>(null);
  const [draft, setDraft] = useState<ItemDraft>(emptyDraft());
  const [looking, setLooking] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [prefill, setPrefill] = useState<MasterProductPrefill>({});
  const [pendingXmlItem, setPendingXmlItem] = useState<NFeItem | null>(null);

  const focusScanner = useCallback(() => {
    window.setTimeout(() => scanRef.current?.focus(), 20);
  }, []);

  const tabRef = useRef<Source>("gs1");
  tabRef.current = tab;

  const [manualTerm, setManualTerm] = useState("");

  const resetFlow = useCallback(() => {
    setCode("");
    setProduct(null);
    setDraft(emptyDraft());
    if (tabRef.current === "manual") {
      setManualTerm("");
      window.setTimeout(() => manualRef.current?.focus(), 20);
    } else {
      focusScanner();
    }
  }, [focusScanner]);


  const applyProduct = useCallback(
    (p: ReceivingProduct, gs1?: { batch: string | null; expirationDate: string | null; manufactureDate: string | null }) => {
      setProduct(p);
      setDraft({
        ...emptyDraft(p),
        batch: gs1?.batch ?? "",
        expiration: gs1?.expirationDate ?? "",
        manufacture: gs1?.manufactureDate ?? "",
      });
      window.setTimeout(() => qtyRef.current?.focus(), 20);
    },
    [],
  );

  const handleCode = useCallback(
    async (raw: string) => {
      const value = ScannerService.normalize(raw);
      if (!value) return;
      setLooking(true);
      try {
        const parsed = GS1Parser.parse(value);
        const keys = GS1Parser.searchKeys(value);
        const found = keys.length ? await findFn({ data: { keys } }) : null;
        if (found) {
          applyProduct(found, parsed);
        } else {
          setPrefill({
            gtin: parsed.gtin ?? value,
            supplier_id: supplierId || null,
          });
          setPendingXmlItem(null);
          setModalOpen(true);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha na leitura");
      } finally {
        setLooking(false);
      }
    },
    [applyProduct, findFn, supplierId],
  );

  // leitor USB/Bluetooth global (funciona mesmo sem foco no campo)
  useEffect(() => {
    if (tab !== "gs1") return;
    return ScannerService.attachKeyboardWedge((scanned) => void handleCode(scanned));
  }, [tab, handleCode]);

  useEffect(() => {
    if (tab === "gs1") focusScanner();
  }, [tab, focusScanner]);

  const conversion = useMemo(() => {
    if (!product) return null;
    try {
      return UnitConversionService.convert({
        purchaseQuantity: Number(draft.purchaseQuantity),
        packageQuantity: Number(draft.packageQuantity),
        purchaseUnit: draft.purchaseUnit,
        consumptionUnit: product.consumption_unit ?? product.purchase_unit ?? "UN",
        allowsFractioning: product.allows_fractioning,
      });
    } catch {
      return null;
    }
  }, [product, draft]);

  const receiveMut = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("Selecione um produto.");
      return receiveFn({
        data: {
          product_id: product.id,
          stock_center_id: centerId || null,
          supplier_id: supplierId || product.default_supplier_id || null,
          source: tab === "xml" ? "xml" : tab,
          gtin: product.gtin ?? product.barcode ?? null,
          description: product.description,
          batch: draft.batch.trim() || null,
          expiration_date: draft.expiration || null,
          manufacture_date: draft.manufacture || null,
          purchase_unit: draft.purchaseUnit || null,
          purchase_quantity: draft.purchaseQuantity,
          package_quantity: draft.packageQuantity || "1",
          unit_cost: draft.unitCost || null,
          client_datetime: new Date().toISOString(),
        },
      });
    },
    onSuccess: (res) => {
      toast.success("Entrada registrada", {
        description: `✓ Lote · ✓ ${res.consumption_quantity} em unidade de consumo · ✓ Auditoria`,
      });
      void qc.invalidateQueries({ queryKey: ["movements"] });
      void qc.invalidateQueries({ queryKey: ["receipts"] });
      resetFlow();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao receber"),
  });

  const canReceive =
    !!product &&
    !!centerId &&
    Number(draft.purchaseQuantity) > 0 &&
    Number(draft.packageQuantity) > 0 &&
    (!product.requires_batch || draft.batch.trim() !== "") &&
    (!product.requires_expiration_date || draft.expiration !== "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canReceive && !receiveMut.isPending) {
        e.preventDefault();
        receiveMut.mutate();
      }
      if (e.key === "Escape") resetFlow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canReceive, receiveMut, resetFlow]);

  // ---------- busca manual ----------
  const [manualTerm, setManualTerm] = useState("");
  const manualResults = useQuery({
    queryKey: ["receiving", "search", manualTerm],
    queryFn: () => searchFn({ data: { q: manualTerm } }),
    enabled: tab === "manual" && manualTerm.trim().length >= 2,
  });

  // ---------- XML NF-e ----------
  const [xmlDoc, setXmlDoc] = useState<ReturnType<typeof NFeParser.parse> | null>(null);
  const [xmlReceiptId, setXmlReceiptId] = useState<string | null>(null);
  const [xmlStatus, setXmlStatus] = useState<Record<number, string>>({});
  const [xmlBusy, setXmlBusy] = useState(false);

  const onXmlFile = async (file: File) => {
    try {
      const text = await file.text();
      const doc = NFeParser.parse(text);
      setXmlDoc(doc);
      setXmlStatus({});
      setXmlReceiptId(null);
      if (doc.supplier.name) {
        const sup = await ensureSupplierFn({
          data: { name: doc.supplier.name, cnpj: doc.supplier.cnpj },
        });
        setSupplierId(sup.id);
      }
      toast.success(`NF-e ${doc.number ?? ""} lida`, {
        description: `${doc.items.length} itens · ${doc.supplier.name ?? "fornecedor não identificado"}`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "XML inválido");
    }
  };

  const receiveXmlItem = async (item: NFeItem, receiptId: string) => {
    const keys = item.gtin ? GS1Parser.searchKeys(item.gtin) : [];
    const found = keys.length ? await findProductByKeysSafe(keys) : null;
    if (!found) {
      setXmlStatus((s) => ({ ...s, [item.number]: "Produto não cadastrado" }));
      return false;
    }
    await receiveFn({
      data: {
        product_id: found.id,
        stock_center_id: centerId || null,
        supplier_id: supplierId || found.default_supplier_id || null,
        receipt_id: receiptId,
        source: "xml",
        gtin: item.gtin,
        supplier_code: item.supplierCode,
        description: item.description,
        batch: item.batch,
        expiration_date: item.expirationDate,
        manufacture_date: item.manufactureDate,
        purchase_unit: item.purchaseUnit,
        purchase_quantity: item.purchaseQuantity,
        package_quantity: found.package_quantity || 1,
        unit_cost: item.unitCost,
        client_datetime: new Date().toISOString(),
      },
    });
    setXmlStatus((s) => ({ ...s, [item.number]: "Recebido" }));
    return true;
  };

  const findProductByKeysSafe = async (keys: string[]) => {
    try {
      return await findFn({ data: { keys } });
    } catch {
      return null;
    }
  };

  const importXml = async () => {
    if (!xmlDoc) return;
    if (!centerId) return toast.error("Selecione o centro de estoque de destino.");
    setXmlBusy(true);
    try {
      const receipt =
        xmlReceiptId ??
        (
          await createReceiptFn({
            data: {
              source: "xml",
              supplier_id: supplierId || null,
              stock_center_id: centerId,
              nfe_key: xmlDoc.key,
              nfe_number: xmlDoc.number,
              nfe_series: xmlDoc.series,
              issue_date: xmlDoc.issueDate,
              total_value: xmlDoc.totalValue,
            },
          })
        ).id;
      setXmlReceiptId(receipt);
      let ok = 0;
      let pending = 0;
      for (const item of xmlDoc.items) {
        if (xmlStatus[item.number] === "Recebido") continue;
        try {
          (await receiveXmlItem(item, receipt)) ? ok++ : pending++;
        } catch (e) {
          pending++;
          setXmlStatus((s) => ({
            ...s,
            [item.number]: e instanceof Error ? e.message : "Erro",
          }));
        }
      }
      void qc.invalidateQueries({ queryKey: ["receipts"] });
      toast.success(`${ok} itens recebidos`, {
        description: pending ? `${pending} itens pendentes de cadastro/correção` : "NF-e importada",
      });
    } finally {
      setXmlBusy(false);
    }
  };

  // ---------- render ----------
  return (
    <AppShell title="Recebimento">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Centro de estoque de destino *</Label>
                <Select value={centerId} onValueChange={setCenterId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {(centers.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fornecedor</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    {(suppliers.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Tabs value={tab} onValueChange={(v) => setTab(v as Source)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="xml" className="gap-2">
                <FileCode2 className="h-4 w-4" /> XML NF-e
              </TabsTrigger>
              <TabsTrigger value="gs1" className="gap-2">
                <ScanLine className="h-4 w-4" /> GS1
              </TabsTrigger>
              <TabsTrigger value="manual" className="gap-2">
                <Keyboard className="h-4 w-4" /> Manual
              </TabsTrigger>
            </TabsList>

            {/* ---- XML ---- */}
            <TabsContent value="xml" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Importar XML da Nota Fiscal</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground hover:bg-muted/40">
                    <Upload className="h-5 w-5" />
                    Selecione o arquivo XML da NF-e
                    <input
                      type="file" accept=".xml,text/xml,application/xml" className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onXmlFile(f);
                        e.target.value = "";
                      }}
                    />
                  </label>

                  {xmlDoc && (
                    <div className="space-y-3">
                      <div className="grid gap-1 text-sm sm:grid-cols-2">
                        <span><strong>Fornecedor:</strong> {xmlDoc.supplier.name ?? "—"}</span>
                        <span><strong>NF-e:</strong> {xmlDoc.number ?? "—"} / {xmlDoc.series ?? "—"}</span>
                        <span><strong>Emissão:</strong> {xmlDoc.issueDate ?? "—"}</span>
                        <span><strong>Itens:</strong> {xmlDoc.items.length}</span>
                      </div>
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 text-left">Produto</th>
                              <th className="px-3 py-2 text-left">GTIN</th>
                              <th className="px-3 py-2 text-left">Lote</th>
                              <th className="px-3 py-2 text-left">Validade</th>
                              <th className="px-3 py-2 text-right">Qtd.</th>
                              <th className="px-3 py-2 text-left">Situação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {xmlDoc.items.map((it) => (
                              <tr key={it.number} className="border-t">
                                <td className="px-3 py-2">{it.description}</td>
                                <td className="px-3 py-2 font-mono text-xs">{it.gtin ?? "—"}</td>
                                <td className="px-3 py-2 font-mono text-xs">{it.batch ?? "—"}</td>
                                <td className="px-3 py-2">{it.expirationDate ?? "—"}</td>
                                <td className="px-3 py-2 text-right">
                                  {it.purchaseQuantity} {it.purchaseUnit ?? ""}
                                </td>
                                <td className="px-3 py-2">
                                  {xmlStatus[it.number] === "Recebido" ? (
                                    <Badge className="bg-emerald-100 text-emerald-800">Recebido</Badge>
                                  ) : xmlStatus[it.number] ? (
                                    <button
                                      className="text-xs text-amber-700 underline"
                                      onClick={() => {
                                        setPrefill({
                                          gtin: it.gtin,
                                          description: it.description,
                                          purchase_unit: it.purchaseUnit,
                                          supplier_id: supplierId || null,
                                        });
                                        setPendingXmlItem(it);
                                        setModalOpen(true);
                                      }}
                                    >
                                      {xmlStatus[it.number]} — cadastrar
                                    </button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">Pendente</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Button onClick={() => void importXml()} disabled={xmlBusy}>
                        {xmlBusy
                          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importando…</>
                          : <><PackageCheck className="mr-2 h-4 w-4" />Receber itens da NF-e</>}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ---- GS1 ---- */}
            <TabsContent value="gs1" className="space-y-4">
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <Label className="flex items-center gap-2">
                    <Barcode className="h-4 w-4" /> Leitura GS1 / código de barras
                  </Label>
                  <Input
                    ref={scanRef}
                    autoFocus
                    value={code}
                    className="h-12 font-mono text-lg"
                    placeholder="Aponte o leitor ou digite o código…"
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleCode(code);
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Suporta digitação, leitor USB, Bluetooth e DataMatrix GS1 (GTIN, lote e validade
                    são preenchidos automaticamente). Esc limpa · Ctrl+Enter registra.
                  </p>
                  {looking && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Localizando produto…
                    </p>
                  )}
                </CardContent>
              </Card>
              {product && <ItemForm />}
            </TabsContent>

            {/* ---- Manual ---- */}
            <TabsContent value="manual" className="space-y-4">
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <Label>Buscar produto</Label>
                  <Input
                    value={manualTerm}
                    onChange={(e) => setManualTerm(e.target.value)}
                    placeholder="Descrição, código interno ou GTIN"
                  />
                  {(manualResults.data ?? []).length > 0 && !product && (
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                      {(manualResults.data ?? []).map((p) => (
                        <button
                          key={p.id}
                          className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50"
                          onClick={() => applyProduct(p)}
                        >
                          <span className="font-medium">{p.description}</span>
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {p.gtin ?? p.internal_code ?? ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              {product && <ItemForm />}
            </TabsContent>
          </Tabs>
        </div>

        {/* ---- coluna lateral ---- */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Últimos recebimentos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(receipts.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum recebimento registrado.</p>
              )}
              {(receipts.data ?? []).map((r) => (
                <div key={r.id} className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.supplier_name ?? "Sem fornecedor"}</span>
                    <Badge variant="secondary" className="uppercase">{r.source}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.nfe_number ? `NF-e ${r.nfe_number} · ` : ""}
                    {r.item_count} itens ·{" "}
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <MasterProductModal
        open={modalOpen}
        prefill={prefill}
        onOpenChange={setModalOpen}
        onCreated={(p) => {
          if (pendingXmlItem) {
            setXmlStatus((s) => ({ ...s, [pendingXmlItem.number]: "Cadastrado — reimportar" }));
            setPendingXmlItem(null);
            return;
          }
          applyProduct(p, {
            batch: GS1Parser.parse(code).batch,
            expirationDate: GS1Parser.parse(code).expirationDate,
            manufactureDate: GS1Parser.parse(code).manufactureDate,
          });
        }}
      />
    </AppShell>
  );

  function ItemForm() {
    if (!product) return null;
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {product.description}
            {product.controlled_drug && (
              <Badge variant="destructive" className="gap-1">
                <ShieldAlert className="h-3 w-3" /> Controlado
              </Badge>
            )}
            {product.cold_chain && (
              <Badge className="gap-1 bg-sky-100 text-sky-800">
                <Snowflake className="h-3 w-3" /> Cadeia fria
              </Badge>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            GTIN {product.gtin ?? product.barcode ?? "—"} · Unidade de consumo{" "}
            {product.consumption_unit ?? "UN"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Lote {product.requires_batch && <span className="text-red-600">*</span>}</Label>
              <Input
                className="font-mono" value={draft.batch}
                onChange={(e) => setDraft({ ...draft, batch: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Validade {product.requires_expiration_date && <span className="text-red-600">*</span>}
              </Label>
              <Input
                type="date" value={draft.expiration}
                onChange={(e) => setDraft({ ...draft, expiration: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fabricação</Label>
              <Input
                type="date" value={draft.manufacture}
                onChange={(e) => setDraft({ ...draft, manufacture: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Unidade de compra</Label>
              <Input
                value={draft.purchaseUnit}
                onChange={(e) => setDraft({ ...draft, purchaseUnit: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Qtd. comprada *</Label>
              <Input
                ref={qtyRef} type="number" inputMode="decimal" min="0" step="0.001"
                value={draft.purchaseQuantity}
                onChange={(e) => setDraft({ ...draft, purchaseQuantity: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Qtd. por embalagem *</Label>
              <Input
                type="number" inputMode="decimal" min="1" step="1"
                value={draft.packageQuantity}
                onChange={(e) => setDraft({ ...draft, packageQuantity: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Custo unitário</Label>
              <Input
                type="number" inputMode="decimal" min="0" step="0.0001"
                value={draft.unitCost}
                onChange={(e) => setDraft({ ...draft, unitCost: e.target.value })}
              />
            </div>
          </div>

          {conversion && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              Entrada convertida: <strong>{conversion.describe}</strong>
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => receiveMut.mutate()} disabled={!canReceive || receiveMut.isPending}>
              {receiveMut.isPending
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Registrando…</>
                : <><PackageCheck className="mr-2 h-4 w-4" />Registrar entrada (Ctrl+Enter)</>}
            </Button>
            <Button variant="ghost" onClick={resetFlow}>
              <RotateCcw className="mr-2 h-4 w-4" /> Limpar (Esc)
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
}
