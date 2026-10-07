import { createHash } from "node:crypto";
import * as XLSX from "xlsx";

import type {
  OperationAdjustment,
  OperationImportSummary,
  OperationOrder,
  ParsedOperationImport,
} from "./types";

type Cell = string | number | boolean | Date | null | undefined;
type Matrix = Cell[][];
type RawRecord = Record<string, string | number | boolean | null>;

const EMPTY_SUMMARY: OperationImportSummary = {
  orderCount: 0,
  grossSales: 0,
  deliveryAmount: 0,
  complaintCount: 0,
  refundCount: 0,
  refundAmount: 0,
  discountAmount: 0,
  merchantFundedDiscountAmount: 0,
  merchantFundedVoucherAmount: 0,
  commissionAmount: 0,
  paymentFeeAmount: 0,
  estimatedEarningsAmount: 0,
  cancellationCount: 0,
  chargesTotal: 0,
  settlementAmount: 0,
  adjustmentDebit: 0,
  adjustmentCredit: 0,
  matchedAdjustments: 0,
  unmatchedAdjustments: 0,
};

const clean = (value: Cell): string =>
  value == null ? "" : value instanceof Date ? value.toISOString() : String(value).trim();

function money(value: Cell): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = clean(value)
    .replace(/\u00a0/g, " ")
    .replace(/SAR/gi, "")
    .replace(/,/g, "")
    .replace(/[^0-9.+-]/g, "");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`قيمة مالية غير صالحة: ${clean(value)}`);
  return parsed;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isoDate(value: Cell): string {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = clean(value);
  const compact = text.match(/^(\d{4})([01]\d)([0-3]\d)(?:\s|$)/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const iso = text.match(/^(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)/);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  const dmy = text.match(/^([0-3]?\d)[-/]([01]?\d)[-/](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  const named = text.match(/^([0-3]?\d)\s+([A-Za-z]{3})\s+(\d{4})/);
  const months: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  if (named && months[named[2]!])
    return `${named[3]}-${months[named[2]!]!}-${named[1]!.padStart(2, "0")}`;
  throw new Error(`تاريخ غير صالح في ملف العمليات: ${text || "فارغ"}`);
}

function readMatrix(file: File): Promise<Matrix> {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) throw new Error("الملف لا يحتوي ورقة بيانات.");

    // Some Keeta exports declare an incorrect A-only worksheet dimension even though
    // their XML contains data through AE. Rebuild the used range from the actual cells.
    const cells = Object.keys(sheet).filter((key) => !key.startsWith("!"));
    if (cells.length) {
      const first = XLSX.utils.decode_cell(cells[0]!);
      const range = { s: { ...first }, e: { ...first } };
      for (const key of cells.slice(1)) {
        const cell = XLSX.utils.decode_cell(key);
        range.s.r = Math.min(range.s.r, cell.r);
        range.s.c = Math.min(range.s.c, cell.c);
        range.e.r = Math.max(range.e.r, cell.r);
        range.e.c = Math.max(range.e.c, cell.c);
      }
      sheet["!ref"] = XLSX.utils.encode_range(range);
    }
    return XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: null });
  });
}

function hasHeader(matrix: Matrix, required: string[]): boolean {
  return matrix.some((row) => {
    const headers = row.map(clean);
    return required.every((column) => headers.includes(column));
  });
}

function headerTable(matrix: Matrix, required: string[]) {
  const headerIndex = matrix.findIndex((row) => {
    const headers = row.map(clean);
    return required.every((column) => headers.includes(column));
  });
  if (headerIndex < 0) throw new Error(`الأعمدة المطلوبة غير موجودة: ${required.join("، ")}`);
  const headers = matrix[headerIndex]!.map(clean);
  const records = matrix
    .slice(headerIndex + 1)
    .filter((row) => row.some((value) => clean(value)))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])));
  return { headers, records };
}

function rawRecord(record: Record<string, Cell>): RawRecord {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      value instanceof Date
        ? value.toISOString()
        : value == null
          ? null
          : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
            ? value
            : clean(value),
    ]),
  );
}

function oneBusinessDate(orders: OperationOrder[], adjustments: OperationAdjustment[]): string {
  const dates = new Set([
    ...orders.map((row) => row.businessDate),
    ...adjustments.map((row) => row.businessDate),
  ]);
  if (dates.size !== 1) throw new Error("ملف العمليات اليومي يجب أن يحتوي تاريخ تشغيل واحداً فقط.");
  return [...dates][0]!;
}

