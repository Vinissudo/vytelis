import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppSidebar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  Barcode, Loader2, ArrowLeft, ArrowRightLeft, PackageMinus, PackagePlus,
  AlertTriangle, History, CheckCircle2, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  MOVEMENT_TYPES, MOVEMENT_LABELS, INBOUND_TYPES, OUTBOUND_TYPES,
  searchProductsForMovement,
  listMovementStockCenters,
  registerMovement,
  listRecentMovements,
  listStockAlerts,
  type MovementType,
  type ProductLookupRow,
  type StockAlert,
} from "@/lib/movements.functions";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({ meta: [{ title: "Movimentações — Vytelis Supply" }] }),
  component: Page,
});

type Screen = "idle" | "picker" | "product" | "not-found";

const ALERT_STYLE: Record<StockAlert["alert_kind"], { label: string; tone: string }> = {
  out_of_stock:   { label: "Sem estoque",        tone: "bg-red-100 text-red-800 border-red-200" },
  critical_stock: { label: "Estoque crítico",    tone: "bg-red-50 text-red-700 border-red-200" },
  low_stock:      { label: "Estoque baixo",      tone: "bg-amber-50 text-amber-700 border-amber-200" },
  expired:        { label: "Vencido",            tone: "bg-red-100 text-red-800 border-red-200" },
  expiring_7:     { label: "Vence em 7d",        tone: "bg-red-50 text-red-700 border-red-200" },
  expiring_30:    { label: "Vence em 30d",       tone: "bg-amber-50 text-amber-700 border-amber-200" },
  expiring_60:    { label: "Vence em 60d",       tone: "bg-amber-50 text-amber-700 border-amber-200" },
  expiring_90:    { label: "Vence em 90d",       tone: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  no_movement_30:  { label: "Sem giro 30d",  tone: "bg-slate-50 text-slate-600 border-slate-200" },
  no_movement_60:  { label: "Sem giro 60d",  tone: "bg-slate-50 text-slate-600 border-slate-200" },
  no_movement_90:  { label: "Sem giro 90d",  tone: "bg-slate-50 text-slate-600 border-slate-200" },
  no_movement_180: { label: "Sem giro 180d", tone: "bg-slate-100 text-slate-700 border-slate-200" },
  no_movement_365: { label: "Parado 1 ano+", tone: "bg-slate-100 text-slate-700 border-slate-200" },
};

function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function Page() {
  const qc = useQueryClient();
  const currentUser = useCurrentUser();

  const searchFn = useServerFn(searchProductsForMovement);
  const centersFn = useServerFn(listMovementStockCenters);
  const registerFn = useServerFn(registerMovement);
  const recentFn = useServerFn(listRecentMovements);
  const alertsFn = useServerFn(listStockAlerts);

  const [movementType, setMovementType] = useState<MovementType>("purchase_entry");
  const [barcode, setBarcode] = useState("");
  const [screen, setScreen] = useState<Screen>("idle");
  const [candidates, setCandidates] = useState<ProductLookupRow[]>([]);
  const [product, setProduct] = useState<ProductLookupRow | null>(null);
  const [searching, setSearching] = useState(false);

  const [stockCenterId, setStockCenterId] = useState<string>("");
  const [destCenterId, setDestCenterId] = useState<string>("");
  const [batch, setBatch] = useState("");
  const [expiration, setExpiration] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");
  const [observation, setObservation] = useState("");

  const barcodeRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);

  const centersQuery = useQuery({
    queryKey: ["movement-centers"],
    queryFn: () => centersFn(),
    staleTime: 60_000,
  });
  const recentQuery = useQuery({
    queryKey: ["recent-movements"],
    queryFn: () => recentFn({ data: { limit: 15 } }),
    staleTime: 15_000,
  });
  const alertsQuery = useQuery({
    queryKey: ["stock-alerts"],
    queryFn: () => alertsFn({ data: { limit: 30 } }),
    staleTime: 60_000,
  });

  // Set default stock center from user profile
  useEffect(() => {
    if (!stockCenterId && currentUser.data?.stockCenterId) {
      setStockCenterId(currentUser.data.stockCenterId);
    } else if (!stockCenterId && centersQuery.data && centersQuery.data.length > 0) {
      setStockCenterId(centersQuery.data[0].id);
    }
  }, [currentUser.data, centersQuery.data, stockCenterId]);

  const focusBarcode = useCallback(() => {
    setTimeout(() => barcodeRef.current?.focus(), 20);
  }, []);
  useEffect(() => { focusBarcode(); }, [focusBarcode]);

  const resetForm = useCallback(() => {
    setBatch(""); setExpiration(""); setQuantity(""); setUnitCost("");
    setReason(""); setObservation(""); setDestCenterId("");
  }, []);

  const clearAll = useCallback(() => {
    setScreen("idle"); setCandidates([]); setProduct(null); setBarcode("");
    resetForm(); focusBarcode();
  }, [resetForm, focusBarcode]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const results = await searchFn({ data: { q: q.trim() } });
      if (results.length === 0) {
        setCandidates([]); setProduct(null); setScreen("not-found");
      } else if (results.length === 1) {
        setProduct(results[0]); setCandidates([]); setScreen("product");
        // Preload batch/expiration hints
        if (results[0].last_batch && ["consumption","loss","expired","negative_adjustment"].includes(movementType)) {
          setBatch(results[0].last_batch);
          setExpiration(results[0].last_expiration ?? "");
        }
        setTimeout(() => quantityRef.current?.focus(), 40);
      } else {
        setCandidates(results); setProduct(null); setScreen("picker");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na busca");
    } finally {
      setSearching(false);
    }
  }, [searchFn, movementType]);

  const pickProduct = useCallback((p: ProductLookupRow) => {
    setProduct(p); setScreen("product"); setCandidates([]);
    if (p.last_batch && ["consumption","loss","expired","negative_adjustment"].includes(movementType)) {
      setBatch(p.last_batch); setExpiration(p.last_expiration ?? "");
    }
    setTimeout(() => quantityRef.current?.focus(), 40);
  }, [movementType]);

  const registerMut = useMutation({
    mutationFn: (payload: Parameters<typeof registerFn>[0]) => registerFn(payload),
    onSuccess: () => {
      toast.success("Movimento registrado", {
        description: `✓ ${MOVEMENT_LABELS[movementType]}  •  ✓ Estoque atualizado  •  ✓ Auditoria gerada`,
      });
      qc.invalidateQueries({ queryKey: ["recent-movements"] });
      qc.invalidateQueries({ queryKey: ["stock-alerts"] });
      clearAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao registrar"),
  });

  const isTransfer = movementType === "transfer";
  const needsBatch = product?.requires_batch ?? false;
  const needsExpiration = product?.requires_expiration_date ?? false;
  const isInbound = INBOUND_TYPES.includes(movementType);
  const isOutbound = OUTBOUND_TYPES.includes(movementType);

  const handleSubmit = useCallback(() => {
    if (!product) { toast.error("Nenhum produto selecionado"); focusBarcode(); return; }
    if (!stockCenterId) { toast.error("Selecione o local de estoque"); return; }
    if (isTransfer && !destCenterId) { toast.error("Selecione o destino da transferência"); return; }
    if (isTransfer && destCenterId === stockCenterId) { toast.error("Origem e destino devem ser diferentes"); return; }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) { toast.error("Quantidade inválida"); return; }
    if (needsBatch && !batch.trim()) { toast.error("Lote obrigatório para este produto"); return; }
    if (needsExpiration && !expiration) { toast.error("Validade obrigatória para este produto"); return; }

    registerMut.mutate({
      data: {
        movement_type: movementType,
        product_id: product.id,
        stock_center_id: stockCenterId,
        stock_center_dest_id: isTransfer ? destCenterId : null,
        batch: batch.trim() || null,
        expiration_date: expiration || null,
        quantity: qty,
        unit_cost: unitCost.trim() === "" ? null : Number(unitCost),
        movement_reason: reason.trim() || null,
        observation: observation.trim() || null,
        client_datetime: new Date().toISOString(),
      },
    });
  }, [product, stockCenterId, isTransfer, destCenterId, quantity, needsBatch, batch, needsExpiration, expiration, movementType, unitCost, reason, observation, registerMut, focusBarcode]);

  // Global keyboard: Ctrl+Enter submit; Esc clear
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); clearAll(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (screen === "product") handleSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, handleSubmit, clearAll]);

  const stockAtSelectedCenter = useMemo(() => {
    if (!product) return 0;
    const c = product.centers.find((x) => x.stock_center_id === stockCenterId);
    return c?.quantity ?? 0;
  }, [product, stockCenterId]);

  const totalStock = useMemo(
    () => (product ? product.centers.reduce((s, c) => s + c.quantity, 0) : 0),
    [product],
  );

  return (
    <AppShell title="Movimentações de Estoque">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* MAIN COLUMN */}
        <div className="space-y-6">
          {/* Movement type + barcode */}
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
              <div className="space-y-1.5">
                <Label>Tipo de movimento</Label>
                <Select
                  value={movementType}
                  onValueChange={(v) => { setMovementType(v as MovementType); focusBarcode(); }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MOVEMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{MOVEMENT_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="barcode">Código de barras / interno / descrição</Label>
                <div className="relative">
                  <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="barcode"
                    ref={barcodeRef}
                    autoFocus
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); doSearch(barcode); }
                    }}
                    placeholder="Escaneie ou digite e pressione Enter"
                    className="pl-9 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Screens */}
          {searching && (
            <div className="rounded-xl border bg-card p-6 flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando produto…
            </div>
          )}

          {screen === "not-found" && !searching && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-amber-900">Produto não encontrado</p>
                  <p className="text-sm text-amber-800/80 mt-1">
                    O código <span className="font-mono">{barcode}</span> não existe no Cadastro Mestre.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button asChild variant="default">
                      <Link to="/produtos"><ExternalLink className="h-4 w-4 mr-2" />Cadastrar produto</Link>
                    </Button>
                    <Button variant="outline" onClick={clearAll}>Tentar outro</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {screen === "picker" && (
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-medium">{candidates.length} produtos encontrados</p>
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  <ArrowLeft className="h-4 w-4 mr-1" />Voltar
                </Button>
              </div>
              <div className="divide-y">
                {candidates.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => pickProduct(p)}
                    className="w-full text-left py-3 hover:bg-accent/50 rounded px-2 -mx-2 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-medium">{p.description}</p>
                      <span className="text-xs font-mono text-muted-foreground">{p.barcode ?? "—"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.category_name ?? "Sem categoria"} · {p.manufacturer ?? "—"} · {p.unit ?? "UN"}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {screen === "product" && product && (
            <>
              {/* Product summary card */}
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-muted-foreground">{product.barcode ?? "sem barcode"} · {product.internal_code ?? "—"}</p>
                    <h2 className="text-lg font-semibold mt-1 truncate">{product.description}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {product.category_name ?? "Sem categoria"} · {product.manufacturer ?? "—"} · {product.supplier_name ?? "Sem fornecedor"} · {product.unit ?? "UN"}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearAll}>
                    <ArrowLeft className="h-4 w-4 mr-1" />Novo
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <Kpi label="Estoque total" value={fmtQty(totalStock)} />
                  <Kpi label="Neste local" value={fmtQty(stockAtSelectedCenter)}
                       tone={isOutbound && stockAtSelectedCenter <= 0 ? "danger" : undefined} />
                  <Kpi label="Mínimo" value={product.minimum_stock != null ? fmtQty(product.minimum_stock) : "—"} />
                  <Kpi label="Máximo" value={product.maximum_stock != null ? fmtQty(product.maximum_stock) : "—"} />
                </div>

                {product.centers.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {product.centers.map((c) => (
                      <span key={c.stock_center_id} className="text-xs rounded-full border bg-muted/40 px-2 py-1">
                        {c.stock_center_name}: <b>{fmtQty(c.quantity)}</b>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Movement form */}
              <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                  {isTransfer ? <ArrowRightLeft className="h-4 w-4 text-primary" />
                    : isInbound ? <PackagePlus className="h-4 w-4 text-emerald-600" />
                    : <PackageMinus className="h-4 w-4 text-amber-600" />}
                  <span className="font-medium">{MOVEMENT_LABELS[movementType]}</span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{isTransfer ? "Origem" : "Local de estoque"}</Label>
                    <Select value={stockCenterId} onValueChange={setStockCenterId}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {(centersQuery.data ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {isTransfer && (
                    <div className="space-y-1.5">
                      <Label>Destino</Label>
                      <Select value={destCenterId} onValueChange={setDestCenterId}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {(centersQuery.data ?? [])
                            .filter((c) => c.id !== stockCenterId)
                            .map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label>
                      Lote {needsBatch && <span className="text-red-600">*</span>}
                    </Label>
                    <Input value={batch} onChange={(e) => setBatch(e.target.value)}
                           className={cn("font-mono", needsBatch && !batch && "border-red-300")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      Validade {needsExpiration && <span className="text-red-600">*</span>}
                    </Label>
                    <Input type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)}
                           className={cn(needsExpiration && !expiration && "border-red-300")} />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Quantidade <span className="text-red-600">*</span></Label>
                    <Input
                      ref={quantityRef}
                      type="number" inputMode="decimal" step="0.001" min="0"
                      value={quantity} onChange={(e) => setQuantity(e.target.value)}
                      className={cn(!quantity && "border-red-300")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Custo unitário {isInbound && <span className="text-muted-foreground text-xs">(recomendado)</span>}</Label>
                    <Input type="number" inputMode="decimal" step="0.0001" min="0"
                           value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Motivo</Label>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)}
                           placeholder="Ex.: NF 12345, ajuste de contagem, transferência UTI, etc." />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Observação</Label>
                    <Textarea value={observation} onChange={(e) => setObservation(e.target.value)} rows={2} />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    Atalhos: <kbd className="rounded border bg-muted px-1 text-xs">Ctrl</kbd>+
                    <kbd className="rounded border bg-muted px-1 text-xs">Enter</kbd> para salvar ·
                    <kbd className="rounded border bg-muted px-1 text-xs ml-1">Esc</kbd> para limpar
                  </p>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={clearAll}>Cancelar</Button>
                    <Button onClick={handleSubmit} disabled={registerMut.isPending}>
                      {registerMut.isPending
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Registrando…</>
                        : <><CheckCircle2 className="h-4 w-4 mr-2" />Registrar movimento</>}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Recent movements */}
          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Últimas movimentações</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {recentQuery.data?.length ?? 0} registros
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b bg-muted/30">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Tipo</th>
                    <th className="text-left px-4 py-2 font-medium">Produto</th>
                    <th className="text-left px-4 py-2 font-medium">Lote</th>
                    <th className="text-right px-4 py-2 font-medium">Qtd</th>
                    <th className="text-left px-4 py-2 font-medium">Local</th>
                    <th className="text-left px-4 py-2 font-medium">Usuário</th>
                    <th className="text-left px-4 py-2 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {(recentQuery.data ?? []).map((m) => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-accent/30">
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={cn(
                          "text-xs rounded-full px-2 py-0.5 border",
                          INBOUND_TYPES.includes(m.movement_type) ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : OUTBOUND_TYPES.includes(m.movement_type) ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-blue-50 text-blue-700 border-blue-200",
                        )}>
                          {MOVEMENT_LABELS[m.movement_type]}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium truncate max-w-[240px]">{m.product_description}</div>
                        <div className="text-xs font-mono text-muted-foreground">{m.product_barcode ?? "—"}</div>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{m.batch ?? "—"}</td>
                      <td className="px-4 py-2 text-right font-medium">{fmtQty(m.quantity)}</td>
                      <td className="px-4 py-2 text-xs">
                        {m.stock_center_name}
                        {m.stock_center_dest_name && <> → {m.stock_center_dest_name}</>}
                      </td>
                      <td className="px-4 py-2 text-xs">{m.user_name ?? "—"}</td>
                      <td className="px-4 py-2 text-xs whitespace-nowrap text-muted-foreground">{fmtDateTime(m.occurred_at)}</td>
                    </tr>
                  ))}
                  {(recentQuery.data?.length ?? 0) === 0 && !recentQuery.isLoading && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      Nenhuma movimentação registrada ainda.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="space-y-6">
          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="font-medium">Alertas de estoque</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {alertsQuery.data?.length ?? 0}
              </span>
            </div>
            <div className="max-h-[520px] overflow-y-auto divide-y">
              {(alertsQuery.data ?? []).map((a, i) => {
                const style = ALERT_STYLE[a.alert_kind];
                return (
                  <div key={`${a.product_id}-${a.stock_center_id}-${i}`} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium truncate">{a.description}</p>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap", style.tone)}>
                        {style.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Métrica: <b>{fmtQty(a.metric)}</b>
                      {a.ref_date && <> · {new Date(a.ref_date).toLocaleDateString("pt-BR")}</>}
                    </p>
                  </div>
                );
              })}
              {(alertsQuery.data?.length ?? 0) === 0 && !alertsQuery.isLoading && (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Nenhum alerta ativo.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="font-medium mb-3">Motor de Saúde</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cada movimento alimenta cálculos de cobertura, giro, valor de estoque
              e sugestão de compra. Os alertas ao lado e as métricas por local
              acima já refletem os últimos registros em tempo real.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className={cn(
      "rounded-lg border bg-muted/30 px-3 py-2",
      tone === "danger" && "border-red-200 bg-red-50",
    )}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold mt-0.5", tone === "danger" && "text-red-700")}>
        {value}
      </p>
    </div>
  );
}
