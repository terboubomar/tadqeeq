import { parseAmount, parseDate, roundMoney } from "../analysis/parse";

/**
 * Readers for the HungerStation partner-portal exports used by the ads ROI page:
 * the ads report (one row per branch per day, several campaigns packed into one
 * cell with ";") and the optional orders report (one row per order).
 * Both work on rows already read from CSV/Excel as header → text records.
 */

export type HsReportKind = "ads" | "orders" | "outlet_summary";

export type ReportRow = Record<string, unknown>;

const ADS_COLUMNS = ["Restaurant ID", "Outlet name", "Campaign ID", "Clicks", "Total Orders", "Total GMV", "Spent Budget"];
const ORDER_COLUMNS = ["Order ID", "Store ID", "Order status", "Subtotal", "Commission", "Operational Charges"];
const SUMMARY_COLUMNS = ["Restaurant ID", "Outlet name", "Successful Orders", "Gross Sales"];

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function hasAll(headers: Set<string>, required: string[]): boolean {
  return required.every((column) => headers.has(normalizeHeader(column)));
}

/** Which HungerStation export this is, from its header row; null when it is none of them. */
export function detectHsReportKind(headers: string[]): HsReportKind | null {
  const set = new Set(headers.map(normalizeHeader));
  if (hasAll(set, ADS_COLUMNS)) return "ads";
  if (hasAll(set, ORDER_COLUMNS)) return "orders";
  if (hasAll(set, SUMMARY_COLUMNS)) return "outlet_summary";
  return null;
}

export function missingColumns(kind: "ads" | "orders", headers: string[]): string[] {
  const set = new Set(headers.map(normalizeHeader));
  return (kind === "ads" ? ADS_COLUMNS : ORDER_COLUMNS).filter((column) => !set.has(normalizeHeader(column)));
}

function cell(row: ReportRow, column: string): unknown {
  if (column in row) return row[column];
  const wanted = normalizeHeader(column);
  for (const key of Object.keys(row)) {
    if (normalizeHeader(key) === wanted) return row[key];
  }
  return undefined;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function reportDate(value: unknown, rowNumber: number): string {
  if (value instanceof Date) return parseDate(value, { order: "ISO" }, { row: rowNumber, column: "Date" });
  const raw = text(value);
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return parseDate(iso ? iso[1] : raw, { order: "DMY" }, { row: rowNumber, column: "Date" });
}

/** One campaign on one day, after splitting the packed cells. */
export interface AdsCampaignDay {
  date: string;
  restaurantId: string;
  outletName: string;
  campaignId: string;
  clicks: number;
  /** Null when the report gave one order count for several campaigns. */
  orders: number | null;
  gmv: number;
  spent: number;
  platformRoas: number | null;
}

export type AdsReportNoteKind = "orders_not_split" | "orders_missing";

export interface AdsReportNote {
  kind: AdsReportNoteKind;
  date: string;
  restaurantId: string;
  outletName: string;
}

export interface AdsBranchDay {
  date: string;
  restaurantId: string;
  outletName: string;
  /** Total orders the report gives for the branch (also when not split per campaign). */
  orders: number;
}

export interface ParsedAdsReport {
  campaigns: AdsCampaignDay[];
  branchDays: AdsBranchDay[];
  notes: AdsReportNote[];
  dateFrom: string;
  dateTo: string;
  /** Rows whose values had to be split from one cell into several campaigns. */
  packedRows: number;
}

function parts(value: unknown): string[] {
  const raw = text(value);
  if (!raw) return [];
  return raw.split(";").map((part) => part.trim());
}

function amountOrZero(value: string | undefined, rowNumber: number, column: string): number {
  if (value === undefined || value === "") return 0;
  return parseAmount(value, { row: rowNumber, column });
}

export function parseHsAdsReport(rows: ReportRow[]): ParsedAdsReport {
  const campaigns: AdsCampaignDay[] = [];
  const branchDays: AdsBranchDay[] = [];
  const notes: AdsReportNote[] = [];
  let packedRows = 0;
  let dateFrom = "";
  let dateTo = "";

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const ids = parts(cell(row, "Campaign ID")).filter(Boolean);
    if (ids.length === 0) return;

    const date = reportDate(cell(row, "Date"), rowNumber);
    const restaurantId = text(cell(row, "Restaurant ID"));
    const outletName = text(cell(row, "Outlet name"));
    const base = { date, restaurantId, outletName };
    if (!dateFrom || date < dateFrom) dateFrom = date;
    if (!dateTo || date > dateTo) dateTo = date;
    if (ids.length > 1) packedRows += 1;

    const clicks = parts(cell(row, "Clicks"));
    const orders = parts(cell(row, "Total Orders"));
    const gmv = parts(cell(row, "Total GMV"));
    const spent = parts(cell(row, "Spent Budget"));
    const roas = parts(cell(row, "ROAS"));

    // Clicks, GMV and spend must line up with the campaigns; otherwise the row cannot be split safely.
    for (const [column, values] of [["Clicks", clicks], ["Total GMV", gmv], ["Spent Budget", spent]] as const) {
      if (values.length > 1 && values.length !== ids.length) {
        throw new Error(
          `تعذّر فصل الحملات في السطر ${rowNumber} (${outletName}): عمود ${column} فيه ${values.length} قيم و ${ids.length} حملات.`,
        );
      }
    }

    const ordersSplit = orders.length === ids.length;
    const branchOrders = orders.reduce((sum, value) => sum + amountOrZero(value, rowNumber, "Total Orders"), 0);
    if (orders.length === 0) notes.push({ kind: "orders_missing", ...base });
    else if (!ordersSplit) notes.push({ kind: "orders_not_split", ...base });
    branchDays.push({ ...base, orders: branchOrders });

    ids.forEach((campaignId, i) => {
      const pick = (values: string[]) => (values.length === ids.length ? values[i] : ids.length === 1 ? values[0] : undefined);
      const roasValue = pick(roas);
      campaigns.push({
        ...base,
        campaignId,
        clicks: amountOrZero(pick(clicks), rowNumber, "Clicks"),
        orders: ordersSplit ? amountOrZero(orders[i], rowNumber, "Total Orders") : orders.length === 0 ? 0 : null,
        gmv: roundMoney(amountOrZero(pick(gmv), rowNumber, "Total GMV")),
        spent: roundMoney(amountOrZero(pick(spent), rowNumber, "Spent Budget")),
        platformRoas: roasValue ? parseAmount(roasValue, { row: rowNumber, column: "ROAS" }) : null,
      });
    });
  });

  if (campaigns.length === 0) throw new Error("لا توجد حملات في تقرير الإعلانات.");
  return { campaigns, branchDays, notes, dateFrom, dateTo, packedRows };
}