function summarize(
  orders: OperationOrder[],
  adjustments: OperationAdjustment[],
): OperationImportSummary {
  return orders.reduce<OperationImportSummary>(
    (summary, order) => ({
      ...summary,
      orderCount: summary.orderCount + 1,
      grossSales: round(summary.grossSales + order.grossSales),
      deliveryAmount: round(summary.deliveryAmount + order.deliveryAmount),
      complaintCount: summary.complaintCount + (order.complaint ? 1 : 0),
      refundCount:
        summary.refundCount + (order.refundType || (order.refundAmount ?? 0) !== 0 ? 1 : 0),
      refundAmount: round(summary.refundAmount + (order.refundAmount ?? 0)),
      discountAmount: round(summary.discountAmount + order.discountAmount),
      merchantFundedDiscountAmount: round(
        summary.merchantFundedDiscountAmount + order.merchantFundedDiscountAmount,
      ),
      merchantFundedVoucherAmount: round(
        summary.merchantFundedVoucherAmount + order.merchantFundedVoucherAmount,
      ),
      commissionAmount: round(summary.commissionAmount + order.commissionAmount),
      paymentFeeAmount: round(summary.paymentFeeAmount + order.paymentFeeAmount),
      estimatedEarningsAmount: round(
        summary.estimatedEarningsAmount + order.estimatedEarningsAmount,
      ),
      cancellationCount: summary.cancellationCount + (/cancel/i.test(order.status ?? "") ? 1 : 0),
      chargesTotal: round(summary.chargesTotal + order.chargesTotal),
      settlementAmount: round(summary.settlementAmount + order.settlementAmount),
    }),
    adjustments.reduce<OperationImportSummary>(
      (summary, adjustment) => ({
        ...summary,
        adjustmentDebit: round(
          summary.adjustmentDebit +
            (adjustment.transactionType === "debit" ? adjustment.amount : 0),
        ),
        adjustmentCredit: round(
          summary.adjustmentCredit +
            (adjustment.transactionType === "credit" ? adjustment.amount : 0),
        ),
      }),
      { ...EMPTY_SUMMARY },
    ),
  );
}

function uniqueOrders(orders: OperationOrder[]): OperationOrder[] {
  const ids = new Set<string>();
  for (const order of orders) {
    if (ids.has(order.orderId)) throw new Error(`رقم الطلب مكرر داخل الملف: ${order.orderId}`);
    ids.add(order.orderId);
  }
  return orders;
}

function parseHungerstation(matrix: Matrix): ParsedOperationImport {
  const { records } = headerTable(matrix, [
    "Order ID",
    "Order received at",
    "Order status",
    "Delivery type",
  ]);
  const orders = uniqueOrders(
    records.map((row): OperationOrder => {
      const orderId = clean(row["Order ID"]);
      if (!orderId) throw new Error("يوجد طلب هنقرستيشن بدون Order ID.");
      const complaint = clean(row["Has complaint?"]).toLowerCase() === "y";
      const merchantFundedDiscount = Math.abs(money(row["Discount Funded by you"]));
      const merchantFundedVoucher = Math.abs(money(row["Voucher Funded by you"]));
      const charges = [
        "Commission",
        "Operational charges",
        "Online payment fee",
        "Ads fee",
        "Wait time fee",
        "Marketing fees total",
        "Avoidable cancellation fee",
        "Discount Funded by you",
        "Voucher Funded by you",
        "Vendor refunds",
      ];
      return {
        orderId,
        businessDate: isoDate(row["Order received at"]),
        branchId: clean(row["Store ID"]) || null,
        branchName: clean(row["Restaurant name"]) || null,
        status: clean(row["Order status"]) || null,
        deliveryMode: clean(row["Delivery type"]) || null,
        grossSales: round(
          money(row["Subtotal"]) +
            money(row["Packaging charges"]) +
            money(row["Minimum order value fee"]),
        ),
        deliveryAmount: 0,
        complaint,
        complaintReason: complaint ? clean(row["Complaint reason"]) || null : null,
        refundType: money(row["Vendor refunds"]) !== 0 ? "vendor_refund" : null,
        refundAmount: money(row["Vendor refunds"]) || null,
        discountAmount: round(merchantFundedDiscount + merchantFundedVoucher),
        merchantFundedDiscountAmount: round(merchantFundedDiscount),
        merchantFundedVoucherAmount: round(merchantFundedVoucher),
        commissionAmount: round(Math.abs(money(row["Commission"]))),
        paymentFeeAmount: round(Math.abs(money(row["Online payment fee"]))),
        estimatedEarningsAmount: round(money(row["Estimated earnings"])),
        chargesTotal: round(charges.reduce((sum, column) => sum + money(row[column]), 0)),
        settlementAmount: round(money(row["Payout amount"])),
        rawData: rawRecord(row),
      };
    }),
  );
  const businessDate = oneBusinessDate(orders, []);
  return {
    platform: "hungerstation",
    sourceKind: "hungerstation_orders",
    businessDate,
    orders,
    adjustments: [],
    summary: summarize(orders, []),
  };
}

