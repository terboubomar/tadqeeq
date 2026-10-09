export type Platform = "hungerstation" | "keeta" | "jahez";

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
  /**
   * Wallet-payment fee base reported by HungerStation's invoice.
   * This is NOT reconstructed from Wallet Amount / Transmitter Amount because
   * those columns are collection flows and do not identify the fee-bearing base.
   */
  walletFeeBase?: number;
  /** Wallet-payment fee reported by HungerStation; invoice-derived unless independently supported. */
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
  /** Full Payment Fees amount reported for the branch, including any Wallet Payments Fee. */
  invoicePaymentFees?: number;
  /** Wallet Payments Fee reported on the branch invoice, if present. */
  invoiceWalletFee?: number;
  /** Card-only Payment Fees after excluding invoice Wallet Payments Fee. */
  invoiceCardPaymentFees?: number;
  /** Card-only variance: invoice card fees - independently reconstructed card fees. */
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
  keetaProductCampaignExVat?: number;
  keetaMerchantAdExVat?: number;
  keetaPosFeesExVat?: number;
  keetaCompensationExVat?: number;
  keetaOtherExpensesExVat?: number;
  keetaCommissionInvoiceExVat?: number;
  keetaCommissionInvoiceInclVat?: number;
  keetaCreditSales?: number;
  keetaTotalCostExVat?: number;
  keetaInputVat?: number;
  keetaTotalCostInclVat?: number;
  keetaSourcePayable?: number;
  keetaSettlementVariance?: number;
  /** Official Keeta Excel Invoice Details controls, aggregated by Restaurant ID. */
  keetaExcelInvoiceAmount?: number;
  keetaExcelInvoiceVariance?: number;
  keetaExcelPayable?: number;
  keetaExcelPayableVariance?: number;
  keetaPlatformCostPct?: number;
  keetaAvgOrderValueInclVat?: number;
  keetaPdfOrderCommissionInclVat?: number;
  keetaPdfOrderCommissionVariance?: number;
  keetaPdfBankCommissionInclVat?: number;
  keetaPdfBankCommissionVariance?: number;
  keetaPdfDeliveryCommissionInclVat?: number;
  keetaPdfDeliveryCommissionVariance?: number;
  keetaPdfCommissionInvoiceInclVat?: number;
  keetaPdfCommissionVariance?: number;
  keetaPdfCreditSales?: number;
  keetaPdfCreditSalesVariance?: number;
  keetaPdfNetDue?: number;
  keetaPdfNetDueVariance?: number;

  // Jahez accounting decomposition.
  jahezCommissionInclVat?: number;
  jahezPaymentFeesExVat?: number;
  jahezPaymentFeesVat?: number;
  jahezDeliveryCharge?: number;
  jahezOfferAmount?: number;
  jahezDeliveryOfferInclVat?: number;
  jahezDeliveryOfferInvoiceExVat?: number;
  jahezDeliveryCoupon?: number;
  jahezReportedRestaurantAmount?: number;
  jahezSettlementVariance?: number;
  jahezCompensationTransactions?: number;
  jahezCompensationDebit?: number;
  jahezCompensationCredit?: number;
  jahezCompensationNetImpact?: number;
  jahezCompensationDuplicateAmount?: number;
  jahezCompensationUnknownAmount?: number;
}

export interface DailyRow {
  date: string;
  orders: number;
  grossSales: number;
  netSales: number;
  commission: number;
  ccSuccess: number;
  jahezCompensationDebit?: number;
  jahezCompensationCredit?: number;
  jahezCompensationNetImpact?: number;
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
  /** Wallet-payment fee base reported by HungerStation's invoice, when available. */
  walletFeeBase?: number;
  /** Wallet-payment fee reported by HungerStation; not reconstructed from collection columns. */
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
  keetaProductCampaignExVat?: number;
  keetaMerchantAdExVat?: number;
  keetaPosFeesExVat?: number;
  keetaCompensationExVat?: number;
  keetaOtherExpensesExVat?: number;
  keetaCommissionInvoiceExVat?: number;
  keetaCommissionInvoiceInclVat?: number;
  keetaCreditSales?: number;
  keetaTotalCostExVat?: number;
  keetaInputVat?: number;
  keetaTotalCostInclVat?: number;
  keetaSourcePayable?: number;
  keetaSettlementVariance?: number;
  /** Official Excel controls from Keeta Invoice Details / Billing data summary. */
  keetaExcelInvoiceAmount?: number;
  keetaExcelInvoiceVariance?: number;
  keetaExcelPayable?: number;
  keetaExcelPayableVariance?: number;
  keetaBillingInvoiceAmount?: number;
  keetaBillingInvoiceVariance?: number;
  keetaBillingPayable?: number;
  keetaBillingPayableVariance?: number;
  keetaPlatformCostPct?: number;
  keetaAvgOrderValueInclVat?: number;