/** Per-store totals from the orders report: what each delivered order really cost. */
export interface StoreOrderStats {
  storeId: string;
  outletName: string;
  orders: number;
  subtotal: number;
  commission: number;
  operationalCharges: number;
  restaurantDiscounts: number;
}

export interface ParsedOrdersReport {
  stores: StoreOrderStats[];
  dateFrom: string;
  dateTo: string;
  cancelledOrders: number;
}

export function parseHsOrdersReport(rows: ReportRow[]): ParsedOrdersReport {
  const stores = new Map<string, StoreOrderStats>();
  let cancelledOrders = 0;
  let dateFrom = "";
  let dateTo = "";

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const orderId = text(cell(row, "Order ID"));
    if (!orderId) return;
    const status = text(cell(row, "Order status")).toLowerCase();
    if (status !== "delivered") {
      if (status.includes("cancel")) cancelledOrders += 1;
      return;
    }
    const received = text(cell(row, "Order received at"));
    if (received) {
      const date = reportDate(received, rowNumber);
      if (!dateFrom || date < dateFrom) dateFrom = date;
      if (!dateTo || date > dateTo) dateTo = date;
    }
    const storeId = text(cell(row, "Store ID"));
    const money = (column: string) => parseAmount(text(cell(row, column)), { row: rowNumber, column, optional: true });
    const current = stores.get(storeId) ?? {
      storeId,
      outletName: text(cell(row, "Restaurant name")),
      orders: 0,
      subtotal: 0,
      commission: 0,
      operationalCharges: 0,
      restaurantDiscounts: 0,
    };
    current.orders += 1;
    current.subtotal = roundMoney(current.subtotal + money("Subtotal"));
    current.commission = roundMoney(current.commission + money("Commission"));
    current.operationalCharges = roundMoney(current.operationalCharges + money("Operational Charges"));
    current.restaurantDiscounts = roundMoney(
      current.restaurantDiscounts + money("Discount Funded by you") + money("Voucher Funded by you"),
    );
    stores.set(storeId, current);
  });

  if (stores.size === 0) throw new Error("لا توجد طلبات مكتملة في تقرير الطلبات.");
  return { stores: [...stores.values()], dateFrom, dateTo, cancelledOrders };
}