function parseLegacyKeeta(matrix: Matrix): ParsedOperationImport {
  const { records } = headerTable(matrix, ["Order no.", "Order time", "Order status", "Earnings"]);
  const orders = uniqueOrders(
    records.map((row): OperationOrder => {
      const orderId = clean(row["Order no."]);
      if (!orderId) throw new Error("يوجد طلب كيتا بدون Order no.");
      const merchantPromotion = money(row["Promotion funded by merchant"]);
      const campaign = clean(row["Campaign type"]);
      const chargeValues = [
        money(row["Basic commission"]),
        money(row["Online payment fee"]),
        merchantPromotion,
      ];
      return {
        orderId,
        businessDate: isoDate(row["Order time"]),
        branchId: clean(row["Store ID"]) || null,
        branchName: clean(row["Store name"]) || null,
        status: clean(row["Order status"]) || null,
        deliveryMode: /delivery/i.test(campaign) ? "delivery" : null,
        grossSales: round(money(row["Original price"]) || money(row["Customer paid"])),
        deliveryAmount: 0,
        complaint: Boolean(clean(row["Refund type"])),
        complaintReason:
          clean(row["Determination reason"]) || clean(row["Order cancellation reason"]) || null,
        refundType: clean(row["Refund type"]) || null,
        refundAmount: null,
        discountAmount: round(Math.abs(merchantPromotion)),
        merchantFundedDiscountAmount: round(Math.abs(merchantPromotion)),
        merchantFundedVoucherAmount: 0,
        commissionAmount: round(Math.abs(money(row["Basic commission"]))),
        paymentFeeAmount: round(Math.abs(money(row["Online payment fee"]))),
        estimatedEarningsAmount: round(money(row["Earnings"])),
        chargesTotal: round(
          chargeValues.reduce((sum, value) => sum + (value < 0 ? -value : value), 0),
        ),
        settlementAmount: round(money(row["Earnings"])),
        rawData: rawRecord(row),
      };
    }),
  );
  const businessDate = oneBusinessDate(orders, []);
  return {
    platform: "keeta",
    sourceKind: "keeta_orders",
    businessDate,
    orders,
    adjustments: [],
    summary: summarize(orders, []),
  };
}

function parseCurrentKeeta(matrix: Matrix): ParsedOperationImport {
  const { records } = headerTable(matrix, [
    "Date",
    "Order ID",
    "Order status",
    "Earnings",
    "Sales",
    "Promotion expense",
    "Commission",
    "Other expenses",
    "Delivery fee",
  ]);
  const orders = uniqueOrders(
    records.map((row): OperationOrder => {
      const orderId = clean(row["Order ID"]);
      if (!orderId) throw new Error("يوجد طلب كيتا بدون Order ID.");
      const status = clean(row["Order status"]);
      const refundType = /refund/i.test(status) ? status : null;
      const promotionExpense = money(row["Promotion expense"]);
      const commission = money(row["Commission"]);
      const otherExpenses = money(row["Other expenses"]);
      const cancellationType = clean(row["Cancellation type"]);
      return {
        orderId,
        businessDate: isoDate(row["Date"]),
        branchId: clean(row["Store ID"]) || null,
        branchName: clean(row["Store name"]) || null,
        status: status || null,
        deliveryMode: clean(row["Order type"]) || null,
        grossSales: round(money(row["Sales"])),
        deliveryAmount: round(money(row["Delivery fee"])),
        complaint: Boolean(refundType),
        complaintReason:
          (cancellationType && cancellationType !== "-" ? cancellationType : null) ??
          (clean(row["Reason for order cancellation"]) || null),
        refundType,
        refundAmount: null,
        discountAmount: round(promotionExpense),
        merchantFundedDiscountAmount: round(promotionExpense),
        merchantFundedVoucherAmount: 0,
        commissionAmount: round(commission),
        paymentFeeAmount: round(otherExpenses),
        estimatedEarningsAmount: round(money(row["Earnings"])),
        chargesTotal: round(promotionExpense + commission + otherExpenses),
        settlementAmount: round(money(row["Earnings"])),
        rawData: rawRecord(row),
      };
    }),
  );
  const businessDate = oneBusinessDate(orders, []);
  return {
    platform: "keeta",
    sourceKind: "keeta_orders",
    businessDate,
    orders,
    adjustments: [],
    summary: summarize(orders, []),
  };
}

function parseKeeta(matrix: Matrix): ParsedOperationImport {
  if (hasHeader(matrix, ["Date", "Order ID", "Order status", "Earnings", "Sales"]))
    return parseCurrentKeeta(matrix);
  return parseLegacyKeeta(matrix);
}

