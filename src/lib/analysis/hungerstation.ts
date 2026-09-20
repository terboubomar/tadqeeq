import * as XLSX from "xlsx";

import type {
  AnalysisResult,
  BranchRow,
  CheckRow,
  DailyRow,
  HungerInvoiceBranch,
  InvoiceFigures,
  Summary,
} from "./types";

const VAT = 1.15;

function num(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** Match a sheet by a loose keyword, ignoring the numeric prefix HungerStation uses. */
function findSheet(wb: XLSX.WorkBook, keyword: string): string | undefined {
  const k = keyword.toLowerCase();
  return wb.SheetNames.find((name) => name.toLowerCase().includes(k));
}

function rowsOf(wb: XLSX.WorkBook, keyword: string): Record<string, unknown>[] {
  const name = findSheet(wb, keyword);
  if (!name) return [];
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
}

/** Pick a column value by trying several header spellings. */
function col(row: Record<string, unknown>, ...candidates: string[]): unknown {
  for (const candidate of candidates) {
    if (candidate in row) return row[candidate];
  }
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    const hit = keys.find((k) => k.toLowerCase() === lower);
    if (hit) return row[hit];
  }
  return null;
}

type StatusClass =
  | "successful"
  | "failedAfterPickup"
  | "failedByVendor"
  | "rejected"
  | "failedBefore"
  | "other";

function classifyStatus(raw: string): StatusClass {
  const s = raw.toLowerCase();
  if (s.includes("successful")) return "successful";
  if (s.includes("after pick")) return "failedAfterPickup";
  if (s.includes("vendor")) return "failedByVendor";
  if (s.includes("reject")) return "rejected";
  if (s.includes("before pick")) return "failedBefore";
  if (s.includes("fail")) return "failedBefore";
  return "other";
}

function isBillableOrder(cls: StatusClass): boolean {
  return cls === "successful" || cls === "failedAfterPickup" || cls === "failedByVendor";
}

function isCollectionOrder(cls: StatusClass): boolean {
  return cls === "successful" || cls === "failedAfterPickup";
}

function isCommissionableOrder(cls: StatusClass): boolean {
  return isBillableOrder(cls) || cls === "rejected";
}

