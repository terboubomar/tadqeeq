import * as XLSX from "xlsx";

import type {
  AnalysisResult,
  BranchRow,
  CheckRow,
  DailyRow,
  InvoiceFigures,
  Summary,
} from "./types";

function num(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = text(value);
  const match = raw.match(/\d{4}[-/]\d{2}[-/]\d{2}/);
  if (match) return match[0].replace(/\//g, "-");
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 20000 && asNumber < 80000) {
    const parsed = XLSX.SSF.parse_date_code(asNumber);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  return raw.slice(0, 10);
}

/** Find a column whose header contains all the given words. */
function pick(row: Record<string, unknown>, ...words: string[]): unknown {
  const keys = Object.keys(row);
  const hit = keys.find((k) => {
    const lower = k.toLowerCase();
    return words.every((w) => lower.includes(w.toLowerCase()));
  });
  return hit ? row[hit] : null;
}

function emptyBranch(branch: string): BranchRow {
  return {
    branch,
    branchId: "",
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

export interface KeetaOptions {
  invoice?: InvoiceFigures;
  label?: string;
}

export function analyzeKeeta(file: ArrayBuffer, options: KeetaOptions = {}): AnalysisResult {
  const wb = XLSX.read(file, { type: "array" });

  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().includes("invoice details")) ??
    wb.SheetNames.find((n) => n.toLowerCase().includes("invoice"));
  if (!sheetName) {
    throw new Error("لم يتم العثور على ورقة تفاصيل الفواتير في ملف كيتا.");
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]!, {
    defval: null,
  });

  const branches = new Map<string, BranchRow>();
  const dailyMap = new Map<string, DailyRow>();
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  const statusCounts: Record<string, number> = {};

  for (const row of rows) {
    const store = text(pick(row, "store")) || text(pick(row, "brand")) || "غير محدد";
    const amount = num(pick(row, "invoice", "amount"));
    const payable = num(pick(row, "payable"));
    if (!amount && !payable) continue;

    const status = text(pick(row, "settlement", "status")) || "غير محدد";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;

    let branch = branches.get(store);
    if (!branch) {
      branch = emptyBranch(store);
      branches.set(store, branch);
    }
    branch.orders += 1;
    branch.grossSales += amount;
    branch.netSales += payable;
    branch.commission += amount - payable;

    const date = normalizeDate(pick(row, "transaction", "date") ?? pick(row, "date"));
    if (date) {
      let day = dailyMap.get(date);
      if (!day) {
        day = { date, orders: 0, grossSales: 0, netSales: 0, commission: 0, ccSuccess: 0 };
        dailyMap.set(date, day);
      }
      day.orders += 1;
      day.grossSales += amount;
      day.netSales += payable;
      day.commission += amount - payable;
      if (!periodStart || date < periodStart) periodStart = date;
      if (!periodEnd || date > periodEnd) periodEnd = date;
    }
  }

  const branchList = [...branches.values()];
  for (const branch of branchList) {
    branch.commissionPct = branch.grossSales > 0 ? branch.commission / branch.grossSales : 0;
    branch.totalCharges = branch.commission;
  }
  branchList.sort((a, b) => b.grossSales - a.grossSales);

  const sum = (fn: (r: BranchRow) => number) => branchList.reduce((t, r) => t + fn(r), 0);

  const summary: Summary = {
    platform: "keeta",
    orders: sum((r) => r.orders),
    grossSales: sum((r) => r.grossSales),
    netSales: sum((r) => r.netSales),
    commission: sum((r) => r.commission),
    commissionPct: 0,
    ccSuccess: 0,
    ccRejected: 0,
    walletAmount: 0,
    riderWallet: 0,
    rdfCampaigns: 0,
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
    bankRate: 0,
    bankRateSource: "manual",
    bankFeeSuccess: 0,
    bankFeeRefunded: 0,
    totalCharges: sum((r) => r.totalCharges),
    branchCount: branchList.length,
    statusCounts,
    periodStart,
    periodEnd,
  };
  summary.commissionPct = summary.grossSales > 0 ? summary.commission / summary.grossSales : 0;

  const invoice = options.invoice ?? { lines: [] };

  const checks: CheckRow[] = [
    {
      label: "إجمالي العمولات والرسوم",
      computed: summary.commission,
      invoiced: invoice.totalIncVat ?? invoice.totalExVat ?? 0,
      hint: "قيمة الفواتير ناقص المستحق للتاجر",
    },
    {
      label: "صافي المستحق",
      computed: summary.netSales,
      invoiced: invoice.netDue ?? 0,
      hint: "مجموع المستحق للتاجر من كشف الفواتير",
    },
  ];

  const label =
    options.label ??
    (periodStart && periodEnd ? `كيتا · ${periodStart} — ${periodEnd}` : "كيتا");

  return {
    platform: "keeta",
    label,
    summary,
    branches: branchList,
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    invoice,
    checks,
  };
}
