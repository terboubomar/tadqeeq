import * as XLSX from "xlsx";

import type { AdsRoiResult, CampaignAction, CampaignStatus, CostSource } from "./analysis";

/**
 * Excel export of an ads ROI analysis: right-to-left sheets, real numbers (not text) with
 * money, ratio and percent formats, so the owner can filter and sum them in Excel.
 */

export type AdsRoiExportScope = "full" | "campaigns" | "branches";

export interface AdsRoiExportMeta {
  sourceFileName: string | null;
  ordersFileName: string | null;
}

const STATUS: Record<CampaignStatus, string> = { loss: "تخسر", thin: "قريبة من التعادل", profit: "رابحة" };
const ACTION: Record<CampaignAction, string> = { stop: "أوقفها", lower_bid: "خفّض المزايدة", watch: "راقبها", keep: "استمر" };
const SOURCE: Record<CostSource, string> = {
  orders: "تقرير الطلبات (الفرع)",
  brand_orders: "تقرير الطلبات (متوسط العلامة)",
  settings: "افتراضات الحساب",
  default: "افتراضي 15%",
};

const MONEY = "#,##0.00";
const RATIO = "0.00";
const PERCENT = "0.0%";
const INTEGER = "#,##0";

type Cell = string | number | null;
interface Column {
  header: string;
  format?: string;
  width?: number;
}

function displayDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export function exportPeriodLabel(result: Pick<AdsRoiResult, "dateFrom" | "dateTo">): string {
  return result.dateFrom === result.dateTo
    ? displayDate(result.dateFrom)
    : `${displayDate(result.dateFrom)} – ${displayDate(result.dateTo)}`;
}

/** A sheet of a header row and data rows; number cells get the column's format. */
function tableSheet(columns: Column[], rows: Cell[][], intro: Cell[][] = []): XLSX.WorkSheet {
  const offset = intro.length > 0 ? intro.length + 1 : 0;
  const data: Cell[][] = [...intro, ...(intro.length > 0 ? [[]] : []), columns.map((c) => c.header), ...rows];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  rows.forEach((row, r) => {
    row.forEach((value, c) => {
      const format = columns[c]?.format;
      if (typeof value !== "number" || !format) return;
      const cell = sheet[XLSX.utils.encode_cell({ r: offset + 1 + r, c })] as XLSX.CellObject | undefined;
      if (cell) cell.z = format;
    });
  });
  sheet["!cols"] = columns.map((c) => ({ wch: c.width ?? Math.max(12, c.header.length + 4) }));
  if (rows.length > 0) {
    sheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: offset, c: 0 }, e: { r: offset + rows.length, c: columns.length - 1 } }),
    };
  }
  return sheet;
}

function campaignsSheet(result: AdsRoiResult): XLSX.WorkSheet {
  const columns: Column[] = [
    { header: "الفرع", width: 34 },
    { header: "رقم الحملة", width: 28 },
    { header: "النقرات", format: INTEGER },
    { header: "الطلبات", format: INTEGER },
    { header: "طلبات تقديرية", width: 14 },
    { header: "الإنفاق", format: MONEY },
    { header: "تكلفة النقرة", format: MONEY },
    { header: "المبيعات", format: MONEY },
    { header: "ROAS", format: RATIO },
    { header: "ROAS المنصة", format: RATIO },
    { header: "خط التعادل", format: RATIO },
    { header: "الربح بعد الإعلان", format: MONEY, width: 18 },
    { header: "الحالة", width: 18 },
    { header: "التوصية", width: 16 },
  ];
  const rows = result.campaigns.map((c) => [
    c.branchName,
    c.campaignId,
    c.clicks,
    c.orders,
    c.ordersEstimated ? "نعم" : "",
    c.spent,
    c.cpc,
    c.gmv,
    c.roas,
    c.platformRoas,
    c.breakEvenRoas,
    c.profit,
    STATUS[c.status],
    ACTION[c.action],
  ]);
  return tableSheet(columns, rows);
}

function branchesSheet(result: AdsRoiResult): XLSX.WorkSheet {
  const columns: Column[] = [
    { header: "الفرع", width: 34 },
    { header: "الحملات", format: INTEGER },
    { header: "النقرات", format: INTEGER },
    { header: "الطلبات", format: INTEGER },
    { header: "الإنفاق", format: MONEY },
    { header: "المبيعات", format: MONEY },
    { header: "تكلفة الطلب", format: MONEY },
    { header: "ROAS", format: RATIO },
    { header: "خط التعادل", format: RATIO },
    { header: "خصمك", format: PERCENT },
    { header: "العمولة", format: PERCENT },
    { header: "رسوم الدفع", format: PERCENT },
    { header: "عرض التوصيل", format: PERCENT },
    { header: "يبقى من كل ريال", format: PERCENT, width: 16 },
    { header: "الربح بعد الإعلان", format: MONEY, width: 18 },
    { header: "مصدر النسب", width: 30 },
  ];
  const rows = result.branches.map((b) => [
    b.branchName,
    b.campaigns,
    b.clicks,
    b.orders,
    b.spent,
    b.gmv,
    b.costPerOrder,
    b.roas,
    b.breakEvenRoas,
    b.costs.discount,
    b.costs.commission,
    b.costs.paymentFee,
    b.costs.deliveryOffer,
    b.costs.kept,
    b.profit,
    SOURCE[b.costSource],
  ]);
  return tableSheet(columns, rows);
}

