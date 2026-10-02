import * as XLSX from "xlsx";

import type { ReportRow } from "./reports";

export interface ReportTable {
  headers: string[];
  rows: ReportRow[];
}

function isoLocalDate(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part, i) => String(part).padStart(i ? 2 : 4, "0")).join("-");
}

function tableFromSheet(sheet: XLSX.WorkSheet | undefined): ReportTable {
  if (!sheet) return { headers: [], rows: [] };
  // Excel date cells keep their own display format (e.g. 8/1/26); show them as YYYY-MM-DD instead.
  for (const [address, value] of Object.entries(sheet)) {
    if (address.startsWith("!")) continue;
    const cellValue = value as XLSX.CellObject;
    if (cellValue.t === "d" && cellValue.v instanceof Date) cellValue.w = isoLocalDate(cellValue.v);
  }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  const headers = (matrix[0] ?? []).map((value) => String(value ?? "").replace(/^\uFEFF/, "").trim());
  const rows = XLSX.utils.sheet_to_json<ReportRow>(sheet, { raw: false, defval: "" });
  return { headers, rows };
}

/** CSV text → rows of text values. Every cell stays a string, so IDs and "38;57" survive as written. */
export function readCsvText(text: string): ReportTable {
  const workbook = XLSX.read(text.replace(/^\uFEFF/, ""), { type: "string", raw: true });
  return tableFromSheet(workbook.Sheets[workbook.SheetNames[0] ?? ""]);
}

/** Excel workbook → rows of the first sheet, values as displayed text. */
export function readWorkbook(data: ArrayBuffer): ReportTable {
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  return tableFromSheet(workbook.Sheets[workbook.SheetNames[0] ?? ""]);
}

export async function readReportFile(file: File): Promise<ReportTable> {
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return readCsvText(await file.text());
  return readWorkbook(await file.arrayBuffer());
}
