import * as XLSX from "xlsx";

export type ExportColumn<T> = {
  key: keyof T & string;
  header: string;
  type?: "money" | "number" | "percent" | "text";
};

function cellValue<T>(row: T, column: ExportColumn<T>): string | number {
  const raw = row[column.key];
  if (typeof raw === "number") {
    if (column.type === "percent") return Number((raw * 100).toFixed(2));
    return Number(raw.toFixed(2));
  }
  return raw === null || raw === undefined ? "" : String(raw);
}

function toMatrix<T>(rows: T[], columns: ExportColumn<T>[]): (string | number)[][] {
  return [
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((column) => cellValue(row, column))),
  ];
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking at once can cancel the download in some browsers; give it time to start.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Text for one CSV cell. Text that starts with = + - @ (or a tab / carriage return) would run as a formula in
 * Excel, and branch names and labels come from platform files, so such text gets a leading apostrophe.
 * Numbers are written as they are.
 */
export function csvSafeText(cell: unknown): string {
  const value = String(cell ?? "");
  if (typeof cell === "number") return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function exportCsv<T>(rows: T[], columns: ExportColumn<T>[], filename: string) {
  const matrix = toMatrix(rows, columns);
  const csv = matrix
    .map((line) =>
      line
        .map((cell) => {
          const value = csvSafeText(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
  // BOM keeps Arabic readable in Excel
  download(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
}

/**
 * A sheet name Excel accepts: none of : \ / ? * [ ], no apostrophe at either end, 1-31 characters, and unique in the
 * workbook (compared case-insensitively). `taken` holds the names already used, in lower case.
 */
export function safeSheetName(name: string, taken: Set<string> = new Set()): string {
  const clean = (text: string, max: number) =>
    text
      .replace(/[:\\/?*[\]]+/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, max)
      .replace(/^[\s']+|[\s']+$/g, "");
  const base = clean(name, 31) || "Sheet";
  let candidate = base;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
    const suffix = " (" + n + ")";
    candidate = (clean(base, 31 - suffix.length) || "Sheet") + suffix;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

export function exportXlsx<T>(
  sheets: { name: string; rows: T[]; columns: ExportColumn<T>[] }[],
  filename: string,
) {
  const wb = XLSX.utils.book_new();
  const taken = new Set<string>();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(toMatrix(sheet.rows, sheet.columns));
    ws["!cols"] = sheet.columns.map((column) => ({ wch: Math.max(14, column.header.length + 4) }));
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sheet.name, taken));
  }
  const data = XLSX.write(wb, { type: "array", bookType: "xlsx", compression: true }) as ArrayBuffer;
  download(
    new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${filename}.xlsx`,
  );
}