  // Jahez accounting decomposition.
  jahezCommissionInclVat?: number;
  jahezCommissionInvoiceExVat?: number;
  jahezPaymentFeesExVat?: number;
  jahezPaymentFeesVat?: number;
  jahezDeliveryCharge?: number;
  jahezOfferAmount?: number;
  jahezDeliveryOfferInclVat?: number;
  jahezDeliveryOfferInvoiceExVat?: number;
  jahezDeliveryCoupon?: number;
  jahezReportedRestaurantAmount?: number;
  jahezSettlementVariance?: number;
  jahezInvoiceExVatComputed?: number;
  jahezInvoiceVatComputed?: number;
  jahezInvoiceInclVatComputed?: number;
  jahezDeliveryOfferTiers?: Record<string, number>;
  jahezCompensationTransactions?: number;
  jahezCompensationDebit?: number;
  jahezCompensationCredit?: number;
  jahezCompensationNetImpact?: number;
  jahezAdjustedRestaurantAmount?: number;
  jahezCompensationMatchedCurrent?: number;
  jahezCompensationMatchedHistorical?: number;
  jahezCompensationUnknownOrders?: number;
  jahezCompensationDuplicateCandidates?: number;
  jahezCompensationDuplicateAmount?: number;
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
  /** The rows behind invoiceOnlyCharges, as this branch's invoice section prints them. */
  invoiceOnlyItems?: InvoiceChargeItem[];
  /** Every commission row of this branch's section with its quantity and rate. */
  lineDetails?: InvoiceLineDetail[];
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

export interface KeetaInvoiceBranch {
  restaurantId: string;
  orderCommissionInclVat?: number;
  bankCommissionInclVat?: number;
  deliveryCommissionInclVat?: number;
  photographyInclVat?: number;
  subscriptionInclVat?: number;
  commissionAdjustmentInclVat?: number;
  commissionTotalExVat?: number;
  commissionVat?: number;
  commissionTotalInclVat?: number;
  originalItemPrice?: number;
  topUpToMinimum?: number;
  compensationToMerchant?: number;
  restaurantDeliveryFee?: number;
  merchantPaymentIncrease?: number;
  merchantSubsidyItems?: number;
  merchantDeliveryPromotion?: number;
  platformDeductions?: number;
  advertisingCosts?: number;
  vatWithholding?: number;
  merchantPaymentReduction?: number;
  posMachineFees?: number;
  totalCreditSales?: number;
  netDue?: number;
}

export type JahezCompensationMatch = "current" | "historical" | "unknown";

export interface JahezCompensationTransaction {
  sequence: string;
  branch: string;
  orderId: string;
  transactionType: "debit" | "credit" | string;
  reason: string;
  creationDate: string;
  amount: number;
  free: boolean;
  comments?: string;
  missingItemName?: string;
  match: JahezCompensationMatch;
  matchedBranch?: string;
  matchedPeriodLabel?: string;
  duplicateCandidate?: boolean;
  branchMismatch?: boolean;
}

export interface JahezCompensationReport {
  periodLabel?: string;
  summaryTransactions: number;
  summaryDebit: number;
  summaryCredit: number;
  detailTransactions: number;
  detailDebit: number;
  detailCredit: number;
  netImpact: number;
  matchedCurrent: number;
  matchedHistorical: number;
  unknownOrders: number;
  duplicateCandidates: number;
  duplicateAmount: number;
  transactions: JahezCompensationTransaction[];
}

export interface JahezOrderReference {
  branch: string;
  date: string;
  periodLabel?: string;
}

/** One invoice-only charge (a printer, a subscription), with the label shown in the app. */
export interface InvoiceChargeItem {
  label: string;
  amount: number;
}

/** One branch line of a HungerStation advertising (CPC) invoice, as printed. */
export interface CpcBranchCharge {
  /** The branch name exactly as the CPC invoice prints it. */
  branch: string;
  amountExVat: number;
  vat: number;
}

/**
 * One commission row exactly as the invoice prints it: what was counted, at what rate, for how much.
 * Read for display and explanation only; no audit figure is computed from it.
 */
export interface InvoiceLineDetail {
  /** Stable id of the row, e.g. "delivery_commission". */
  key: string;
  /** Arabic label shown in the app. */
  label: string;
  /** The row's Quantity column: orders, a SAR base or a count; null when the invoice prints none. */
  quantity: number | null;
  unit: "orders" | "sar_base" | "count" | null;
  /** The row's AVG rate column: a percentage (19.1 for 19.1%) or a SAR amount per unit; null when not printed. */
  avgRate: number | null;
  rateKind: "percent" | "per_unit" | null;
  amount: number;
}

/** The «Simple SOA of the Month» section of a HungerStation invoice, as printed. */
export interface InvoiceStatementOfAccount {
  openingBalance?: number;
  commissionInvoice?: number;
  advertisingServicesInvoice?: number;
  loanInstallmentInvoice?: number;
  totalOnlineSales?: number;
  netMonthlyDueBalance?: number;
}

export interface InvoiceFigures {
  /** Arabic label -> amount, in display order */
  lines: { label: string; amount: number }[];
  /** Fixed/extra charges that exist only on the invoice, never in the order sheet */
  extras?: { label: string; amount: number }[];
  /** The summary Invoice Details rows with quantity and rate (HungerStation). */
  lineDetails?: InvoiceLineDetail[];
  /**
   * The part of each invoice-only charge that no branch section lists: printed only in the
   * consolidated summary, so it is not assigned to any branch.
   */
  unallocatedCharges?: InvoiceChargeItem[];
  statementOfAccount?: InvoiceStatementOfAccount;
  salesCommission?: number;
  paymentFees?: number;
  /** Aggregate Wallet Payments Fee base reported on the HungerStation invoice. */
  walletFeeBase?: number;
  /** Aggregate Wallet Payments Fee reported on the HungerStation invoice. */
  walletFee?: number;
  othersCommission?: number;
  totalExVat?: number;
  vat?: number;
  totalIncVat?: number;
  totalOnlineSales?: number;
  netDue?: number;
  cpc?: number;
  /**
   * The advertising (CPC) invoice's lines per branch, kept only when they add up to its total before VAT.
   * Read for display only; no audit figure is computed from it.
   */
  cpcBranches?: CpcBranchCharge[];
  creditSales?: number;
  creditSalesOrders?: number;
  creditSalesIncVat?: number;
  rejectedSales?: number;
  rejectedSalesOrders?: number;
  rejectedSalesIncVat?: number;
  branches?: HungerInvoiceBranch[];
  keetaBranches?: KeetaInvoiceBranch[];
  keetaPromotionServiceFeeExVat?: number;
  keetaTaxInvoiceExVat?: number;
  keetaTaxInvoiceVat?: number;
  keetaTaxInvoiceInclVat?: number;
  keetaTaxCreditNoteExVat?: number;
  keetaTaxCreditNoteVat?: number;
  keetaTaxCreditNoteInclVat?: number;
  keetaOriginalItemPrice?: number;
  keetaTopUpToMinimum?: number;
  keetaCompensationToMerchant?: number;
  keetaMerchantSubsidyItems?: number;
  keetaAdvertisingCosts?: number;
  keetaPosMachineFees?: number;
  /** Keeta official controls parsed from the same Excel workbook. */
  keetaExcelInvoiceAmount?: number;
  keetaExcelPayable?: number;
  keetaExcelInvoiceDetailRows?: number;
  keetaBillingInvoiceAmount?: number;
  keetaBillingPayable?: number;
  keetaBillingRows?: number;

