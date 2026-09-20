import type {
  AnalysisResult,
  BranchRow,
  CheckRow,
  DailyRow,
  InvoiceFigures,
  JahezCompensationReport,
  JahezCompensationTransaction,
  JahezOrderReference,
  Summary,
} from "./types";

const VAT_FACTOR = 1.15;
const ROUNDING_TOLERANCE = 0.05;

interface CsvRow {
  [key: string]: string;
}

interface JahezAccumulator {
  row: BranchRow;
  commissionInclVat: number;
  paymentFeesExVat: number;
  paymentFeesVat: number;
  deliveryCharge: number;
  offerAmount: number;
  deliveryOfferInclVat: number;
  deliveryOfferInvoiceExVat: number;
  deliveryCoupon: number;
  reportedRestaurantAmount: number;
  calculatedRestaurantAmount: number;
}

export interface JahezOptions {
  invoice?: InvoiceFigures;
  label?: string;
  compensationFile?: ArrayBuffer;
  historicalOrders?: Record<string, JahezOrderReference>;
}

function num(value: string | undefined): number {
  const parsed = Number.parseFloat((value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeBranch(value: string): string {
  return value.replace(/[\t\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function emptyBranch(branch: string): BranchRow {
  return {
    branch,
    branchId: branch,
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

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

function rowObject(headers: string[], row: string[]): CsvRow {
  const result: CsvRow = {};
  headers.forEach((header, index) => {
    result[header.trim()] = row[index]?.trim() ?? "";
  });
  return result;
}

function cleanDirectionalMarks(value: string): string {
  return value.replace(/[\u200e\u200f\u202a-\u202e]/g, "");
}

function dateKey(value: string): string | null {
  const match = cleanDirectionalMarks(value).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  return year + "-" + month!.padStart(2, "0") + "-" + day!.padStart(2, "0");
}

function compensationDateKey(value: string): string | null {
  // Jahez Compensation Report uses US-style month/day/year timestamps,
  // unlike the Restaurant Financial Report order dates (day/month/year).
  const match = cleanDirectionalMarks(value).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const [, month, day, year] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (
    !Number.isInteger(monthNumber) ||
    !Number.isInteger(dayNumber) ||
    monthNumber < 1 ||
    monthNumber > 12 ||
    dayNumber < 1 ||
    dayNumber > 31
  ) {
    return null;
  }
  return year + "-" + month!.padStart(2, "0") + "-" + day!.padStart(2, "0");
}

function periodRange(value: string): { start: string | null; end: string | null } {
  const dates = [...cleanDirectionalMarks(value).matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)].map((match) => {
    const [, day, month, year] = match;
    return year + "-" + month!.padStart(2, "0") + "-" + day!.padStart(2, "0");
  });
  return { start: dates[0] ?? null, end: dates[1] ?? dates[0] ?? null };
}

function parseJahezCompensation(
  file: ArrayBuffer,
  currentOrders: Record<string, JahezOrderReference>,
  historicalOrders: Record<string, JahezOrderReference> = {},
): JahezCompensationReport {
  const text = new TextDecoder("utf-8").decode(file).replace(/^\uFEFF/, "");
  const matrix = parseCsv(text);
  if (matrix.length < 5) {
    throw new Error("ملف تعويضات جاهز لا يحتوي البيانات المتوقعة.");
  }

  const summaryHeaders = matrix[0]!.map((value) => value.trim());
  const summary = rowObject(summaryHeaders, matrix[1] ?? []);
  const detailHeaderIndex = matrix.findIndex((row) => row[0]?.trim() === "#");
  if (detailHeaderIndex < 0) {
    throw new Error("تعذّر العثور على جدول التعويضات التفصيلي في ملف جاهز.");
  }

  const detailHeaders = matrix[detailHeaderIndex]!.map((value) => value.trim());
  const details = matrix
    .slice(detailHeaderIndex + 1)
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => rowObject(detailHeaders, row));

  const seen = new Map<string, number>();
  const transactions: JahezCompensationTransaction[] = [];
  let detailDebit = 0;
  let detailCredit = 0;
  let matchedCurrent = 0;
  let matchedHistorical = 0;
  const unknownOrderIds = new Set<string>();
  let duplicateCandidates = 0;
  let duplicateAmount = 0;

  for (const source of details) {
    const transactionType = (source["Transaction Type"] || "").toLowerCase();
    const amount = num(source["Amount"]);
    const orderId = (source["Order #"] || "").trim();
    const branch = normalizeBranch(source["Branch"] || "غير محدد");
    const currentRef = currentOrders[orderId];
    const historicalRef = !currentRef ? historicalOrders[orderId] : undefined;
    const matched = currentRef ?? historicalRef;
    const match = currentRef ? "current" : historicalRef ? "historical" : "unknown";

    if (transactionType === "debit") detailDebit += amount;
    if (transactionType === "credit") detailCredit += amount;
    if (match === "current") matchedCurrent += 1;
    if (match === "historical") matchedHistorical += 1;
    if (match === "unknown" && orderId) unknownOrderIds.add(orderId);

    const duplicateKey = [
      branch,
      orderId,
      transactionType,
      source["Reason"] || "",
      cleanDirectionalMarks(source["Creation Date"] || ""),
      amount.toFixed(2),
      (source["Free"] || "").toLowerCase(),
      source["Comments"] || "",
      source["Missing Item Name"] || "",
    ].join("|");
    const duplicateIndex = seen.get(duplicateKey) ?? 0;
    seen.set(duplicateKey, duplicateIndex + 1);
    const duplicateCandidate = duplicateIndex > 0;
    if (duplicateCandidate) {
      duplicateCandidates += 1;
      duplicateAmount += amount;
    }

    transactions.push({
      sequence: source["#"] || "",
      branch,
      orderId,
      transactionType,
      reason: source["Reason"] || "",
      creationDate: source["Creation Date"] || "",
      amount,
      free: (source["Free"] || "").toLowerCase() === "true",
      comments: source["Comments"] || undefined,
      missingItemName: source["Missing Item Name"] || undefined,
      match,
      matchedBranch: matched?.branch,
      matchedPeriodLabel: historicalRef?.periodLabel,
      duplicateCandidate,
      branchMismatch: Boolean(matched?.branch && normalizeBranch(matched.branch) !== branch),
    });
  }

  return {
    periodLabel: summary["Date"] || undefined,
    summaryTransactions: Math.round(num(summary["Restaurant_Total_Transactions"])),
    summaryDebit: num(summary["Restaurant_Total_Debit_Amount"]),
    summaryCredit: num(summary["Restaurant_Total_Credit_Amount"]),
    detailTransactions: transactions.length,
    detailDebit,
    detailCredit,
    netImpact: detailDebit - detailCredit,
    matchedCurrent,
    matchedHistorical,
    unknownOrders: unknownOrderIds.size,
    duplicateCandidates,
    duplicateAmount,
    transactions,
  };
}

function settlementFromDetail(row: CsvRow): number {
  return (
    num(row["Order Amount"]) -
    num(row["Jahez Commision"]) +
    num(row["Delivery Charge"]) -
    num(row["Payment Fees"]) -
    num(row["Payment Fees Vat"]) -
    num(row["Offer Amount"]) -
    num(row["Delivery Offer"]) -
    num(row["Delivery Coupon"])
  );
}

function deliveryInvoiceUnitExVat(deliveryOfferInclVat: number): number {
  if (!deliveryOfferInclVat) return 0;
  return round2(deliveryOfferInclVat / VAT_FACTOR);
}

export function analyzeJahez(file: ArrayBuffer, options: JahezOptions = {}): AnalysisResult {
  const text = new TextDecoder("utf-8").decode(file).replace(/^\uFEFF/, "");
  const matrix = parseCsv(text);

  if (matrix.length < 5) {
    throw new Error("ملف جاهز لا يحتوي البيانات المتوقعة.");
  }

  const summaryHeaders = matrix[0]!.map((value) => value.trim());
  const summary = rowObject(summaryHeaders, matrix[1] ?? []);
  const detailHeaderIndex = matrix.findIndex((row) => row[0]?.trim() === "#");
  if (detailHeaderIndex < 0) {
    throw new Error("تعذّر العثور على جدول الطلبات التفصيلي في تقرير جاهز.");
  }

  const detailHeaders = matrix[detailHeaderIndex]!.map((value) => value.trim());
  const details = matrix
    .slice(detailHeaderIndex + 1)
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => rowObject(detailHeaders, row));

  const branches = new Map<string, JahezAccumulator>();
  const daily = new Map<string, DailyRow>();
  const deliveryTiers = new Map<number, number>();
  const orderIndex: Record<string, JahezOrderReference> = {};

  let detailGrossSales = 0;
  let detailCommissionInclVat = 0;
  let detailRestaurantAmount = 0;
  let detailPaymentFees = 0;
  let detailPaymentFeesVat = 0;
  let detailDeliveryOffer = 0;
  let detailOfferAmount = 0;
  let detailDeliveryCoupon = 0;
  let detailDeliveryCharge = 0;
  let detailCalculatedSettlement = 0;

  for (const source of details) {
    const branchName = normalizeBranch(source["Branch Name"] || "غير محدد");
    let branch = branches.get(branchName);
    if (!branch) {
      branch = {
        row: emptyBranch(branchName),
        commissionInclVat: 0,
        paymentFeesExVat: 0,
        paymentFeesVat: 0,
        deliveryCharge: 0,
        offerAmount: 0,
        deliveryOfferInclVat: 0,
        deliveryOfferInvoiceExVat: 0,
        deliveryCoupon: 0,
        reportedRestaurantAmount: 0,
        calculatedRestaurantAmount: 0,
      };
      branches.set(branchName, branch);
    }

    const orderId = (source["Order #"] || "").trim();
    const orderDate = dateKey(source["Date"] ?? "") ?? "";
    if (orderId) {
      orderIndex[orderId] = { branch: branchName, date: orderDate };
    }

    const orderAmount = num(source["Order Amount"]);
    const commissionInclVat = num(source["Jahez Commision"]);
    const paymentFees = num(source["Payment Fees"]);
    const paymentFeesVat = num(source["Payment Fees Vat"]);
    const deliveryCharge = num(source["Delivery Charge"]);
    const offerAmount = num(source["Offer Amount"]);
    const deliveryOffer = num(source["Delivery Offer"]);
    const deliveryCoupon = num(source["Delivery Coupon"]);
    const reportedRestaurant = num(source["Restaurant Amount"]);
    const calculatedRestaurant = settlementFromDetail(source);
    const deliveryInvoiceExVat = deliveryInvoiceUnitExVat(deliveryOffer);

    branch.row.orders += 1;
    branch.row.grossSales += orderAmount;
    branch.row.netSales += reportedRestaurant;
    branch.commissionInclVat += commissionInclVat;
    branch.paymentFeesExVat += paymentFees;
    branch.paymentFeesVat += paymentFeesVat;
    branch.deliveryCharge += deliveryCharge;
    branch.offerAmount += offerAmount;
    branch.deliveryOfferInclVat += deliveryOffer;
    branch.deliveryOfferInvoiceExVat += deliveryInvoiceExVat;
    branch.deliveryCoupon += deliveryCoupon;
    branch.reportedRestaurantAmount += reportedRestaurant;
    branch.calculatedRestaurantAmount += calculatedRestaurant;

    if (deliveryOffer > 0) {
      deliveryTiers.set(deliveryOffer, (deliveryTiers.get(deliveryOffer) ?? 0) + 1);
    }

    detailGrossSales += orderAmount;
    detailCommissionInclVat += commissionInclVat;
    detailRestaurantAmount += reportedRestaurant;
    detailPaymentFees += paymentFees;
    detailPaymentFeesVat += paymentFeesVat;
    detailDeliveryOffer += deliveryOffer;
    detailOfferAmount += offerAmount;
    detailDeliveryCoupon += deliveryCoupon;
    detailDeliveryCharge += deliveryCharge;
    detailCalculatedSettlement += calculatedRestaurant;

    const date = orderDate || dateKey(source["Date"] ?? "");
    if (date) {
      let day = daily.get(date);
      if (!day) {
        day = { date, orders: 0, grossSales: 0, netSales: 0, commission: 0, ccSuccess: 0 };
        daily.set(date, day);
      }
      day.orders += 1;
      day.grossSales += orderAmount;
      day.netSales += reportedRestaurant;
      day.commission += commissionInclVat / VAT_FACTOR;
    }
  }

  const compensationReport = options.compensationFile
    ? parseJahezCompensation(
        options.compensationFile,
        orderIndex,
        options.historicalOrders ?? {},
      )
    : undefined;

  const compensationByBranch = new Map<
    string,
    {
      transactions: number;
      debit: number;
      credit: number;
      duplicateAmount: number;
      unknownAmount: number;
    }
  >();

  for (const transaction of compensationReport?.transactions ?? []) {
    const current =
      compensationByBranch.get(transaction.branch) ?? {
        transactions: 0,
        debit: 0,
        credit: 0,
        duplicateAmount: 0,
        unknownAmount: 0,
      };
    current.transactions += 1;
    if (transaction.transactionType === "debit") current.debit += transaction.amount;
    if (transaction.transactionType === "credit") current.credit += transaction.amount;
    if (transaction.duplicateCandidate) current.duplicateAmount += transaction.amount;
    if (transaction.match === "unknown") current.unknownAmount += transaction.amount;
    compensationByBranch.set(transaction.branch, current);

    const compensationDate = compensationDateKey(transaction.creationDate);
    if (compensationDate) {
      let day = daily.get(compensationDate);
      if (!day) {
        day = {
          date: compensationDate,
          orders: 0,
          grossSales: 0,
          netSales: 0,
          commission: 0,
          ccSuccess: 0,
        };
        daily.set(compensationDate, day);
      }
      if (transaction.transactionType === "debit") {
        day.jahezCompensationDebit = (day.jahezCompensationDebit ?? 0) + transaction.amount;
      }
      if (transaction.transactionType === "credit") {
        day.jahezCompensationCredit = (day.jahezCompensationCredit ?? 0) + transaction.amount;
      }
      day.jahezCompensationNetImpact =
        (day.jahezCompensationDebit ?? 0) - (day.jahezCompensationCredit ?? 0);
    }
  }

  const branchRows = [...branches.values()].map((source) => {
    const row = source.row;
    row.commission = source.commissionInclVat / VAT_FACTOR;
    row.commissionPct = row.grossSales ? source.commissionInclVat / row.grossSales : 0;
    row.totalCharges =
      row.commission +
      source.paymentFeesExVat +
      source.deliveryOfferInvoiceExVat;
    row.jahezCommissionInclVat = source.commissionInclVat;
    row.jahezPaymentFeesExVat = source.paymentFeesExVat;
    row.jahezPaymentFeesVat = source.paymentFeesVat;
    row.jahezDeliveryCharge = source.deliveryCharge;
    row.jahezOfferAmount = source.offerAmount;
    row.jahezDeliveryOfferInclVat = source.deliveryOfferInclVat;
    row.jahezDeliveryOfferInvoiceExVat = source.deliveryOfferInvoiceExVat;
    row.jahezDeliveryCoupon = source.deliveryCoupon;
    row.jahezReportedRestaurantAmount = source.reportedRestaurantAmount;
    row.jahezSettlementVariance =
      source.calculatedRestaurantAmount - source.reportedRestaurantAmount;

    const branchCompensation = compensationByBranch.get(row.branch);
    if (branchCompensation) {
      row.jahezCompensationTransactions = branchCompensation.transactions;
      row.jahezCompensationDebit = branchCompensation.debit;
      row.jahezCompensationCredit = branchCompensation.credit;
      row.jahezCompensationNetImpact =
        branchCompensation.debit - branchCompensation.credit;
      row.jahezCompensationDuplicateAmount = branchCompensation.duplicateAmount;
      row.jahezCompensationUnknownAmount = branchCompensation.unknownAmount;
    }

    if (Math.abs(row.jahezSettlementVariance) <= 0.01) {
      row.branchAuditStatus = "matched";
      row.branchAuditLabel = "مطابق";
      row.branchAuditNote = "معادلة صافي المطعم مطابقة لكل طلبات الفرع.";
    } else {
      row.branchAuditStatus = "warning";
      row.branchAuditLabel = "يحتاج مراجعة";
      row.branchAuditNote = "يوجد فرق بين إعادة احتساب صافي المطعم والقيمة المبلغ عنها في CSV.";
    }
    return row;
  });

  branchRows.sort((left, right) => right.grossSales - left.grossSales);

  const merchantGrossSales = num(summary["Orders Amount"]);
  const merchantCommissionInclVat = num(summary["Jahez Commision"]);
  const merchantRestaurantAmount = num(summary["Restaurant Amount"]);
  const merchantPaymentFees = num(summary["Payment Fees"]);
  const merchantPaymentFeesVat = num(summary["Payment Fees Vat"]);
  const merchantOfferAmount = num(summary["Offer Amount"]);
  const merchantDeliveryOffer = num(summary["Delivery Offer"]);
  const merchantDeliveryCoupon = num(summary["Delivery Coupon"]);

  const commissionInvoiceExVat = round2(merchantCommissionInclVat / VAT_FACTOR);
  const deliveryOfferInvoiceExVat = [...deliveryTiers.entries()].reduce(
    (total, [tierInclVat, quantity]) =>
      total + deliveryInvoiceUnitExVat(tierInclVat) * quantity,
    0,
  );
  const invoiceExVatComputed =
    commissionInvoiceExVat + merchantPaymentFees + deliveryOfferInvoiceExVat;
  const invoiceVatComputed = round2(invoiceExVatComputed * 0.15);
  const invoiceInclVatComputed = round2(invoiceExVatComputed + invoiceVatComputed);
  const range = periodRange(summary["Date"] ?? "");
  if (compensationReport?.periodLabel) {
    const compensationRange = periodRange(compensationReport.periodLabel);
    if (
      range.start &&
      range.end &&
      compensationRange.start &&
      compensationRange.end &&
      (range.start !== compensationRange.start || range.end !== compensationRange.end)
    ) {
      throw new Error(
        "ملف تعويضات جاهز لا يطابق فترة Restaurant Financial Report. تحقق من الشهر قبل التحليل.",
      );
    }
  }

  const resultSummary: Summary = {
    platform: "jahez",
    orders: details.length,
    grossSales: merchantGrossSales,
    netSales: merchantRestaurantAmount,
    commission: commissionInvoiceExVat,
    commissionPct: merchantGrossSales ? merchantCommissionInclVat / merchantGrossSales : 0,
    ccSuccess: 0,
    ccRejected: 0,
    walletAmount: 0,
    riderWallet: 0,
    rdfCampaigns: 0,
    compensation: compensationReport?.netImpact ?? 0,
    jokerFees: 0,
    hsFoodDiscount: 0,
    rewardsDiscount: 0,
    restaurantFoodDiscount: 0,
    totalFoodDiscount: 0,
    partialRefund: 0,
    fulfillmentMods: 0,
    approvedRefunds: 0,
    waitingTimeFees: 0,
    bankRate: 0,
    bankRateSource: "none",
    bankFeeSuccess: 0,
    bankFeeRefunded: 0,
    invoiceOnlyExtras: 0,
    totalCharges: invoiceExVatComputed,
    branchCount: branchRows.length,
    statusCounts: { "طلبات جاهز": details.length },
    periodStart: range.start,
    periodEnd: range.end,
    jahezCommissionInclVat: merchantCommissionInclVat,
    jahezCommissionInvoiceExVat: commissionInvoiceExVat,
    jahezPaymentFeesExVat: merchantPaymentFees,
    jahezPaymentFeesVat: merchantPaymentFeesVat,
    jahezDeliveryCharge: detailDeliveryCharge,
    jahezOfferAmount: merchantOfferAmount,
    jahezDeliveryOfferInclVat: merchantDeliveryOffer,
    jahezDeliveryOfferInvoiceExVat: deliveryOfferInvoiceExVat,
    jahezDeliveryCoupon: merchantDeliveryCoupon,
    jahezReportedRestaurantAmount: merchantRestaurantAmount,
    jahezSettlementVariance: detailCalculatedSettlement - merchantRestaurantAmount,
    jahezInvoiceExVatComputed: invoiceExVatComputed,
    jahezInvoiceVatComputed: invoiceVatComputed,
    jahezInvoiceInclVatComputed: invoiceInclVatComputed,
    jahezDeliveryOfferTiers: Object.fromEntries(
      [...deliveryTiers.entries()]
        .sort((left, right) => right[0] - left[0])
        .map(([amount, quantity]) => [amount.toFixed(2), quantity]),
    ),
    jahezCompensationTransactions: compensationReport?.detailTransactions,
    jahezCompensationDebit: compensationReport?.detailDebit,
    jahezCompensationCredit: compensationReport?.detailCredit,
    jahezCompensationNetImpact: compensationReport?.netImpact,
    jahezAdjustedRestaurantAmount:
      compensationReport !== undefined
        ? merchantRestaurantAmount - compensationReport.netImpact
        : undefined,
    jahezCompensationMatchedCurrent: compensationReport?.matchedCurrent,
    jahezCompensationMatchedHistorical: compensationReport?.matchedHistorical,
    jahezCompensationUnknownOrders: compensationReport?.unknownOrders,
    jahezCompensationDuplicateCandidates: compensationReport?.duplicateCandidates,
    jahezCompensationDuplicateAmount: compensationReport?.duplicateAmount,
  };

  const invoice: InvoiceFigures = {
    ...(options.invoice ?? { lines: [] }),
    jahezCompensation: compensationReport,
    jahezOrderIndex: orderIndex,
  };
  const checks: CheckRow[] = [
    {
      label: "إجمالي الطلبات مقابل ملخص جاهز",
      computed: detailGrossSales,
      invoiced: merchantGrossSales,
      evidence: "mixed",
      tolerance: ROUNDING_TOLERANCE,
      hint: "فحص رقابي داخلي داخل CSV: مجموع Order Amount من الطلبات مقابل Orders Amount في ملخص التاجر.",
    },
    {
      label: "صافي المطعم المعاد احتسابه",
      computed: detailCalculatedSettlement,
      invoiced: merchantRestaurantAmount,
      evidence: "mixed",
      tolerance: ROUNDING_TOLERANCE,
      hint:
        "فحص رقابي داخلي داخل CSV: Order Amount - Jahez Commission + Delivery Charge - Payment Fees - Payment Fees VAT - Offer Amount - Delivery Offer - Delivery Coupon.",
    },
    {
      label: "عمولة الطلبات مقابل ملخص جاهز",
      computed: detailCommissionInclVat,
      invoiced: merchantCommissionInclVat,
      evidence: "mixed",
      tolerance: ROUNDING_TOLERANCE,
      hint: "فحص رقابي داخلي داخل CSV: مجموع العمولة المقربة لكل طلب مقابل عمولة التاجر الدقيقة في رأس التقرير.",
    },
  ];

  if (compensationReport) {
    checks.push({
      label: "تعويضات جاهز: إجمالي الخصم",
      computed: compensationReport.detailDebit,
      invoiced: compensationReport.summaryDebit,
      evidence: "mixed",
      tolerance: 0.01,
      hint: "فحص داخلي لملف التعويضات: مجموع معاملات debit مقابل إجمالي الخصم في رأس الملف.",
    });
    if (compensationReport.detailCredit !== 0 || compensationReport.summaryCredit !== 0) {
      checks.push({
        label: "تعويضات جاهز: إجمالي الإضافة",
        computed: compensationReport.detailCredit,
        invoiced: compensationReport.summaryCredit,
        evidence: "mixed",
        tolerance: 0.01,
        hint: "فحص داخلي لملف التعويضات: مجموع معاملات credit مقابل إجمالي الإضافة في رأس الملف.",
      });
    }
  }

  if (invoice.jahezCommissionExVat !== undefined) {
    checks.push({
      label: "عمولة جاهز",
      computed: commissionInvoiceExVat,
      invoiced: invoice.jahezCommissionExVat,
      evidence: "data",
      tolerance: 0.05,
      hint: "عمولة التاجر في CSV ÷ 1.15، مقربة إلى هللتين، مقابل الفاتورة الضريبية.",
    });
  }
  if (invoice.jahezDeliveryOfferExVat !== undefined) {
    checks.push({
      label: "عروض التوصيل",
      computed: deliveryOfferInvoiceExVat,
      invoiced: invoice.jahezDeliveryOfferExVat,
      evidence: "data",
      tolerance: 0.05,
      hint:
        "كل Tier في CSV يتحول إلى سعر وحدة بدون الضريبة (مثال 10→8.70 و4→3.48) ثم يضرب في عدد الطلبات.",
    });
  }
  if (invoice.jahezPaymentFeesExVat !== undefined) {
    checks.push({
      label: "رسوم مدفوعات جاهز",
      computed: merchantPaymentFees,
      invoiced: invoice.jahezPaymentFeesExVat,
      evidence: "data",
      tolerance: 0.05,
      hint: "Payment Fees من ملخص CSV مقابل Payment Fees في الفاتورة.",
    });
  }
  if (invoice.totalExVat !== undefined) {
    checks.push({
      label: "إجمالي فاتورة جاهز بدون الضريبة",
      computed: invoiceExVatComputed,
      invoiced: invoice.totalExVat,
      evidence: "data",
      tolerance: 0.05,
    });
  }
  if (invoice.vat !== undefined) {
    checks.push({
      label: "ضريبة فاتورة جاهز",
      computed: invoiceVatComputed,
      invoiced: invoice.vat,
      evidence: "data",
      tolerance: 0.05,
    });
  }
  if (invoice.totalIncVat !== undefined) {
    checks.push({
      label: "إجمالي فاتورة جاهز شامل الضريبة",
      computed: invoiceInclVatComputed,
      invoiced: invoice.totalIncVat,
      evidence: "data",
      tolerance: 0.05,
    });
  }

  return {
    platform: "jahez",
    label:
      options.label?.trim() ||
      (range.start && range.end ? "جاهز · " + range.start + " — " + range.end : "جاهز"),
    summary: resultSummary,
    branches: branchRows,
    daily: [...daily.values()].sort((left, right) => left.date.localeCompare(right.date)),
    invoice,
    checks,
  };
}
