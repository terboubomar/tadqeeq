import { createHash } from "node:crypto";

import { requireWorkspacePermission } from "../server-auth.server";
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_LABEL } from "../upload-validation";
import { forecastFromCompleteMonthToDate } from "./forecast";
import { parseOperationFile } from "./parser";
import type {
  OperationImportHistoryItem,
  OperationImportResult,
  OperationImportSummary,
  OperationMonthOverview,
  OperationPlatform,
  OperationPlatformMonth,
  OperationSourceKind,
} from "./types";

// New Operations tables are added by migration 0049; generated Supabase types intentionally lag migrations.
type LooseClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
};

interface ImportRow {
  id: string;
  source_kind: OperationSourceKind;
  platform: OperationPlatform;
  business_date: string;
  original_name: string;
  row_count: number;
  summary: OperationImportSummary;
  created_at: string;
}

const SOURCE_KINDS = new Set<OperationSourceKind>([
  "hungerstation_orders",
  "keeta_orders",
  "jahez_orders",
  "jahez_adjustments",
]);

const TABLE_MISSING = "ميزة العمليات اليومية تحتاج تحديث قاعدة البيانات (migration 0049).";

function operationError(error: { code?: string; message: string }): Error {
  if (
    error.code === "42P01" ||
    /operation_(imports|orders|adjustments)|import_operation_snapshot/i.test(error.message)
  ) {
    if (/does not exist|schema cache|Could not find/i.test(error.message))
      return new Error(TABLE_MISSING);
  }
  return new Error(error.message);
}

function readFile(form: FormData): File {
  const value = form.get("file");
  if (!value || typeof value === "string") throw new Error("اختر ملف العمليات أولاً.");
  if (value.size === 0) throw new Error("ملف العمليات فارغ.");
  if (value.size > MAX_UPLOAD_SIZE_BYTES)
    throw new Error(`حجم الملف يتجاوز ${MAX_UPLOAD_SIZE_LABEL}.`);
  const extension = value.name.toLowerCase().slice(value.name.lastIndexOf("."));
  if (![".csv", ".xlsx", ".xls"].includes(extension))
    throw new Error("صيغة ملف العمليات غير مدعومة.");
  return value;
}

function readSourceKind(form: FormData): OperationSourceKind {
  const value = form.get("sourceKind");
  if (typeof value !== "string" || !SOURCE_KINDS.has(value as OperationSourceKind)) {
    throw new Error("نوع ملف العمليات غير صالح.");
  }
  return value as OperationSourceKind;
}

async function matchedJahezOrders(
  client: LooseClient,
  workspaceId: string,
  orderIds: string[],
): Promise<Set<string>> {
  const matched = new Set<string>();
  for (let index = 0; index < orderIds.length; index += 300) {
    const batch = orderIds.slice(index, index + 300);
    const { data, error } = await client
      .from("operation_orders")
      .select("order_id")
      .eq("workspace_id", workspaceId)
      .eq("platform", "jahez")
      .in("order_id", batch);
    if (error) throw operationError(error);
    for (const row of (data ?? []) as Array<{ order_id: string }>) matched.add(row.order_id);
  }
  return matched;
}

export async function importOperationFileOnServer(form: FormData): Promise<OperationImportResult> {
  const { client, workspaceId } = await requireWorkspacePermission("imports.create");
  const db = client as unknown as LooseClient;
  const file = readFile(form);
  const sourceKind = readSourceKind(form);
  const parsed = await parseOperationFile(file, sourceKind);
  const sha256 = createHash("sha256")
    .update(Buffer.from(await file.arrayBuffer()))
    .digest("hex");

  if (parsed.adjustments.length) {
    const matched = await matchedJahezOrders(
      db,
      workspaceId,
      parsed.adjustments.map((row) => row.orderId),
    );
    parsed.summary.matchedAdjustments = parsed.adjustments.filter((row) =>
      matched.has(row.orderId),
    ).length;
    parsed.summary.unmatchedAdjustments =
      parsed.adjustments.length - parsed.summary.matchedAdjustments;
  }

  const { data, error } = await db.rpc("import_operation_snapshot", {
    p_source_kind: parsed.sourceKind,
    p_platform: parsed.platform,
    p_business_date: parsed.businessDate,
    p_original_name: file.name.slice(0, 255),
    p_sha256: sha256,
    p_summary: parsed.summary,
    p_orders: parsed.orders,
    p_adjustments: parsed.adjustments,
  });
  if (error) throw operationError(error);
  const result = data as { status: "saved" | "duplicate"; import_id: string; rows: number };
  return {
    status: result.status,
    importId: result.import_id,
    businessDate: parsed.businessDate,
    sourceKind: parsed.sourceKind,
    rows: result.rows,
    matchedAdjustments: parsed.summary.matchedAdjustments,
    unmatchedAdjustments: parsed.summary.unmatchedAdjustments,
  };
}