function parseJahezOrders(matrix: Matrix): ParsedOperationImport {
  const { records } = headerTable(matrix, [
    "#",
    "Order #",
    "Date",
    "Order Amount",
    "Restaurant Amount",
  ]);
  const orders = uniqueOrders(
    records.map((row): OperationOrder => {
      const orderId = clean(row["Order #"]);
      if (!orderId) throw new Error("يوجد طلب جاهز بدون Order #.");
      const deliveryOffer = money(row["Delivery Offer"]);
      const deliveryCharge = money(row["Delivery Charge"]);
      const charges =
        money(row["Jahez Commision"]) +
        money(row["Payment Fees"]) +
        money(row["Payment Fees Vat"]) +
        money(row["Offer Amount"]) +
        deliveryOffer +
        money(row["Delivery Coupon"]) -
        deliveryCharge;
      return {
        orderId,
        businessDate: isoDate(row["Date"]),
        branchId: null,
        branchName: clean(row["Branch Name"]) || null,
        status: "completed",
        deliveryMode: deliveryOffer !== 0 || deliveryCharge !== 0 ? "delivery" : null,
        grossSales: round(money(row["Order Amount"])),
        deliveryAmount: round(deliveryOffer - deliveryCharge),
        complaint: false,
        complaintReason: null,
        refundType: null,
        refundAmount: null,
        discountAmount: round(
          Math.abs(money(row["Offer Amount"])) + Math.abs(money(row["Delivery Coupon"])),
        ),
        merchantFundedDiscountAmount: round(Math.abs(money(row["Offer Amount"]))),
        merchantFundedVoucherAmount: round(Math.abs(money(row["Delivery Coupon"]))),
        commissionAmount: round(Math.abs(money(row["Jahez Commision"]))),
        paymentFeeAmount: round(
          Math.abs(money(row["Payment Fees"])) + Math.abs(money(row["Payment Fees Vat"])),
        ),
        estimatedEarningsAmount: round(money(row["Restaurant Amount"])),
        chargesTotal: round(charges),
        settlementAmount: round(money(row["Restaurant Amount"])),
        rawData: rawRecord(row),
      };
    }),
  );
  const businessDate = oneBusinessDate(orders, []);
  return {
    platform: "jahez",
    sourceKind: "jahez_orders",
    businessDate,
    orders,
    adjustments: [],
    summary: summarize(orders, []),
  };
}

function parseJahezAdjustments(matrix: Matrix): ParsedOperationImport {
  const { records } = headerTable(matrix, [
    "#",
    "Order #",
    "Transaction Type",
    "Creation Date",
    "Amount",
  ]);
  const adjustments = records.map((row): OperationAdjustment => {
    const orderId = clean(row["Order #"]);
    const transactionType = clean(row["Transaction Type"]).toLowerCase();
    if (!orderId) throw new Error("يوجد تعويض جاهز بدون Order #.");
    if (transactionType !== "debit" && transactionType !== "credit")
      throw new Error(`نوع حركة جاهز غير مدعوم: ${transactionType}`);
    const businessDate = isoDate(row["Creation Date"]);
    const amountValue = Math.abs(money(row["Amount"]));
    const reason = clean(row["Reason"]) || null;
    const fingerprint = createHash("sha256")
      .update(
        [orderId, transactionType, businessDate, amountValue.toFixed(2), reason ?? ""].join("|"),
      )
      .digest("hex");
    return {
      fingerprint,
      orderId,
      businessDate,
      branchName: clean(row["Branch"]) || null,
      transactionType,
      reason,
      amount: round(amountValue),
      comment: clean(row["Comments"]) || null,
      rawData: rawRecord(row),
    };
  });
  const fingerprints = new Set(adjustments.map((row) => row.fingerprint));
  if (fingerprints.size !== adjustments.length) throw new Error("يوجد تعويض مكرر داخل ملف جاهز.");
  const businessDate = oneBusinessDate([], adjustments);
  return {
    platform: "jahez",
    sourceKind: "jahez_adjustments",
    businessDate,
    orders: [],
    adjustments,
    summary: summarize([], adjustments),
  };
}

export async function parseOperationFile(
  file: File,
  sourceKind: string,
): Promise<ParsedOperationImport> {
  const matrix = await readMatrix(file);
  if (sourceKind === "hungerstation_orders") return parseHungerstation(matrix);
  if (sourceKind === "keeta_orders") return parseKeeta(matrix);
  if (sourceKind === "jahez_orders") return parseJahezOrders(matrix);
  if (sourceKind === "jahez_adjustments") return parseJahezAdjustments(matrix);
  throw new Error("نوع ملف العمليات غير مدعوم.");
}
