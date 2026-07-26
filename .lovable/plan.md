
# Sprint: Inventory Movements — Operational Engine

Single production-ready module at `/estoque` (existing route, currently placeholder). Reuses master catalog logic, RLS, audit and enums already in the DB. No redesign; navigation stays as-is.

## 1. Database migration (additive only)

Extend enums and columns; keep every existing table, policy, RPC intact.

- `movement_type` enum: add `purchase_entry`, `positive_adjustment`, `negative_adjustment`, `loss`, `expired`. Keep old values.
- `movements`: add `movement_reason text`, `stock_center_dest_id uuid` (for transfers), `client_datetime timestamptz` (device time for offline PWA prep).
- `suppliers`: add `minimum_order_value numeric`, `free_shipping_threshold numeric`, `avg_delivery_days int`, `payment_terms text`, `rating numeric(3,2)`, `delivery_reliability numeric(5,2)`.
- `products`: add `average_daily_consumption numeric(14,3)`, `lead_time_days int`, `last_purchase_price numeric(14,4)`, `last_purchase_at timestamptz`.
- New RPC `public.register_movement(p jsonb)` — single transactional entry point that:
  - validates hospital scope, stock center ownership, permissions (`can_operate_stock`);
  - enforces batch/expiration per product flags; blocks past-dated expirations on entries;
  - for outbound types (`consumption`, `simple_output`, `loss`, `expired`, `negative_adjustment`, transfer-source): locks the correct `stock_items` row (batch+expiration+center) and rejects when it would go negative;
  - for inbound types (`purchase_entry`, `initial_entry`, `return`, `positive_adjustment`, transfer-dest): upserts `stock_items` (existing conflict key);
  - for `transfer`: performs both legs atomically using the dest center;
  - inserts a matching `movements` row (with `client_datetime`, reason, observation) and an `audit_log` entry;
  - updates product `last_purchase_price` / `last_purchase_at` on purchases.
- New view `public.v_stock_health` per (hospital, product, center): current stock (sum of movements), min/max, coverage days (using `average_daily_consumption`), last movement, last inventory count placeholder, current value.
- New view `public.v_stock_alerts` returning rows tagged `low`, `critical`, `out`, `expiring_7/30/60/90`, `expired`, `no_movement_30/60/90/180/365`.
- Grants + RLS mirroring existing tables.

Only additive changes — nothing existing is broken.

## 2. Server functions (`src/lib/movements.functions.ts`)

All `requireSupabaseAuth`, Zod-validated, Portuguese error mapping.

- `lookupProductForMovement({ barcode|internal_code|q })` → returns product + per-center stock, last batch/expiration, min/max, avg consumption, category/manufacturer/supplier names.
- `listStockCenters()` (respecting user default).
- `listRecentMovements({ limit, filters })` with joined product/center/user names.
- `getMovementDetail(id)`.
- `registerMovement(payload)` → calls `register_movement` RPC.
- `listStockAlerts({ kind? })` — reads `v_stock_alerts`.
- `getStockHealth({ productId? })` — reads `v_stock_health`.

## 3. Frontend — `/estoque` (Inventory Movements)

Single screen, three panes. Keyboard-first, USB-scanner friendly.

```text
┌─ Movement Type ▼ ── Center Origin ▼ ── Center Dest ▼(transfer only) ─┐
│ Barcode [_________]  (autofocus)                                     │
├─ Product summary card (when found)                                   │
│  desc / stock / last batch / last exp / min-max / avg consumption    │
├─ Fields: Batch | Expiration | Qty | Unit Cost | Reason | Obs        │
│ [Ctrl+Enter] Register                                                │
└─ Right column: Alerts snapshot (low/critical/expiring)              │
─ Bottom: Latest 20 movements table (click → detail sheet) ───────────
```

- Movement type drives which fields show and which validations run.
- Center origin defaults from `useCurrentUser().stockCenterId`; admins/managers may switch.
- "Product does not exist" → CTA linking to `/produtos` prefilled with barcode.
- Detail sheet shows full audit info for a movement.
- Uses shadcn primitives already in the project; no visual redesign of app shell.

## 4. Technical details

- Reuse `RefCombobox` from produtos for reasons picker.
- TanStack Query keys: `["movements","recent"]`, `["stock","alerts"]`, `["stock","health",productId]`, `["product","lookup",term]`. Invalidate all four after a successful movement.
- Focus manager returns cursor to Barcode after success in <30ms (same pattern as produtos).
- Indexes added: `movements (hospital_id, stock_center_id, occurred_at DESC)`, `stock_items (product_id, expiration_date)` for alerts.
- Mobile camera scanner: input is `inputMode="none"` capable, and a small "Câmera" button is stubbed but hidden behind a feature flag (no lib installed this sprint) — architecture is ready.

## Out of scope (per spec)

Patients, beds, BIN, OR, prescriptions, purchase orders, invoices, financial, BI dashboards, AI chat. Purchasing/executive intelligence is *prepared* (schema + views) but not surfaced as UI.

## Acceptance

- All 9 movement types register end-to-end with audit + stock update.
- Negative stock impossible (DB check + RPC lock).
- Batch/expiration rules enforced.
- Permissions enforced via existing `can_operate_stock`.
- History + detail view work.
- Alerts view returns rows.
- Health engine view returns rows.
- Suppliers/products carry purchasing intelligence fields.
