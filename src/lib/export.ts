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
  URL.revokeObjectURL(url);
}

export function exportCsv<T>(rows: T[], columns: ExportColumn<T>[], filename: string) {
  const matrix = toMatrix(rows, columns);
  const csv = matrix
    .map((line) =>
      line
        .map((cell) => {
          const value = String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
  // BOM keeps Arabic readable in Excel
  download(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
}

export function exportXlsx<T>(
  sheets: { name: string; rows: T[]; columns: ExportColumn<T>[] }[],
  filename: string,
) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(toMatrix(sheet.rows, sheet.columns));
    ws["!cols"] = sheet.columns.map((column) => ({ wch: Math.max(14, column.header.length + 4) }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
