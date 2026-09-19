import * as XLSX from "xlsx";

import type {
  AnalysisResult,
  BranchRow,
  CheckRow,
  DailyRow,
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

type StatusClass = "successful" | "failedAfterPickup" | "rejected" | "failedBefore" | "other";

function classifyStatus(raw: string): StatusClass {
  const s = raw.toLowerCase();
  if (s.includes("successful")) return "successful";
  if (s.includes("after pick")) return "failedAfterPickup";
  // HungerStation bills "failed by vendor" exactly like a delivered order.
  if (s.includes("vendor")) return "failedAfterPickup";
  if (s.includes("reject")) return "rejected";
  if (s.includes("before pick")) return "failedBefore";
  if (s.includes("fail")) return "failedBefore";
  return "other";
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
    walletAmount: 0,
    riderWallet: 0,
    rdfCampaigns: 0,
    freeDeliveryOrders: 0,
    compensation: 0,
    jokerFees: 0,
    hsFoodDiscount: 0,
    rewardsDiscount: 0,
    restaurantFoodDiscount: 0,
    totalFoodDiscount: 0,
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

    // Commission base: successful + failed after pickup + rejected
    if (cls === "successful" || cls === "failedAfterPickup" || cls === "rejected") {
      row.netSales += gmv;
      row.commission += commission;
    }

    // Operational base: successful + failed after pickup
    if (cls === "successful" || cls === "failedAfterPickup") {
      row.orders += 1;
      row.grossSales += num(col(order, "Original Amount"));
      row.rdfCampaigns += num(col(order, "Restaurant delivery Discount"));
      row.jokerFees += num(col(order, "Flash Deals Fee Excluding Vat"));
      row.hsFoodDiscount += num(col(order, "HS Food Discount"));
      row.rewardsDiscount += num(col(order, "Rewards Discounts", "Rewards Discount"));
      row.restaurantFoodDiscount += num(col(order, "Restaurant Food discount"));

      if (isOnline) {
        row.ccSuccess += ccAmount;
        row.walletAmount += num(col(order, "Wallet Amount"));
        row.riderWallet += num(col(order, "Transmitter Amount"));
      }

      if (date) {
        let day = dailyMap.get(date);
        if (!day) {
          day = { date, orders: 0, grossSales: 0, netSales: 0, commission: 0, ccSuccess: 0 };
          dailyMap.set(date, day);
        }
        day.orders += 1;
        day.grossSales += num(col(order, "Original Amount"));
        day.netSales += gmv;
        day.commission += commission;
        if (isOnline) day.ccSuccess += ccAmount;
      }
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

  // HungerStation's guide bills RDF only for successful / failed-after-pickup orders.
  // "Failed by vendor" is classified with failed-after-pickup above.
  for (const fd of rowsOf(wb, "free delivery")) {
    const cls = classifyStatus(text(col(fd, "Status")));
    if (cls !== "successful" && cls !== "failedAfterPickup") continue;
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
    row.totalFoodDiscount =
      row.hsFoodDiscount + row.rewardsDiscount + row.restaurantFoodDiscount;
    row.commissionPct = row.netSales > 0 ? row.commission / row.netSales : 0;
  }

  const totalCcSuccess = branchList.reduce((sum, r) => sum + r.ccSuccess, 0);
  const totalCcRejected = branchList.reduce((sum, r) => sum + r.ccRejected, 0);

  // Fixed charges that only exist on the invoice (wallet fee, printers, subscription…)
  const invoiceExtras = options.invoice?.extras ?? [];
  const walletFeeExtra = invoiceExtras
    .filter((e) => e.label.includes("محفظة"))
    .reduce((sum, e) => sum + e.amount, 0);
  const otherExtras = invoiceExtras
    .filter((e) => !e.label.includes("محفظة"))
    .reduce((sum, e) => sum + e.amount, 0);
  const invoiceOnlyExtras = walletFeeExtra + otherExtras;

  // The Excel export does not contain the contract bank-fee rate.
  // Keep an invoice-implied rate for diagnostics, but prefer a user-supplied contract rate
  // so the payment-fee audit is independent from the invoice being checked.
  const invoicedCardFees = Math.max(0, (options.invoice?.paymentFees ?? 0) - walletFeeExtra);
  const ccBase = totalCcSuccess + totalCcRejected;
  const invoiceImpliedBankRate =
    invoicedCardFees > 0 && ccBase > 0
      ? Math.round((invoicedCardFees / ccBase) / 0.0005) * 0.0005
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
    row.totalCharges =
      row.commission +
      row.bankFeeSuccess +
      row.bankFeeRefunded +
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
    walletAmount: sum((r) => r.walletAmount),
    riderWallet: sum((r) => r.riderWallet),
    rdfCampaigns: sum((r) => r.rdfCampaigns),
    compensation: sum((r) => r.compensation),
    jokerFees: sum((r) => r.jokerFees),
    hsFoodDiscount: sum((r) => r.hsFoodDiscount),
    rewardsDiscount: sum((r) => r.rewardsDiscount),
    restaurantFoodDiscount: sum((r) => r.restaurantFoodDiscount),
    totalFoodDiscount: sum((r) => r.totalFoodDiscount),
    partialRefund: sum((r) => r.partialRefund),
    fulfillmentMods: sum((r) => r.fulfillmentMods),
    approvedRefunds: sum((r) => r.approvedRefunds),
    waitingTimeFees: sum((r) => r.waitingTimeFees),
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

  const invoice = options.invoice ?? { lines: [] };
  if (options.cpcInvoice?.totalIncVat) invoice.cpc = options.cpcInvoice.totalIncVat;

  // Keep invoice-only charges separate from independently reconstructed charges.
  // This prevents Tadqeeq from "verifying" an invoice line with the same value read from that invoice.
  const dataOnlyOthersComputed =
    summary.rdfCampaigns +
    summary.compensation +
    summary.jokerFees +
    summary.waitingTimeFees;
  const cardFeesComputed = summary.bankFeeSuccess + summary.bankFeeRefunded;
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
      label: "رسوم الدفع الإلكتروني (البطاقات)",
      computed: cardFeesComputed,
      invoiced: invoicedCardFees,
      evidence: cardFeeEvidence,
      hint:
        bankRateSource === "manual"
          ? "نسبة العقد × (مدفوعات البطاقات الناجحة + المرتجعة). رسوم المحفظة تُفصل كبند فاتورة فقط."
          : "تم استخدام نسبة مستنتجة من الفاتورة لعدم إدخال نسبة العقد؛ النتيجة مفيدة للتسوية لكنها ليست تحققاً مستقلاً.",
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
        summary.commission + cardFeesComputed + dataOnlyOthersComputed + invoiceOnlyExtras,
      invoiced: invoice.totalExVat ?? 0,
      evidence: invoiceOnlyExtras > 0 ? "mixed" : cardFeeEvidence,
      hint:
        invoiceOnlyExtras > 0
          ? "إجمالي تسوية يجمع البنود المحتسبة مع بنود لا توجد إلا في الفاتورة؛ لا يُعد تحققاً مستقلاً لكل مكوّن."
          : undefined,
    },
  ];

  if (invoiceExtras.length) {
    for (const extra of invoiceExtras) {
      checks.push({
        label: `${extra.label} (فاتورة فقط)`,
        computed: 0,
        invoiced: extra.amount,
        evidence: "invoice_only",
        hint: "لا يوجد أساس مستقل لهذا البند في ملف الطلبات؛ يحتاج إلى عقد أو مستند تشغيلي للتحقق منه.",
      });
    }
  }

  if (
    invoice.totalOnlineSales !== undefined &&
    invoice.totalIncVat !== undefined &&
    invoice.netDue !== undefined
  ) {
    checks.push({
      label: "اتساق صافي المستحق داخل الفاتورة",
      computed: Math.abs(invoice.totalOnlineSales) - invoice.totalIncVat,
      invoiced: Math.abs(invoice.netDue),
      evidence: "invoice_only",
      hint: "فحص حسابي داخلي: إجمالي التحصيلات ناقص إجمالي فاتورة العمولة بعد الضريبة. لا يعتمد على مصدر مستقل.",
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