function shiftsSheet(result: AdsRoiResult): XLSX.WorkSheet {
  const columns: Column[] = [
    { header: "الفرع", width: 34 },
    { header: "الحملة الضعيفة", width: 28 },
    { header: "إنفاقها", format: MONEY },
    { header: "ROAS", format: RATIO },
    { header: "الحملة القوية", width: 28 },
    { header: "إنفاقها", format: MONEY },
    { header: "ROAS", format: RATIO },
  ];
  const rows = result.shifts.map((s) => [
    s.branchName,
    s.weak.campaignId,
    s.weak.spent,
    s.weak.roas,
    s.strong.campaignId,
    s.strong.spent,
    s.strong.roas,
  ]);
  return tableSheet(columns, rows);
}

function summarySheet(result: AdsRoiResult, meta: AdsRoiExportMeta): XLSX.WorkSheet {
  const { totals, verdict } = result;
  const rows: Array<[string, Cell, string?]> = [
    ["الفترة", exportPeriodLabel(result)],
    ["تقرير الإعلانات", meta.sourceFileName ?? "—"],
    ["تقرير الطلبات", meta.ordersFileName ?? "غير مرفوع (الخصومات والرسوم غير محسوبة)"],
    ["الفروع", result.branches.length, INTEGER],
    ["الحملات", result.campaigns.length, INTEGER],
    ["الإنفاق الإعلاني", totals.spent, MONEY],
    ["مبيعات من الإعلانات (شاملة الضريبة)", totals.gmv, MONEY],
    ["طلبات من الإعلانات", totals.orders, INTEGER],
    ["النقرات", totals.clicks, INTEGER],
    ["تكلفة النقرة", totals.cpc, MONEY],
    ["تكلفة الطلب الواحد", totals.costPerOrder, MONEY],
    ["ROAS (محسوب)", totals.roas, RATIO],
    ["الربح بعد الإعلان", totals.profit, MONEY],
    ["حملات تخسر", verdict.loss.campaigns, INTEGER],
    ["إنفاق الحملات الخاسرة", verdict.loss.spent, MONEY],
    ["خسارتها", verdict.loss.profit, MONEY],
    ["حملات قريبة من التعادل", verdict.thin.campaigns, INTEGER],
    ["حملات رابحة", verdict.profit.campaigns, INTEGER],
  ];
  const data: Cell[][] = [["عائد · عائد العروض والإعلانات · تدقيق"], [], ...rows.map(([label, value]) => [label, value])];
  data.push([], ["من كل 1 ر.س مبيعات من الإعلان", "خصمك", "الضريبة", "العمولة", "رسوم الدفع", "عرض التوصيل", "رسوم أخرى", "تكلفة الطعام", "يبقى", "خط التعادل"]);
  const brandStart = data.length;
  for (const brand of result.brands) {
    const c = brand.costs;
    data.push([brand.brand, c.discount, c.vat, c.commission, c.paymentFee, c.deliveryOffer, c.otherFees, c.foodCost, c.kept, brand.breakEvenRoas]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(data);
  rows.forEach(([, value, format], index) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: 2 + index, c: 1 })] as XLSX.CellObject | undefined;
    if (cell && typeof value === "number" && format) cell.z = format;
  });
  result.brands.forEach((_, index) => {
    for (let c = 1; c <= 9; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: brandStart + index, c })] as XLSX.CellObject | undefined;
      if (cell && typeof cell.v === "number") cell.z = c === 9 ? RATIO : PERCENT;
    }
  });
  sheet["!cols"] = [{ wch: 38 }, { wch: 22 }, ...Array.from({ length: 8 }, () => ({ wch: 13 }))];
  return sheet;
}

export function buildAdsRoiWorkbook(result: AdsRoiResult, meta: AdsRoiExportMeta, scope: AdsRoiExportScope = "full"): XLSX.WorkBook {
  const book = XLSX.utils.book_new();
  if (scope === "full") XLSX.utils.book_append_sheet(book, summarySheet(result, meta), "الملخص");
  if (scope !== "branches") XLSX.utils.book_append_sheet(book, campaignsSheet(result), "الحملات");
  if (scope !== "campaigns") XLSX.utils.book_append_sheet(book, branchesSheet(result), "الفروع");
  if (scope === "full" && result.shifts.length > 0) XLSX.utils.book_append_sheet(book, shiftsSheet(result), "نقل الميزانية");
  book.Workbook = { ...(book.Workbook ?? {}), Views: [{ RTL: true }] };
  return book;
}

export function adsRoiExportFileName(result: AdsRoiResult, scope: AdsRoiExportScope): string {
  const range = result.dateFrom === result.dateTo ? result.dateFrom : `${result.dateFrom}_${result.dateTo}`;
  const part = scope === "full" ? "report" : scope;
  return `tadqeeq-ads-roi-${part}-${range}.xlsx`;
}

export function downloadAdsRoiWorkbook(result: AdsRoiResult, meta: AdsRoiExportMeta, scope: AdsRoiExportScope): void {
  XLSX.writeFile(buildAdsRoiWorkbook(result, meta, scope), adsRoiExportFileName(result, scope), { compression: true });
}
