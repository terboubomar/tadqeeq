export type Platform = "hungerstation" | "keeta";

export interface BranchRow {
  branch: string;
  branchId: string;
  orders: number;
  grossSales: number;
  netSales: number;
  commission: number;
  commissionPct: number;
  /** Card-payment base charged the successful bank fee (includes failed-by-vendor when HS bills it). */
  ccSuccess: number;
  ccRejected: number;
  /** Net card collections; excludes failed-by-vendor payments that HS reverses from collections. */
  netBankCards?: number;
  walletAmount: number;
  riderWallet: number;
  /** Wallet + rider/transmitter amount charged the wallet-payment fee. */
  walletFeeBase?: number;
  /** Wallet-payment fee calculated from the contract/payment rate. */
  walletFee?: number;
  rdfCampaigns: number;
  freeDeliveryOrders: number;
  compensation: number;
  jokerFees: number;
  hsFoodDiscount: number;
  rewardsDiscount: number;
  restaurantFoodDiscount: number;
  totalFoodDiscount: number;
  /** HS-funded food discount plus Rewards, matching Net Marketing Discounts on the invoice. */
  netMarketingDiscount?: number;
  partialRefund: number;
  fulfillmentMods: number;
  approvedRefunds: number;
  waitingTimeFees: number;
  bankFeeSuccess: number;
  bankFeeRefunded: number;
  totalCharges: number;
  /** Billable Commissionable GMV excluding VAT. */
  creditSales?: number;
  rejectedOrders?: number;
  rejectedSales?: number;
  totalCollections?: number;
  invoiceBranchName?: string;
  invoiceCommission?: number;
  commissionVariance?: number;
  invoicePaymentFees?: number;
  paymentFeeVariance?: number;
  invoiceOtherCharges?: number;
  otherChargesVariance?: number;
  invoiceCollections?: number;
  collectionsVariance?: number;
  invoiceCreditSales?: number;
  creditSalesVariance?: number;
  invoiceOnlyBranchCharges?: number;
  branchAuditStatus?: "matched" | "rounding" | "warning" | "invoice_only" | "unmatched";
  branchAuditLabel?: string;
  branchAuditNote?: string;

  // Keeta accounting decomposition (all Ex VAT unless stated otherwise).
  keetaSalesExVat?: number;
  keetaSalesVat?: number;
  keetaCommissionExVat?: number;
  keetaBankFeesExVat?: number;
  keetaDeliveryCampaignExVat?: number;
  keetaAdvertisingExVat?: number;
  keetaCompensationExVat?: number;
  keetaOtherExpensesExVat?: number;
  keetaTotalCostExVat?: number;
  keetaInputVat?: number;
  keetaTotalCostInclVat?: number;
  keetaSourcePayable?: number;
  keetaSettlementVariance?: number;
  keetaPlatformCostPct?: number;
  keetaAvgOrderValueInclVat?: number;
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
  /** Card-payment base charged the successful bank fee (includes failed-by-vendor when HS bills it). */
  ccSuccess: number;
  ccRejected: number;
  /** Net card collections; excludes failed-by-vendor payments that HS reverses from collections. */
  netBankCards?: number;
  walletAmount: number;
  riderWallet: number;
  /** Wallet + rider/transmitter amount charged the wallet-payment fee. */
  walletFeeBase?: number;
  /** Wallet-payment fee calculated from the contract/payment rate. */
  walletFee?: number;
  rdfCampaigns: number;
  compensation: number;
  jokerFees: number;
  hsFoodDiscount: number;
  rewardsDiscount: number;
  restaurantFoodDiscount: number;
  totalFoodDiscount: number;
  /** HS-funded food discount plus Rewards, matching Net Marketing Discounts on the invoice. */
  netMarketingDiscount?: number;
  partialRefund: number;
  fulfillmentMods: number;
  approvedRefunds: number;
  waitingTimeFees: number;
  rejectedOrders?: number;
  rejectedSales?: number;
  /** Independently reconstructed Total Collections from the order export. */
  totalCollections?: number;
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

  // Keeta accounting decomposition (all Ex VAT unless stated otherwise).
  keetaSalesExVat?: number;
  keetaSalesVat?: number;
  keetaCommissionExVat?: number;
  keetaBankFeesExVat?: number;
  keetaDeliveryCampaignExVat?: number;
  keetaAdvertisingExVat?: number;
  keetaCompensationExVat?: number;
  keetaOtherExpensesExVat?: number;
  keetaTotalCostExVat?: number;
  keetaInputVat?: number;
  keetaTotalCostInclVat?: number;
  keetaSourcePayable?: number;
  keetaSettlementVariance?: number;
  keetaPlatformCostPct?: number;
  keetaAvgOrderValueInclVat?: number;
}

export interface HungerInvoiceBranch {
  branch?: string;
  deliveryBase?: number;
  deliveryCommission?: number;
  pickupBase?: number;
  pickupCommission?: number;
  salesCommission?: number;
  bankFeeSuccessBase?: number;
  bankFeeSuccess?: number;
  bankFeeRefundedBase?: number;
  bankFeeRefunded?: number;
  walletFeeBase?: number;
  walletFee?: number;
  paymentFees?: number;
  rdfOrders?: number;
  rdfCampaigns?: number;
  compensation?: number;
  waitingTimeFees?: number;
  invoiceOnlyCharges?: number;
  otherCommission?: number;
  totalExVat?: number;
  netBankCards?: number;
  walletAmount?: number;
  riderWallet?: number;
  totalFoodDiscount?: number;
  restaurantFoodDiscount?: number;
  rewardsDiscount?: number;
  netMarketingDiscount?: number;
  approvedRefunds?: number;
  totalCollections?: number;
  creditSalesOrders?: number;
  creditSales?: number;
  rejectedSalesOrders?: number;
  rejectedSales?: number;
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
  creditSalesOrders?: number;
  creditSalesIncVat?: number;
  rejectedSales?: number;
  rejectedSalesOrders?: number;
  rejectedSalesIncVat?: number;
  branches?: HungerInvoiceBranch[];
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
  /** Allowed absolute variance for platform rounding/precision on this check. */
  tolerance?: number;
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