  // Jahez tax invoice fields.
  jahezCommissionExVat?: number;
  jahezDeliveryOfferExVat?: number;
  jahezPaymentFeesExVat?: number;
  jahezDeliveryOfferRows?: { unitExVat: number; quantity: number; amountExVat: number }[];
  jahezCompensation?: JahezCompensationReport;
  jahezOrderIndex?: Record<string, JahezOrderReference>;
  invoiceNo?: string;
}

export type CheckEvidence =
  | "data"
  | "contract"
  | "invoice_derived"
  | "invoice_only"
  | "mixed";

export type CheckCategory =
  | "commission"
  | "payment_fee"
  | "other_fee"
  | "delivery_campaign"
  | "campaign"
  | "advertising"
  | "pos_fee"
  | "sales"
  | "rejected_sales"
  | "collections"
  | "settlement"
  | "compensation"
  | "tax"
  | "invoice_total"
  | "unsupported_charge"
  | "other";

export interface CheckRow {
  /** Stable machine identity. UI labels may change without changing this code. */
  code: string;
  category: CheckCategory;
  /** Exists only in the invoice/source document and has no independent audit basis. */
  invoiceOnly?: boolean;
  /** Diagnostic/roll-up control that must stay out of the actionable exception queue. */
  controlOnly?: boolean;
  /** A more granular branch-level check already owns the actionable discrepancy. */
  coveredByBranches?: boolean;
  label: string;
  computed: number;
  /** Undefined means the official/source value was not extracted or not supplied. Zero is a valid value. */
  invoiced?: number;
  /** Describes whether the comparison is independently verifiable or relies on invoice/contract inputs. */
  evidence?: CheckEvidence;
  /** Allowed absolute variance for platform rounding/precision on this check. */
  tolerance?: number;
  hint?: string;
}

export interface AnalysisResult {
  platform: Platform;
  /** Source format fingerprints detected before deterministic analysis. */
  formatIds?: string[];
  label: string;
  summary: Summary;
  branches: BranchRow[];
  daily: DailyRow[];
  invoice: InvoiceFigures;
  checks: CheckRow[];
}
