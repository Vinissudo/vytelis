// Domain types shared by every inventory engine.
// Engines are pure TypeScript — no React, no I/O.

export interface CenterStock {
  stock_center_id: string;
  stock_center_name: string;
  quantity: number;
}

export interface BatchLot {
  stock_center_id: string;
  stock_center_name: string;
  batch: string | null;
  expiration_date: string | null;
  quantity: number;
  unit_cost: number | null;
}

/** Everything the engines need to reason about one product. */
export interface InventorySnapshot {
  id: string;
  barcode: string | null;
  internal_code: string | null;
  description: string;
  short_description: string | null;
  manufacturer: string | null;
  unit: string | null;
  category_id: string | null;
  category_name: string | null;
  default_supplier_id: string | null;
  supplier_name: string | null;
  controlled_drug: boolean;
  requires_batch: boolean;
  requires_expiration_date: boolean;
  minimum_stock: number | null;
  maximum_stock: number | null;
  average_daily_consumption: number | null;
  lead_time_days: number | null;
  last_purchase_price: number | null;
  last_purchase_at: string | null;
  last_movement_at: string | null;
  centers: CenterStock[];
  batches: BatchLot[];
  consumption_30d: number;
  consumption_90d: number;
  last_batch: string | null;
  last_expiration: string | null;
}

export type HealthStatus =
  | "out"
  | "critical"
  | "low"
  | "healthy"
  | "overstock"
  | "unknown";

export type TurnoverClass = "fast" | "medium" | "slow" | "stagnant" | "unknown";

export type AlertKind =
  | "out_of_stock"
  | "critical_stock"
  | "low_stock"
  | "overstock"
  | "expired"
  | "expiring_7"
  | "expiring_15"
  | "expiring_30"
  | "expiring_60"
  | "expiring_90"
  | "expiring_180"
  | "no_movement_30"
  | "no_movement_60"
  | "no_movement_90"
  | "no_movement_180"
  | "no_movement_365"
  | "slow_turnover"
  | "inconsistent_stock"
  | "missing_batch"
  | "missing_expiration"
  | "duplicate_barcode";

export type AlertSeverity = "critical" | "high" | "medium" | "info";

export interface InventoryAlert {
  key: string;
  kind: AlertKind;
  severity: AlertSeverity;
  product_id: string;
  product_description: string;
  barcode: string | null;
  stock_center_id: string | null;
  stock_center_name: string | null;
  batch: string | null;
  message: string;
  metric: number | null;
  ref_date: string | null;
}

export interface PurchaseRecommendation {
  product_id: string;
  product_description: string;
  supplier_id: string | null;
  supplier_name: string | null;
  current_stock: number;
  reorder_point: number;
  suggested_quantity: number;
  estimated_cost: number | null;
  coverage_days: number | null;
  urgency: AlertSeverity;
  reason: string;
}
