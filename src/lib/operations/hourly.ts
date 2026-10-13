import type { OperationPlatform } from "./types";

type RawValue = string | number | boolean | null | undefined;

/** The order-time column of each platform's operations file, in the order they are tried. */
export const ORDER_TIME_COLUMNS: Record<OperationPlatform, string[]> = {
  hungerstation: ["Order received at"],
  keeta: ["Order time", "Date"],
  jahez: ["Date"],
};

/**
 * The hour (0-23) an order was placed, read from the stored row of the platform's file, or null when the row has no
 * time. Handles "2026-10-06 00:03", "06/10/2026 11:57:25 PM", a bare "23:58", ISO text written from a spreadsheet
 * date, and spreadsheet serial numbers. Display only: it never changes an order's figures.
 */
export function orderHour(platform: OperationPlatform, raw: Record<string, RawValue> | null | undefined): number | null {
  if (!raw) return null;
  for (const column of ORDER_TIME_COLUMNS[platform]) {
    const hour = hourOf(raw[column]);
    if (hour !== null) return hour;
  }
  return null;
}

function hourOf(value: RawValue): number | null {
  if (typeof value === "number") {
    // A spreadsheet serial: the fraction is the time of day. A whole number is a date with no time.
    const fraction = value - Math.floor(value);
    if (!Number.isFinite(value) || fraction === 0) return null;
    return Math.min(23, Math.floor(fraction * 24 + 1e-9));
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  // ISO text written from a spreadsheet date keeps the file's wall-clock time.
  const iso = text.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):\d{2}/);
  if (iso) return Number(iso[1]);
  const time = text.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AaPp])\.?[Mm]\.?)?/);
  if (!time) return null;
  let hour = Number(time[1]);
  const meridiem = time[3]?.toLowerCase();
  if (meridiem === "p" && hour < 12) hour += 12;
  if (meridiem === "a" && hour === 12) hour = 0;
  return hour >= 0 && hour <= 23 ? hour : null;
}

/** Sunday first, matching the weekday of an ISO date in UTC. */
export function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).getUTCDay();
}

export interface HourlyCell {
  sales: number;
  orders: number;
}

export interface HourlyGrid {
  /** [weekday 0-6, Sunday first][hour 0-23] */
  cells: HourlyCell[][];
  /** Orders with sales whose file row has no readable time (not in the grid). */
  untimedOrders: number;
  untimedSales: number;
  /** How many of each weekday the month's uploaded days include, to read the grid as totals of that many days. */
  weekdayDays: number[];
}

export interface HourlyOrderRow {
  business_date: string;
  status: string | null;
  gross_sales: number | string;
  raw_data: Record<string, RawValue> | null;
}

/** HungerStation cancelled orders are not sales or orders in «نبض» (the parser stores them with zero sales). */
function countsAsOrder(platform: OperationPlatform, row: HourlyOrderRow): boolean {
  return !(platform === "hungerstation" && /cancel/i.test(row.status ?? ""));
}

export function buildHourlyGrid(platform: OperationPlatform, rows: HourlyOrderRow[]): HourlyGrid {
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ sales: 0, orders: 0 })));
  const days = Array.from({ length: 7 }, () => new Set<string>());
  let untimedOrders = 0;
  let untimedSales = 0;
  for (const row of rows) {
    if (!countsAsOrder(platform, row)) continue;
    const sales = Number(row.gross_sales) || 0;
    const date = row.business_date.slice(0, 10);
    const weekday = weekdayOf(date);
    days[weekday]!.add(date);
    const hour = orderHour(platform, row.raw_data);
    if (hour === null) {
      untimedOrders += 1;
      untimedSales += sales;
      continue;
    }
    const cell = cells[weekday]![hour]!;
    cell.sales += sales;
    cell.orders += 1;
  }
  for (const day of cells) for (const cell of day) cell.sales = Math.round(cell.sales * 100) / 100;
  return {
    cells,
    untimedOrders,
    untimedSales: Math.round(untimedSales * 100) / 100,
    weekdayDays: days.map((set) => set.size),
  };
}