function monthBounds(month: string): { start: string; end: string; days: number } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("الشهر غير صالح.");
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12)
    throw new Error("الشهر غير صالح.");
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(days).padStart(2, "0")}`, days };
}

const zeroPlatform = (platform: OperationPlatform): OperationPlatformMonth => ({
  platform,
  coveredDays: 0,
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
  chargesToDate: 0,
  settlementToDate: 0,
  forecastCharges: null,
  forecastSettlement: null,
  forecastMissingDays: [],
});

const rounded = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function getOperationMonthOnServer(month: string): Promise<OperationMonthOverview> {
  const { client, workspaceId } = await requireWorkspacePermission("financials.read");
  const db = client as unknown as LooseClient;
  const bounds = monthBounds(month);
  const { data, error } = await db
    .from("operation_imports")
    .select("id,source_kind,platform,business_date,original_name,row_count,summary,created_at")
    .eq("workspace_id", workspaceId)
    .gte("business_date", bounds.start)
    .lte("business_date", bounds.end)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw operationError(error);
  const imports = (data ?? []) as ImportRow[];

  // The newest upload owns one source/day. Older uploads remain visible in history but never double-count totals.
  const latest = new Map<string, ImportRow>();
  for (const item of imports) {
    const key = `${item.source_kind}:${item.business_date}`;
    if (!latest.has(key)) latest.set(key, item);
  }
  const platforms = new Map<OperationPlatform, OperationPlatformMonth>([
    ["hungerstation", zeroPlatform("hungerstation")],
    ["keeta", zeroPlatform("keeta")],
    ["jahez", zeroPlatform("jahez")],
  ]);
  const covered = new Map<OperationPlatform, Set<string>>([
    ["hungerstation", new Set()],
    ["keeta", new Set()],
    ["jahez", new Set()],
  ]);
  for (const item of latest.values()) {
    const target = platforms.get(item.platform)!;
    const summary = item.summary;
    if (item.source_kind !== "jahez_adjustments") {
      covered.get(item.platform)!.add(item.business_date);
      target.orderCount += summary.orderCount;
      target.grossSales += summary.grossSales;
      target.deliveryAmount += summary.deliveryAmount;
      target.complaintCount += summary.complaintCount;
      target.refundCount += summary.refundCount;
      target.refundAmount += summary.refundAmount;
      target.discountAmount += summary.discountAmount ?? 0;
      target.merchantFundedDiscountAmount += summary.merchantFundedDiscountAmount ?? 0;
      target.merchantFundedVoucherAmount += summary.merchantFundedVoucherAmount ?? 0;
      target.commissionAmount += summary.commissionAmount ?? 0;
      target.paymentFeeAmount += summary.paymentFeeAmount ?? 0;
      target.estimatedEarningsAmount += summary.estimatedEarningsAmount ?? 0;
      target.cancellationCount += summary.cancellationCount;
      target.chargesToDate += summary.chargesTotal;
      target.settlementToDate += summary.settlementAmount;
    } else {
      target.refundCount += summary.matchedAdjustments + summary.unmatchedAdjustments;
      target.refundAmount += summary.adjustmentDebit;
      target.chargesToDate += summary.adjustmentDebit - summary.adjustmentCredit;
      target.settlementToDate += summary.adjustmentCredit - summary.adjustmentDebit;
    }
  }
  for (const target of platforms.values()) {
    target.coveredDays = covered.get(target.platform)!.size;
    for (const key of [
      "grossSales",
      "deliveryAmount",
      "refundAmount",
      "discountAmount",
      "merchantFundedDiscountAmount",
      "merchantFundedVoucherAmount",
      "commissionAmount",
      "paymentFeeAmount",
      "estimatedEarningsAmount",
      "chargesToDate",
      "settlementToDate",
    ] as const)
      target[key] = rounded(target[key]);
    const forecast = forecastFromCompleteMonthToDate({
      businessDates: covered.get(target.platform)!,
      daysInMonth: bounds.days,
      chargesToDate: target.chargesToDate,
      settlementToDate: target.settlementToDate,
    });
    target.forecastCharges = forecast.charges;
    target.forecastSettlement = forecast.settlement;
    target.forecastMissingDays = forecast.missingDays;
  }
  const history: OperationImportHistoryItem[] = imports.map((item) => ({
    id: item.id,
    sourceKind: item.source_kind,
    platform: item.platform,
    businessDate: item.business_date,
    originalName: item.original_name,
    rowCount: item.row_count,
    summary: item.summary,
    createdAt: item.created_at,
  }));
  return { month, daysInMonth: bounds.days, platforms: [...platforms.values()], imports: history };
}
