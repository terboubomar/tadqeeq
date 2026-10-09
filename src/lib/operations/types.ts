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
  discountAmount: number;
  merchantFundedDiscountAmount: number;
  merchantFundedVoucherAmount: number;
  commissionAmount: number;
  paymentFeeAmount: number;
  estimatedEarningsAmount: number;
  chargesTotal: number;
  settlementAmount: number;
  /** A cancelled HungerStation order: not a sale and not counted as an order; its payout still counts. */
  excludedFromSales?: boolean;
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

/** One branch's totals within an upload or a month (orders excluded from sales are not counted as orders). */
export interface OperationBranchSummary {
  key: string;
  branchId: string | null;
  branchName: string | null;
  orderCount: number;
  grossSales: number;
  chargesTotal: number;
  commissionAmount: number;
  settlementAmount: number;
  cancellationCount: number;
  complaintCount: number;
  refundCount: number;
}

export interface OperationImportSummary {
  orderCount: number;
  grossSales: number;
  deliveryAmount: number;
  complaintCount: number;
  refundCount: number;
  refundAmount: number;
  discountAmount: number;
  merchantFundedDiscountAmount: number;
  merchantFundedVoucherAmount: number;
  commissionAmount: number;
  paymentFeeAmount: number;
  estimatedEarningsAmount: number;
  cancellationCount: number;
  /** What cancelled orders still earn (HungerStation), already inside settlementAmount. */
  cancelledEarningsAmount?: number;
  chargesTotal: number;
  settlementAmount: number;
  adjustmentDebit: number;
  adjustmentCredit: number;
  matchedAdjustments: number;
  unmatchedAdjustments: number;
  /** Per-branch totals; absent on uploads saved before branches were kept. */
  branches?: OperationBranchSummary[];
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
  orderCount: number;
  grossSales: number;
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
  discountAmount: number;
  merchantFundedDiscountAmount: number;
  merchantFundedVoucherAmount: number;
  commissionAmount: number;
  paymentFeeAmount: number;
  estimatedEarningsAmount: number;
  cancellationCount: number;
  cancelledEarningsAmount: number;
  chargesToDate: number;
  settlementToDate: number;
  forecastCharges: number | null;
  forecastSettlement: number | null;
  forecastMissingDays: number[];
  /** One entry per uploaded day (orders file), oldest first. */
  days: OperationDay[];
  branches: OperationBranchSummary[];
  /** False when some of the month's uploads predate per-branch totals (re-upload them to complete the list). */
  branchesComplete: boolean;
}

export interface OperationDay {
  date: string;
  orderCount: number;
  grossSales: number;
  chargesTotal: number;
  settlementAmount: number;
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
  /** False once a newer upload (or a re-upload of another file) took over the same source and day. */
  current: boolean;
}

export interface OperationMonthOverview {
  month: string;
  daysInMonth: number;
  platforms: OperationPlatformMonth[];
  imports: OperationImportHistoryItem[];
}

export interface OperationOrderDetail {
  orderId: string;
  businessDate: string;
  branchId: string | null;
  branchName: string | null;
  status: string | null;
  deliveryMode: string | null;
  subtotalAmount: number;
  packagingAmount: number;
  grossSales: number;
  deliveryAmount: number;
  discountAmount: number;
  merchantFundedDiscountAmount: number;
  merchantFundedVoucherAmount: number;
  commissionAmount: number;
  paymentFeeAmount: number;
  otherFeeAmount: number;
  refundAmount: number;
  chargesTotal: number;
  estimatedEarningsAmount: number;
  settlementAmount: number;
  complaint: boolean;
  complaintReason: string | null;
}

export interface OperationAdjustmentDetail {
  fingerprint: string;
  orderId: string;
  businessDate: string;
  branchName: string | null;
  transactionType: "debit" | "credit";
  reason: string | null;
  amount: number;
  comment: string | null;
}

export type OperationOrderFilter = "all" | "cancelled" | "complaints" | "refunds";

export interface OperationImportDetail {
  importItem: OperationImportHistoryItem;
  orders: OperationOrderDetail[];
  adjustments: OperationAdjustmentDetail[];
  totalRows: number;
  /** Totals of every row matching the search and filter, across all pages (orders files only). */
  totals: { grossSales: number; chargesTotal: number; settlementAmount: number } | null;
  page: number;
  pageSize: number;
}
