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

/**
 * Splits CSV text into records (RFC 4180: quoted fields may hold commas, quotes as "" and line
 * breaks). Much faster than going through a workbook for large exports such as a month of orders.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const length = text.length;
  while (i < length) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      // Copy the run of ordinary characters in one step.
      const next = text.indexOf('"', i);
      const end = next === -1 ? length : next;
      field += text.slice(i, end);
      i = end;
      continue;
    }
    if (char === '"') {
      quoted = true;
      i += 1;
    } else if (char === ",") {
      record.push(field);
      field = "";
      i += 1;
    } else if (char === "\n" || char === "\r") {
      record.push(field);
      field = "";
      records.push(record);
      record = [];
      i += char === "\r" && text[i + 1] === "\n" ? 2 : 1;
    } else {
      let end = i + 1;
      while (end < length) {
        const c = text[end];
        if (c === "," || c === "\n" || c === "\r" || c === '"') break;
        end += 1;
      }
      field += text.slice(i, end);
      i = end;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records.filter((row) => row.length > 1 || (row[0] ?? "").trim() !== "");
}

/** CSV text → rows of text values. Every cell stays a string, so IDs and "38;57" survive as written. */
export function readCsvText(text: string): ReportTable {
  const [headerRow = [], ...body] = parseCsv(text);
  const headers = headerRow.map((value) => value.replace(/^\uFEFF/, "").trim());
  const rows = body.map((values) => {
    const row: ReportRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
  return { headers, rows };
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
