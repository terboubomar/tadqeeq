import { createHash } from "node:crypto";

import { requireWorkspacePermission } from "../server-auth.server";
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_LABEL } from "../upload-validation";
import { mapStoredOperationOrder, type StoredOperationOrder } from "./details";
import { isIncompleteDay } from "./completeness";
import { forecastFromCompleteMonthToDate } from "./forecast";
import { buildHourlyGrid, ORDER_TIME_COLUMNS, type HourlyGrid, type HourlyOrderRow } from "./hourly";
import { parseOperationFile } from "./parser";
import type {
  OperationAdjustmentDetail,
  OperationBranchSummary,
  OperationDay,
  OperationOrderFilter,
  OperationImportDetail,
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
  superseded_at: string | null;
}

const SOURCE_KINDS = new Set<OperationSourceKind>([
  "hungerstation_orders",
  "keeta_orders",
  "jahez_orders",
  "jahez_adjustments",
]);

const TABLE_MISSING = "ميزة «نبض» (المتابعة اليومية) تحتاج تحديث قاعدة البيانات (migration 0049).";
const CURRENT_MISSING = "«نبض» (المتابعة اليومية) يحتاج تحديث قاعدة البيانات (migration 0056).";

function operationError(error: { code?: string; message: string }): Error {
  if (/superseded_at/.test(error.message) && /does not exist|schema cache|Could not find/i.test(error.message)) {
    return new Error(CURRENT_MISSING);
  }
  if (
    error.code === "42P01" ||
    /operation_(imports|orders|adjustments)|import_operation_snapshot|delete_operation_import/i.test(
      error.message,
    )
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
    orderCount: parsed.summary.orderCount,
    grossSales: parsed.summary.grossSales,
    unsettledOrderCount: parsed.summary.unsettledOrderCount ?? 0,
    incomplete: isIncompleteDay(parsed.summary),
    matchedAdjustments: parsed.summary.matchedAdjustments,
    unmatchedAdjustments: parsed.summary.unmatchedAdjustments,
  };
}

export async function deleteOperationImportOnServer(importId: string): Promise<void> {
  const { client } = await requireWorkspacePermission("imports.create");
  const db = client as unknown as LooseClient;
  const { error } = await db.rpc("delete_operation_import", { p_import_id: importId });
  if (error) throw operationError(error);
}

