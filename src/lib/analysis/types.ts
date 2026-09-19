export type Platform = "hungerstation" | "keeta";

export interface BranchRow {
  branch: string;
  branchId: string;
  orders: number;
  grossSales: number;
  netSales: number;
  commission: number;
  commissionPct: number;
  ccSuccess: number;
  ccRejected: number;
  walletAmount: number;
  riderWallet: number;
  rdfCampaigns: number;
  freeDeliveryOrders: number;
  compensation: number;
  jokerFees: number;
  hsFoodDiscount: number;
  rewardsDiscount: number;
  restaurantFoodDiscount: number;
  totalFoodDiscount: number;
  partialRefund: number;
  fulfillmentMods: number;
  approvedRefunds: number;
  waitingTimeFees: number;
  bankFeeSuccess: number;
  bankFeeRefunded: number;
  totalCharges: number;
}

export interface DailyRow {
  date: string;
  orders: number;
  grossSales: number;
  netSales: number;
  commission: number;
  ccSuccess: number;
}

export interface Summary {
  platform: Platform;
  orders: number;
  grossSales: number;
  netSales: number;
  commission: number;
  commissionPct: number;
  ccSuccess: number;
  ccRejected: number;
  walletAmount: number;
  riderWallet: number;
  rdfCampaigns: number;
  compensation: number;
  jokerFees: number;
  hsFoodDiscount: number;
  rewardsDiscount: number;
  restaurantFoodDiscount: number;
  totalFoodDiscount: number;
  partialRefund: number;
  fulfillmentMods: number;
  approvedRefunds: number;
  waitingTimeFees: number;
  bankRate: number;
  /** Rate implied by the invoice payment-fee line. Useful for comparison, not independent evidence. */
  invoiceImpliedBankRate?: number;
  bankRateSource: "invoice" | "manual" | "none";
  bankFeeSuccess: number;
  bankFeeRefunded: number;
  /** Charges taken from the invoice because they don't exist in the order data */
  invoiceOnlyExtras: number;
  totalCharges: number;
  branchCount: number;
  statusCounts: Record<string, number>;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface InvoiceFigures {
  /** Arabic label -> amount, in display order */
  lines: { label: string; amount: number }[];
  /** Fixed/extra charges that exist only on the invoice, never in the order sheet */
  extras?: { label: string; amount: number }[];
  salesCommission?: number;
  paymentFees?: number;
  othersCommission?: number;
  totalExVat?: number;
  vat?: number;
  totalIncVat?: number;
  totalOnlineSales?: number;
  netDue?: number;
  cpc?: number;
  creditSales?: number;
  invoiceNo?: string;
}

export type CheckEvidence =
  | "data"
  | "contract"
  | "invoice_derived"
  | "invoice_only"
  | "mixed";

export interface CheckRow {
  label: string;
  computed: number;
  invoiced: number;
  /** Describes whether the comparison is independently verifiable or relies on invoice/contract inputs. */
  evidence?: CheckEvidence;
  hint?: string;
}

export interface AnalysisResult {
  platform: Platform;
  label: string;
  summary: Summary;
  branches: BranchRow[];
  daily: DailyRow[];
  invoice: InvoiceFigures;
  checks: CheckRow[];
}
