export type OperationPlatform = "hungerstation" | "keeta" | "jahez";

export type OperationSourceKind =
  "hungerstation_orders" | "keeta_orders" | "jahez_orders" | "jahez_adjustments";

export interface OperationOrder {
  orderId: string;
  businessDate: string;
  branchId: string | null;
  branchName: string | null;
  status: string | null;
  deliveryMode: string | null;
  grossSales: number;
  deliveryAmount: number;
  complaint: boolean;
  complaintReason: string | null;
  refundType: string | null;
  refundAmount: number | null;
  chargesTotal: number;
  settlementAmount: number;
  rawData: Record<string, string | number | boolean | null>;
}

export interface OperationAdjustment {
  fingerprint: string;
  orderId: string;
  businessDate: string;
  branchName: string | null;
  transactionType: "debit" | "credit";
  reason: string | null;
  amount: number;
  comment: string | null;
  rawData: Record<string, string | number | boolean | null>;
}

export interface OperationImportSummary {
  orderCount: number;
  grossSales: number;
  deliveryAmount: number;
  complaintCount: number;
  refundCount: number;
  refundAmount: number;
  cancellationCount: number;
  chargesTotal: number;
  settlementAmount: number;
  adjustmentDebit: number;
  adjustmentCredit: number;
  matchedAdjustments: number;
  unmatchedAdjustments: number;
}

export interface ParsedOperationImport {
  platform: OperationPlatform;
  sourceKind: OperationSourceKind;
  businessDate: string;
  orders: OperationOrder[];
  adjustments: OperationAdjustment[];
  summary: OperationImportSummary;
}

export interface OperationImportResult {
  status: "saved" | "duplicate";
  importId: string;
  businessDate: string;
  sourceKind: OperationSourceKind;
  rows: number;
  matchedAdjustments: number;
  unmatchedAdjustments: number;
}

export interface OperationPlatformMonth {
  platform: OperationPlatform;
  coveredDays: number;
  orderCount: number;
  grossSales: number;
  deliveryAmount: number;
  complaintCount: number;
  refundCount: number;
  refundAmount: number;
  cancellationCount: number;
  chargesToDate: number;
  settlementToDate: number;
  forecastCharges: number;
  forecastSettlement: number;
}

export interface OperationImportHistoryItem {
  id: string;
  sourceKind: OperationSourceKind;
  platform: OperationPlatform;
  businessDate: string;
  originalName: string;
  rowCount: number;
  summary: OperationImportSummary;
  createdAt: string;
}

export interface OperationMonthOverview {
  month: string;
  daysInMonth: number;
  platforms: OperationPlatformMonth[];
  imports: OperationImportHistoryItem[];
}