/** Search text safe for a PostgREST `or` filter: no separators, wildcards or quotes. */
function searchTerm(value: string | undefined): string {
  return (value ?? "").replace(/[,()%*"'\\:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export async function getOperationImportDetailOnServer(input: {
  importId: string;
  platform: OperationPlatform;
  page: number;
  pageSize: number;
  search?: string;
  filter?: OperationOrderFilter;
  branchId?: string;
  branchName?: string;
}): Promise<OperationImportDetail> {
  const { client, workspaceId } = await requireWorkspacePermission("financials.read");
  const db = client as unknown as LooseClient;
  const { data: importData, error: importError } = await db
    .from("operation_imports")
    .select("id,source_kind,platform,business_date,original_name,row_count,summary,created_at,superseded_at")
    .eq("workspace_id", workspaceId)
    .eq("id", input.importId)
    .eq("platform", input.platform)
    .maybeSingle();
  if (importError) throw operationError(importError);
  if (!importData) throw new Error("ملف العمليات غير موجود أو لا تملك صلاحية عرضه.");
  const item = importData as ImportRow;
  const from = (input.page - 1) * input.pageSize;
  const to = from + input.pageSize - 1;
  const importItem: OperationImportHistoryItem = {
    id: item.id,
    sourceKind: item.source_kind,
    platform: item.platform,
    businessDate: item.business_date,
    originalName: item.original_name,
    rowCount: item.row_count,
    summary: item.summary,
    createdAt: item.created_at,
    current: !item.superseded_at,
  };

  if (item.source_kind === "jahez_adjustments") {
    const { data, error, count } = await db
      .from("operation_adjustments")
      .select(
        "fingerprint,order_id,business_date,branch_name,transaction_type,reason,amount,comment",
        { count: "exact" },
      )
      .eq("workspace_id", workspaceId)
      .eq("source_import_id", input.importId)
      .order("order_id", { ascending: true })
      .range(from, to);
    if (error) throw operationError(error);
    const adjustments: OperationAdjustmentDetail[] = (data ?? []).map(
      (row: Record<string, unknown>) => ({
        fingerprint: String(row["fingerprint"]),
        orderId: String(row["order_id"]),
        businessDate: String(row["business_date"]),
        branchName: row["branch_name"] ? String(row["branch_name"]) : null,
        transactionType: row["transaction_type"] === "credit" ? "credit" : "debit",
        reason: row["reason"] ? String(row["reason"]) : null,
        amount: Number(row["amount"]) || 0,
        comment: row["comment"] ? String(row["comment"]) : null,
      }),
    );
    return {
      importItem,
      orders: [],
      adjustments,
      totals: null,
      totalRows: count ?? adjustments.length,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  const term = searchTerm(input.search);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST query builder (generated types lag migrations)
  const filtered = (query: any) => {
    let next = query
      .eq("workspace_id", workspaceId)
      .eq("source_import_id", input.importId)
      .eq("platform", input.platform);
    if (term) next = next.or(`order_id.ilike.*${term}*,branch_name.ilike.*${term}*`);
    if (input.branchId) next = next.eq("branch_id", input.branchId);
    else if (input.branchName) next = next.eq("branch_name", input.branchName);
    if (input.filter === "cancelled") next = next.ilike("status", "%cancel%");
    if (input.filter === "complaints") next = next.eq("complaint", true);
    if (input.filter === "refunds") next = next.or("refund_amount.neq.0,refund_type.not.is.null");
    return next;
  };

  const { data, error, count } = await filtered(
    db
      .from("operation_orders")
      .select(
        "order_id,business_date,branch_id,branch_name,status,delivery_mode,gross_sales,delivery_amount,complaint,complaint_reason,refund_amount,charges_total,settlement_amount,raw_data",
        { count: "exact" },
      ),
  )
    .order("order_id", { ascending: true })
    .range(from, to);
  if (error) throw operationError(error);

  // Totals of every matching row, not just this page (a day's file is a few thousand rows at most).
  const totals = { grossSales: 0, chargesTotal: 0, settlementAmount: 0 };
  const matching = count ?? 0;
  for (let start = 0; start < matching; start += 1000) {
    const { data: rows, error: totalsError } = await filtered(
      db.from("operation_orders").select("order_id,gross_sales,charges_total,settlement_amount"),
    )
      .order("order_id", { ascending: true })
      .range(start, start + 999);
    if (totalsError) throw operationError(totalsError);
    for (const row of (rows ?? []) as Array<{ gross_sales: number | string; charges_total: number | string; settlement_amount: number | string }>) {
      totals.grossSales += Number(row.gross_sales) || 0;
      totals.chargesTotal += Math.abs(Number(row.charges_total) || 0);
      totals.settlementAmount += Number(row.settlement_amount) || 0;
    }
  }
  const orders = (data ?? []).map((row: StoredOperationOrder) =>
    mapStoredOperationOrder(input.platform, row),
  );
  return {
    importItem,
    orders,
    adjustments: [],
    totals: {
      grossSales: rounded(totals.grossSales),
      chargesTotal: rounded(totals.chargesTotal),
      settlementAmount: rounded(totals.settlementAmount),
    },
    totalRows: count ?? orders.length,
    page: input.page,
    pageSize: input.pageSize,
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
  cancelledEarningsAmount: 0,
  chargesToDate: 0,
  settlementToDate: 0,
  forecastCharges: null,
  forecastSettlement: null,
  forecastMissingDays: [],
  days: [],
  branches: [],
  branchesComplete: true,
});

/** Adds one upload's branch totals into the month's, keyed like the uploads. */
function addBranches(target: Map<string, OperationBranchSummary>, branches: OperationBranchSummary[]) {
  for (const branch of branches) {
    const current = target.get(branch.key);
    if (!current) {
      target.set(branch.key, { ...branch });
      continue;
    }
    current.branchName ??= branch.branchName;
    for (const key of [
      "orderCount",
      "grossSales",
      "chargesTotal",
      "commissionAmount",
      "settlementAmount",
      "cancellationCount",
      "complaintCount",
      "refundCount",
    ] as const) {
      current[key] += branch[key];
    }
  }
}

const rounded = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function getOperationMonthOnServer(month: string): Promise<OperationMonthOverview> {
  const { client, workspaceId } = await requireWorkspacePermission("financials.read");
  const db = client as unknown as LooseClient;
  const bounds = monthBounds(month);
  const { data, error } = await db
    .from("operation_imports")
    .select("id,source_kind,platform,business_date,original_name,row_count,summary,created_at,superseded_at")
    .eq("workspace_id", workspaceId)
    .gte("business_date", bounds.start)
    .lte("business_date", bounds.end)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw operationError(error);
  const imports = (data ?? []) as ImportRow[];

  // Only the upload that owns a source/day's rows counts (migration 0056). Superseded uploads stay in the history,
  // and a day whose current upload was deleted counts nothing rather than an older summary without rows.
  const latest = new Map<string, ImportRow>();
  for (const item of imports) {
    if (item.superseded_at) continue;
    const key = `${item.source_kind}:${item.business_date}`;
    if (!latest.has(key)) latest.set(key, item);
  }
  const platforms = new Map<OperationPlatform, OperationPlatformMonth>([
    ["hungerstation", zeroPlatform("hungerstation")],
    ["keeta", zeroPlatform("keeta")],
    ["jahez", zeroPlatform("jahez")],
  ]);
  const monthBranches = new Map<OperationPlatform, Map<string, OperationBranchSummary>>([
    ["hungerstation", new Map()],
    ["keeta", new Map()],
    ["jahez", new Map()],
  ]);
  const days = new Map<OperationPlatform, Map<string, OperationDay>>([
    ["hungerstation", new Map()],
    ["keeta", new Map()],
    ["jahez", new Map()],
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
      target.cancelledEarningsAmount += summary.cancelledEarningsAmount ?? 0;
      target.chargesToDate += summary.chargesTotal;
      target.settlementToDate += summary.settlementAmount;
      days.get(item.platform)!.set(item.business_date, {
        date: item.business_date,
        incomplete: isIncompleteDay(summary),
        unsettledOrderCount: summary.unsettledOrderCount ?? 0,
        orderCount: summary.orderCount,
        grossSales: summary.grossSales,
        chargesTotal: Math.abs(summary.chargesTotal),
        settlementAmount: summary.settlementAmount,
      });
      if (summary.branches) addBranches(monthBranches.get(item.platform)!, summary.branches);
      else if (summary.orderCount > 0) target.branchesComplete = false;
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
      "cancelledEarningsAmount",
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
    target.days = [...days.get(target.platform)!.values()].sort((a, b) => a.date.localeCompare(b.date));
    target.branches = [...monthBranches.get(target.platform)!.values()]
      .map((branch) => ({
        ...branch,
        grossSales: rounded(branch.grossSales),
        chargesTotal: rounded(branch.chargesTotal),
        commissionAmount: rounded(branch.commissionAmount),
        settlementAmount: rounded(branch.settlementAmount),
      }))
      .sort((a, b) => b.grossSales - a.grossSales);
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
    current: !item.superseded_at,
  }));
  return { month, daysInMonth: bounds.days, platforms: [...platforms.values()], imports: history };
}

/**
 * Sales by date and hour for one platform between two dates (optionally one branch), from the orders of each day's
 * current upload. Each order's hour comes from the time column kept in its stored file row; nothing is recalculated.
 */
export async function getOperationHourlyOnServer(input: {
  platform: OperationPlatform;
  from: string;
  to: string;
  branchId?: string;
  branchName?: string;
}): Promise<HourlyGrid> {
  const { client, workspaceId } = await requireWorkspacePermission("financials.read");
  const db = client as unknown as LooseClient;
  if (input.from > input.to) throw new Error("تاريخ البداية بعد تاريخ النهاية.");
  if ((Date.parse(`${input.to}T00:00:00Z`) - Date.parse(`${input.from}T00:00:00Z`)) / 864e5 > 92) throw new Error("اختر مدة لا تزيد على ثلاثة أشهر.");
  const bounds = { start: input.from, end: input.to };
  const { data: imports, error: importsError } = await db
    .from("operation_imports")
    .select("id,business_date,superseded_at")
    .eq("workspace_id", workspaceId)
    .eq("platform", input.platform)
    .eq("source_kind", `${input.platform}_orders`)
    .gte("business_date", bounds.start)
    .lte("business_date", bounds.end)
    .order("created_at", { ascending: false })
    .limit(500);
  if (importsError) throw operationError(importsError);
  // The same rule as the month overview: each day's newest upload that is not superseded owns that day's orders.
  const byDay = new Map<string, string>();
  for (const item of (imports ?? []) as Array<{ id: string; business_date: string; superseded_at: string | null }>) {
    if (!item.superseded_at && !byDay.has(item.business_date)) byDay.set(item.business_date, item.id);
  }
  const importIds = [...byDay.values()];

  // Only the order-time fields of each stored row are read (t0, t1… for the platform's time columns), not the whole
  // row. If the database refuses that narrow read, the whole row is read instead.
  const timeColumns = ORDER_TIME_COLUMNS[input.platform];
  const narrowSelect = [
    "business_date,status,gross_sales",
    ...timeColumns.map((column, index) => `t${index}:raw_data->>"${column}"`),
  ].join(",");
  let narrow = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST query builder (generated types lag migrations)
  const scoped = (query: any, importId: string) => {
    let next = query.eq("workspace_id", workspaceId).eq("source_import_id", importId).eq("platform", input.platform);
    if (input.branchId) next = next.eq("branch_id", input.branchId);
    else if (input.branchName) next = next.eq("branch_name", input.branchName);
    return next.order("order_id", { ascending: true });
  };

  // One day's upload per request (the same read the day page uses), many days side by side.
  async function ordersOf(importId: string): Promise<HourlyOrderRow[]> {
    const rows: HourlyOrderRow[] = [];
    for (let start = 0; ; start += 1000) {
      let page: HourlyOrderRow[];
      if (narrow) {
        const { data, error } = await scoped(db.from("operation_orders").select(narrowSelect), importId).range(start, start + 999);
        const found = (data ?? []) as Array<Record<string, string | number | null>>;
        // A refused read, or one that brings back rows without any time, means the narrow read is not usable here.
        if (error || (found.length > 0 && found.every((row) => timeColumns.every((_, index) => row[`t${index}`] == null)))) {
          narrow = false;
          return ordersOf(importId);
        }
        page = found.map((row) => ({
          business_date: String(row["business_date"]),
          status: row["status"] === null || row["status"] === undefined ? null : String(row["status"]),
          gross_sales: row["gross_sales"] ?? 0,
          raw_data: Object.fromEntries(timeColumns.map((column, index) => [column, row[`t${index}`] ?? null])),
        }));
      } else {
        const { data, error } = await scoped(
          db.from("operation_orders").select("business_date,status,gross_sales,raw_data"),
          importId,
        ).range(start, start + 999);
        if (error) throw operationError(error);
        page = (data ?? []) as HourlyOrderRow[];
      }
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
  }
  const rows: HourlyOrderRow[] = [];
  for (let index = 0; index < importIds.length; index += 10) {
    const batch = await Promise.all(importIds.slice(index, index + 10).map(ordersOf));
    for (const dayRows of batch) rows.push(...dayRows);
  }
  return buildHourlyGrid(input.platform, rows);
}