function normalizeBranchName(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedDifference(left: number | undefined, right: number | undefined): number {
  if (left === undefined || right === undefined) return 0;
  return Math.abs(left - right) / Math.max(1, Math.abs(left), Math.abs(right));
}

function branchMatchScore(row: BranchRow, invoice: HungerInvoiceBranch): number {
  const rowName = normalizeBranchName(row.branch);
  const invoiceName = normalizeBranchName(invoice.branch);
  let namePenalty = 0.6;
  if (rowName && invoiceName) {
    if (rowName === invoiceName) namePenalty = 0;
    else if (rowName.includes(invoiceName) || invoiceName.includes(rowName)) namePenalty = 0.15;
  } else if (!invoiceName) {
    namePenalty = 0.25;
  }

  const numericPenalty =
    normalizedDifference(row.commission, invoice.salesCommission) +
    normalizedDifference(row.ccSuccess, invoice.bankFeeSuccessBase) +
    normalizedDifference(row.walletFeeBase, invoice.walletFeeBase) +
    normalizedDifference(row.rdfCampaigns, invoice.rdfCampaigns) +
    normalizedDifference(row.totalCollections, invoice.totalCollections);

  return namePenalty + numericPenalty;
}

function emptyBranch(branch: string, branchId: string): BranchRow {
  return {
    branch,
    branchId,
    orders: 0,
    grossSales: 0,
    netSales: 0,
    commission: 0,
    commissionPct: 0,
    ccSuccess: 0,
    ccRejected: 0,
    netBankCards: 0,
    walletAmount: 0,
    riderWallet: 0,
    walletFeeBase: 0,
    walletFee: 0,
    rdfCampaigns: 0,
    freeDeliveryOrders: 0,
    compensation: 0,
    jokerFees: 0,
    hsFoodDiscount: 0,
    rewardsDiscount: 0,
    restaurantFoodDiscount: 0,
    totalFoodDiscount: 0,
    netMarketingDiscount: 0,
    partialRefund: 0,
    fulfillmentMods: 0,
    approvedRefunds: 0,
    waitingTimeFees: 0,
    bankFeeSuccess: 0,
    bankFeeRefunded: 0,
    totalCharges: 0,
  };
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = text(value);
  if (!raw) return "";
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 20000 && asNumber < 80000) {
    const parsed = XLSX.SSF.parse_date_code(asNumber);
    if (parsed) {
      const mm = String(parsed.m).padStart(2, "0");
      const dd = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${mm}-${dd}`;
    }
  }
  return raw.slice(0, 10);
}

export interface HungerOptions {
  /**
   * Contract bank-card fee rate as a fraction, e.g. 0.025.
   * When provided it is authoritative for the audit; the invoice-implied rate is kept only for comparison.
   */
  manualBankRate?: number;
  invoice?: InvoiceFigures;
  cpcInvoice?: InvoiceFigures;
  label?: string;
}

export function analyzeHungerStation(
  file: ArrayBuffer,
  options: HungerOptions = {},
): AnalysisResult {
  const wb = XLSX.read(file, { type: "array" });

  const orders = rowsOf(wb, "commissionable gmv");
  if (orders.length === 0) {
    throw new Error("لم يتم العثور على ورقة الطلبات (Commissionable GMV) في الملف.");
  }

  const branches = new Map<string, BranchRow>();
  const dailyMap = new Map<string, DailyRow>();
  const statusCounts: Record<string, number> = {};
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let rejectedOrders = 0;
  let rejectedSales = 0;

  const branchOf = (name: string, id: string): BranchRow => {
    const key = name || id || "غير محدد";
    let row = branches.get(key);
    if (!row) {
      row = emptyBranch(key, id);
      branches.set(key, row);
    }
    return row;
  };

  for (const order of orders) {
    const statusRaw = text(col(order, "Status"));
    if (!statusRaw) continue;
    statusCounts[statusRaw] = (statusCounts[statusRaw] ?? 0) + 1;

    const cls = classifyStatus(statusRaw);
    const branchName = text(col(order, "Branch Name"));
    const branchId = text(col(order, "HS Branch ID"));
    const row = branchOf(branchName, branchId);

    const paymentType = text(col(order, "Payment Type")).toLowerCase();
    const isOnline = paymentType.includes("online");

    const gmv = num(col(order, "Commissionable GMV (VAT Excluded)"));
    const commission = num(col(order, "Commission"));
    const ccAmount = num(col(order, "CC Amount"));
    const date = normalizeDate(col(order, "Operation Day", "Creation Time"));

    // Commission base observed on real HS invoices:
    // successful + failed after pickup + failed by vendor + rejected.
    if (isCommissionableOrder(cls)) {
      row.netSales += gmv;
      row.commission += commission;
    }

    // Billable sales/RDF/discount base:
    // successful + failed after pickup + failed by vendor.
    if (isBillableOrder(cls)) {
      row.orders += 1;
      row.creditSales = (row.creditSales ?? 0) + gmv;
      // HungerStation's Sales Summary is based on Commissionable GMV, VAT inclusive.
      // Original Amount is pre-discount and overstates invoice sales when offers exist.
      row.grossSales += gmv * VAT;
      row.rdfCampaigns += num(col(order, "Restaurant delivery Discount"));
      row.jokerFees += num(col(order, "Flash Deals Fee Excluding Vat"));
      row.hsFoodDiscount += num(col(order, "HS Food Discount"));
      row.rewardsDiscount += num(col(order, "Rewards Discounts", "Rewards Discount"));
      row.restaurantFoodDiscount += num(col(order, "Restaurant Food discount"));

      if (isOnline) {
        // HS charges the successful bank fee on failed-by-vendor orders too.
        row.ccSuccess += ccAmount;

        // The wallet-payment fee is charged on both customer-wallet and rider/transmitter
        // amounts for every billable order. This matched seven independent merchant invoices.
        row.walletFeeBase =
          (row.walletFeeBase ?? 0) +
          num(col(order, "Wallet Amount")) +
          num(col(order, "Transmitter Amount"));

        // Collections, however, exclude failed-by-vendor payments.
        if (isCollectionOrder(cls)) {
          row.netBankCards = (row.netBankCards ?? 0) + ccAmount;
          row.walletAmount += num(col(order, "Wallet Amount"));
          row.riderWallet += num(col(order, "Transmitter Amount"));
        }
      }

      if (date) {
        let day = dailyMap.get(date);
        if (!day) {
          day = { date, orders: 0, grossSales: 0, netSales: 0, commission: 0, ccSuccess: 0 };
          dailyMap.set(date, day);
        }
        day.orders += 1;
        day.grossSales += gmv * VAT;
        day.netSales += gmv;
        day.commission += commission;
        if (isOnline) day.ccSuccess += ccAmount;
      }
    }

    if (cls === "rejected") {
      rejectedOrders += 1;
      rejectedSales += gmv;
      row.rejectedOrders = (row.rejectedOrders ?? 0) + 1;
      row.rejectedSales = (row.rejectedSales ?? 0) + gmv;
    }

    // Refunded bank fee base: rejected + failed before pickup + failed
    if (isOnline && (cls === "rejected" || cls === "failedBefore")) {
      row.ccRejected += ccAmount;
    }

    row.partialRefund += num(col(order, "CC Refund Amount")) + num(col(order, "Wallet Refund"));

    if (date) {
      if (!periodStart || date < periodStart) periodStart = date;
      if (!periodEnd || date > periodEnd) periodEnd = date;
    }
  }

  // Real invoices also bill failed-by-vendor RDF rows.
  for (const fd of rowsOf(wb, "free delivery")) {
    const cls = classifyStatus(text(col(fd, "Status")));
    if (!isBillableOrder(cls)) continue;
    const row = branchOf(text(col(fd, "Branch Name")), text(col(fd, "HS Branch ID")));
    row.freeDeliveryOrders += 1;
  }

  for (const comp of rowsOf(wb, "compensated")) {
    const row = branchOf(text(col(comp, "Branch Name")), text(col(comp, "HS Branch ID")));
    row.compensation += num(col(comp, "Compensation"));
  }

  for (const mod of rowsOf(wb, "fulfillment")) {
    const row = branchOf(text(col(mod, "Branch Name")), text(col(mod, "HS Branch ID")));
    row.fulfillmentMods += num(col(mod, "Modification Amount"));
  }

  for (const refund of rowsOf(wb, "disputes")) {
    const row = branchOf(text(col(refund, "Branch Name")), text(col(refund, "HS Branch ID")));
    row.approvedRefunds += num(col(refund, "Refunded Amount"));
  }

  for (const wait of rowsOf(wb, "waiting time")) {
    const row = branchOf(text(col(wait, "Branch Name")), text(col(wait, "HS Branch ID")));
    row.waitingTimeFees += num(col(wait, "Avoidable Waiting Time Fee"));
  }

  const branchList = [...branches.values()];

  // VAT-exclusive conversions per the official guide
  for (const row of branchList) {
    row.rdfCampaigns = row.rdfCampaigns / VAT;
    row.compensation = row.compensation / VAT;
    row.waitingTimeFees = row.waitingTimeFees / VAT;
    row.totalFoodDiscount = row.hsFoodDiscount + row.restaurantFoodDiscount;
    row.netMarketingDiscount = row.hsFoodDiscount + row.rewardsDiscount;
    row.totalCollections =
      (row.netBankCards ?? 0) +
      row.walletAmount +
      row.riderWallet +
      (row.netMarketingDiscount ?? 0) +
      row.approvedRefunds;
    row.commissionPct = row.netSales > 0 ? row.commission / row.netSales : 0;
  }

  const totalCcSuccess = branchList.reduce((sum, r) => sum + r.ccSuccess, 0);
  const totalCcRejected = branchList.reduce((sum, r) => sum + r.ccRejected, 0);
  const totalNetBankCards = branchList.reduce((sum, r) => sum + (r.netBankCards ?? 0), 0);
  const totalWalletFeeBase = branchList.reduce((sum, r) => sum + (r.walletFeeBase ?? 0), 0);

  // Invoice extras that truly lack an order-export basis (printers, subscriptions,
  // special fixed campaign charges, etc.). Wallet fees are independently calculable.
  const invoiceExtras = options.invoice?.extras ?? [];
  const invoiceWalletFee = invoiceExtras
    .filter((e) => e.label.includes("محفظة"))
    .reduce((sum, e) => sum + e.amount, 0);
  const otherExtras = invoiceExtras
    .filter((e) => !e.label.includes("محفظة"))
    .reduce((sum, e) => sum + e.amount, 0);
  const invoiceOnlyExtras = otherExtras;

  // The Excel export contains every payment-fee base, but not the contract rate.
  // Derive a diagnostic rate from the invoice summary only when no contract rate is entered.
  const paymentFeeBase = totalCcSuccess + totalCcRejected + totalWalletFeeBase;
  const invoiceImpliedBankRate =
    (options.invoice?.paymentFees ?? 0) > 0 && paymentFeeBase > 0
      ? Math.round(((options.invoice?.paymentFees ?? 0) / paymentFeeBase) / 0.0005) * 0.0005
      : 0;

  let bankRate = 0;
  let bankRateSource: "invoice" | "manual" | "none" = "none";
  if (options.manualBankRate && options.manualBankRate > 0) {
    bankRate = options.manualBankRate;
    bankRateSource = "manual";
  } else if (invoiceImpliedBankRate > 0) {
    bankRate = invoiceImpliedBankRate;
    bankRateSource = "invoice";
  }

  for (const row of branchList) {
    row.bankFeeSuccess = row.ccSuccess * bankRate;
    row.bankFeeRefunded = row.ccRejected * bankRate;
    row.walletFee = (row.walletFeeBase ?? 0) * bankRate;
    row.totalCharges =
      row.commission +
      row.bankFeeSuccess +
      row.bankFeeRefunded +
      (row.walletFee ?? 0) +
      row.rdfCampaigns +
      row.compensation +
      row.jokerFees +
      row.waitingTimeFees;
  }

  branchList.sort((a, b) => b.netSales - a.netSales);

  const sum = (pick: (r: BranchRow) => number) => branchList.reduce((t, r) => t + pick(r), 0);

  const summary: Summary = {
    platform: "hungerstation",
    orders: sum((r) => r.orders),
    grossSales: sum((r) => r.grossSales),
    netSales: sum((r) => r.netSales),
    commission: sum((r) => r.commission),
    commissionPct: 0,
    ccSuccess: totalCcSuccess,
    ccRejected: totalCcRejected,
    netBankCards: totalNetBankCards,
    walletAmount: sum((r) => r.walletAmount),
    riderWallet: sum((r) => r.riderWallet),
    walletFeeBase: totalWalletFeeBase,
    walletFee: sum((r) => r.walletFee ?? 0),
    rdfCampaigns: sum((r) => r.rdfCampaigns),
    compensation: sum((r) => r.compensation),
    jokerFees: sum((r) => r.jokerFees),
    hsFoodDiscount: sum((r) => r.hsFoodDiscount),
    rewardsDiscount: sum((r) => r.rewardsDiscount),
    restaurantFoodDiscount: sum((r) => r.restaurantFoodDiscount),
    totalFoodDiscount: sum((r) => r.totalFoodDiscount),
    netMarketingDiscount: sum((r) => r.netMarketingDiscount ?? 0),
    partialRefund: sum((r) => r.partialRefund),
    fulfillmentMods: sum((r) => r.fulfillmentMods),
    approvedRefunds: sum((r) => r.approvedRefunds),
    waitingTimeFees: sum((r) => r.waitingTimeFees),
    rejectedOrders,
    rejectedSales,
    totalCollections: 0,
    bankRate,
    invoiceImpliedBankRate,
    bankRateSource,
    bankFeeSuccess: sum((r) => r.bankFeeSuccess),
    bankFeeRefunded: sum((r) => r.bankFeeRefunded),
    invoiceOnlyExtras,
    totalCharges: sum((r) => r.totalCharges) + invoiceOnlyExtras,
    branchCount: branchList.length,
    statusCounts,
    periodStart,
    periodEnd,
  };
  summary.commissionPct = summary.netSales > 0 ? summary.commission / summary.netSales : 0;
  summary.totalCollections = sum((row) => row.totalCollections ?? 0);

  const invoice = options.invoice ?? { lines: [] };
  if (options.cpcInvoice?.totalIncVat) invoice.cpc = options.cpcInvoice.totalIncVat;

  // Match parsed branch invoice sections to Excel branches. Name matching is preferred,
  // while the numeric signature makes the match resilient to spacing/wrapping differences.
  const invoiceBranches = invoice.branches ?? [];
  const unmatchedInvoiceBranches = new Set(invoiceBranches.map((_, index) => index));

  for (const row of branchList) {
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const index of unmatchedInvoiceBranches) {
      const candidate = invoiceBranches[index];
      if (!candidate) continue;
      const score = branchMatchScore(row, candidate);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    if (bestIndex < 0 || bestScore > 1.25) {
      if (invoiceBranches.length) {
        row.branchAuditStatus = "unmatched";
        row.branchAuditLabel = "غير مطابق";
        row.branchAuditNote = "لم يتم العثور على فرع مطابق في صفحات تفاصيل فاتورة هنقرستيشن.";
      }
      continue;
    }

    const matched = invoiceBranches[bestIndex]!;
    unmatchedInvoiceBranches.delete(bestIndex);

    row.invoiceBranchName = matched.branch;
    row.invoiceCommission = matched.salesCommission;
    row.commissionVariance =
      matched.salesCommission !== undefined ? matched.salesCommission - row.commission : undefined;

    const computedPaymentFees =
      row.bankFeeSuccess + row.bankFeeRefunded + (row.walletFee ?? 0);
    row.invoicePaymentFees = matched.paymentFees;
    row.paymentFeeVariance =
      matched.paymentFees !== undefined ? matched.paymentFees - computedPaymentFees : undefined;

    const computedOtherCharges =
      row.rdfCampaigns + row.compensation + row.jokerFees + row.waitingTimeFees;
    const invoiceDataOther =
      matched.otherCommission !== undefined
        ? matched.otherCommission - (matched.invoiceOnlyCharges ?? 0)
        : undefined;
    row.invoiceOtherCharges = matched.otherCommission;
    row.invoiceOnlyBranchCharges = matched.invoiceOnlyCharges;
    row.otherChargesVariance =
      invoiceDataOther !== undefined ? invoiceDataOther - computedOtherCharges : undefined;

    row.invoiceCollections = matched.totalCollections;
    row.collectionsVariance =
      matched.totalCollections !== undefined
        ? matched.totalCollections - (row.totalCollections ?? 0)
        : undefined;

    row.invoiceCreditSales = matched.creditSales;
    row.creditSalesVariance =
      matched.creditSales !== undefined
        ? matched.creditSales - (row.creditSales ?? 0)
        : undefined;

    const commissionBad = Math.abs(row.commissionVariance ?? 0) > 0.05;
    const paymentBad = Math.abs(row.paymentFeeVariance ?? 0) > 0.1;
    const otherBad = Math.abs(row.otherChargesVariance ?? 0) > 0.1;
    const collectionsBad = Math.abs(row.collectionsVariance ?? 0) > 0.05;
    const salesBad = Math.abs(row.creditSalesVariance ?? 0) > 0.05;
    const missingBranchSales =
      invoiceBranches.length > 1 &&
      (row.creditSales ?? 0) > 0 &&
      matched.creditSales === undefined;

    if (commissionBad || paymentBad || otherBad || collectionsBad || salesBad || missingBranchSales) {
      row.branchAuditStatus = "warning";
      row.branchAuditLabel = "يحتاج مراجعة";
      row.branchAuditNote = missingBranchSales
        ? "الفرع موجود في تفاصيل العمولة والتحصيلات لكن ملخص مبيعات الفرع مفقود من فاتورة هنقرستيشن."
        : "يوجد فرق يتجاوز هامش التقريب في واحد أو أكثر من بنود الفرع.";
    } else {
      const hasRounding =
        Math.abs(row.commissionVariance ?? 0) > 0.005 ||
        Math.abs(row.paymentFeeVariance ?? 0) > 0.005 ||
        Math.abs(row.otherChargesVariance ?? 0) > 0.005 ||
        Math.abs(row.collectionsVariance ?? 0) > 0.005 ||
        Math.abs(row.creditSalesVariance ?? 0) > 0.005;
      row.branchAuditStatus = hasRounding ? "rounding" : "matched";
      row.branchAuditLabel = hasRounding ? "مطابق ضمن التقريب" : "مطابق";
      row.branchAuditNote = hasRounding ? "مطابق ضمن فروق التقريب المعتادة." : "مطابق.";
    }
  }

  // Keep branches that exist only in the invoice visible in the branch report.
  for (const index of unmatchedInvoiceBranches) {
    const unmatched = invoiceBranches[index];
    if (!unmatched) continue;
    const row = emptyBranch(unmatched.branch || `فرع في الفاتورة فقط ${index + 1}`, "");
    row.invoiceBranchName = unmatched.branch;
    row.invoiceCommission = unmatched.salesCommission;
    row.invoicePaymentFees = unmatched.paymentFees;
    row.invoiceOtherCharges = unmatched.otherCommission;
    row.invoiceOnlyBranchCharges = unmatched.invoiceOnlyCharges;
    row.invoiceCollections = unmatched.totalCollections;
    row.invoiceCreditSales = unmatched.creditSales;
    row.branchAuditStatus = "invoice_only";
    row.branchAuditLabel = "في الفاتورة فقط";
    row.branchAuditNote =
      (unmatched.totalExVat ?? 0) === 0 && (unmatched.totalCollections ?? 0) === 0
        ? "الفرع موجود في الفاتورة فقط ولا توجد عليه حركة مالية."
        : "الفرع موجود في الفاتورة لكنه غير موجود في ملف الطلبات المرفوع.";
    branchList.push(row);
  }

  // Keep invoice-only rows at the end while preserving operational ranking.
  branchList.sort((left, right) => {
    if (left.branchAuditStatus === "invoice_only" && right.branchAuditStatus !== "invoice_only") return 1;
    if (right.branchAuditStatus === "invoice_only" && left.branchAuditStatus !== "invoice_only") return -1;
    return right.netSales - left.netSales;
  });

  // Keep invoice-only charges separate from independently reconstructed charges.
  // This prevents Tadqeeq from "verifying" an invoice line with the same value read from that invoice.
  const dataOnlyOthersComputed =
    summary.rdfCampaigns +
    summary.compensation +
    summary.jokerFees +
    summary.waitingTimeFees;
  const paymentFeesComputed =
    summary.bankFeeSuccess + summary.bankFeeRefunded + (summary.walletFee ?? 0);
  const invoicedDataOnlyOthers = Math.max(0, (invoice.othersCommission ?? 0) - otherExtras);
  const cardFeeEvidence =
    bankRateSource === "manual"
      ? "contract"
      : bankRateSource === "invoice"
        ? "invoice_derived"
        : "data";

  const checks: CheckRow[] = [
    {
      label: "عمولة المبيعات",
      computed: summary.commission,
      invoiced: invoice.salesCommission ?? 0,
      evidence: "data",
      hint: "مجموع عمود العمولة للطلبات الناجحة والفاشلة بعد الاستلام والمرفوضة.",
    },
    {
      label: "رسوم الدفع الإلكتروني",
      computed: paymentFeesComputed,
      invoiced: invoice.paymentFees ?? 0,
      evidence: cardFeeEvidence,
      tolerance: 0.1,
      hint:
        bankRateSource === "manual"
          ? "نسبة العقد × (البطاقات الناجحة + المرتجعة + أساس رسوم المحافظ). فروق حتى 0.10 ر.س تُعامل كتقريب هنقرستيشن لأن ملف Excel لا يكشف الدقة الداخلية المستخدمة لإصدار الفاتورة."
          : "تم استخدام نسبة مستنتجة من إجمالي رسوم الدفع لعدم إدخال نسبة العقد؛ النتيجة مفيدة للتسوية لكنها ليست تحققاً مستقلاً.",
    },
    {
      label: "عمولات أخرى القابلة للتحقق من البيانات",
      computed: dataOnlyOthersComputed,
      invoiced: invoicedDataOnlyOthers,
      evidence: "data",
      hint: "RDF + تعويضات العملاء + رسوم العروض + وقت الانتظار (بدون ضريبة)، بعد استبعاد البنود الموجودة في الفاتورة فقط.",
    },
    {
      label: "إجمالي الفاتورة (بدون ضريبة)",
      computed:
        summary.commission + paymentFeesComputed + dataOnlyOthersComputed + invoiceOnlyExtras,
      invoiced: invoice.totalExVat ?? 0,
      evidence: invoiceOnlyExtras > 0 ? "mixed" : cardFeeEvidence,
      hint:
        invoiceOnlyExtras > 0
          ? "إجمالي تسوية يجمع البنود المحتسبة مع بنود لا توجد إلا في الفاتورة؛ لا يُعد تحققاً مستقلاً لكل مكوّن."
          : undefined,
    },
  ];

  if (invoice.creditSales !== undefined) {
    checks.push({
      label: "مبيعات الائتمان (بدون ضريبة)",
      computed: summary.grossSales / VAT,
      invoiced: invoice.creditSales,
      evidence: "data",
      hint: "Commissionable GMV للطلبات القابلة للفوترة، قبل ضريبة القيمة المضافة.",
    });
  }

  if (invoice.rejectedSales !== undefined) {
    checks.push({
      label: "المبيعات المرفوضة (بدون ضريبة)",
      computed: summary.rejectedSales ?? 0,
      invoiced: invoice.rejectedSales,
      evidence: "data",
      hint: "Commissionable GMV للطلبات بحالة Rejected فقط.",
    });
  }

  if (invoiceWalletFee > 0) {
    checks.push({
      label: "رسوم مدفوعات المحافظ",
      computed: summary.walletFee ?? 0,
      invoiced: invoiceWalletFee,
      evidence: cardFeeEvidence,
      hint: "نسبة الدفع × (Wallet Amount + Transmitter Amount) للطلبات القابلة للفوترة.",
    });
  }

  if (invoice.totalOnlineSales !== undefined) {
    checks.push({
      label: "إجمالي التحصيلات",
      computed: summary.totalCollections ?? 0,
      invoiced: Math.abs(invoice.totalOnlineSales),
      evidence: "data",
      hint:
        "صافي مدفوعات البطاقات + محافظ العملاء + محافظ المندوبين + صافي الخصومات التسويقية + الاعتراضات المعتمدة.",
    });
  }

  if (invoiceExtras.length) {
    for (const extra of invoiceExtras.filter((e) => !e.label.includes("محفظة"))) {
      checks.push({
        label: `${extra.label} (فاتورة فقط)`,
        computed: 0,
        invoiced: extra.amount,
        evidence: "invoice_only",
        hint: "لا يوجد أساس مستقل لهذا البند في ملف الطلبات؛ يحتاج إلى عقد أو مستند تشغيلي للتحقق منه.",
      });
    }
  }

  if (invoice.totalIncVat !== undefined && invoice.netDue !== undefined) {
    checks.push({
      label: "صافي المستحق بعد فاتورة العمولة",
      computed: (summary.totalCollections ?? 0) - invoice.totalIncVat,
      invoiced: Math.abs(invoice.netDue),
      evidence: "mixed",
      hint:
        "التحصيلات معاد احتسابها من ملف الطلبات، ثم يُخصم منها إجمالي فاتورة العمولة بعد الضريبة كما ورد في الفاتورة.",
    });
  }

  const label =
    options.label ??
    (periodStart && periodEnd
      ? `هنقرستيشن · ${periodStart} — ${periodEnd}`
      : "هنقرستيشن");

  return {
    platform: "hungerstation",
    label,
    summary,
    branches: branchList,
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    invoice,
    checks,
  };
}
