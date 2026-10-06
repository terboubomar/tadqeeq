import { Download, FileSpreadsheet, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportCsv, exportXlsx, type ExportColumn } from "@/lib/export";
import { count, money, percent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: keyof T & string;
  header: string;
  type?: "money" | "number" | "percent" | "text";
  className?: string;
}

interface ReportTableProps<T> {
  title: string;
  rows: T[];
  columns: Column<T>[];
  filename: string;
  searchKey?: keyof T & string;
  totals?: boolean;
  caption?: string;
  /** Makes one column's cells a button, e.g. a branch name that opens its journal entry. */
  cellAction?: { key: keyof T & string; label: string; onClick: (row: T) => void };
}

function render<T>(row: T, column: Column<T>) {
  const value = row[column.key];
  if (typeof value === "number") {
    if (column.type === "percent") return <span className="num">{percent(value)}</span>;
    if (column.type === "number") return <span className="num">{count(value)}</span>;
    return <span className="num">{money(value)}</span>;
  }
  return <span>{value === null || value === undefined ? "—" : String(value)}</span>;
}

export function ReportTable<T extends Record<string, unknown>>({
  title,
  rows,
  columns,
  filename,
  searchKey,
  totals = true,
  caption,
  cellAction,
}: ReportTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [desc, setDesc] = useState(true);

  const filtered = useMemo(() => {
    let list = rows;
    if (searchKey && query.trim()) {
      const needle = query.trim().toLowerCase();
      list = list.filter((row) => String(row[searchKey] ?? "").toLowerCase().includes(needle));
    }
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const left = a[sortKey];
        const right = b[sortKey];
        if (typeof left === "number" && typeof right === "number") {
          return desc ? right - left : left - right;
        }
        return desc
          ? String(right).localeCompare(String(left), "ar")
          : String(left).localeCompare(String(right), "ar");
      });
    }
    return list;
  }, [rows, query, searchKey, sortKey, desc]);

  const totalsRow = useMemo(() => {
    if (!totals) return null;
    const result: Record<string, number> = {};
    for (const column of columns) {
      if (column.type === "money" || column.type === "number" || !column.type) {
        const sum = filtered.reduce((acc, row) => {
          const value = row[column.key];
          return acc + (typeof value === "number" ? value : 0);
        }, 0);
        if (sum !== 0) result[column.key] = sum;
      }
    }
    return result;
  }, [filtered, columns, totals]);

  const exportColumns = columns.map(
    (column) =>
      ({ key: column.key, header: column.header, type: column.type }) as ExportColumn<T>,
  );

  return (
    <section className="overflow-hidden rounded-[10px] border border-border bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {caption ? <p className="mt-1 text-xs text-muted-foreground">{caption}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {searchKey ? (
            <div className="relative">
              <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="بحث…"
                className="h-8 w-44 ps-8 text-xs"
              />
            </div>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv(filtered, exportColumns, filename)}
          >
            <Download className="size-4" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportXlsx([{ name: title, rows: filtered, columns: exportColumns }], filename)
            }
          >
            <FileSpreadsheet className="size-4" />
            Excel
          </Button>
        </div>
      </header>

      <div data-scroll className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-max border-collapse text-[13.5px]">
          <thead className="sticky top-0 z-10 bg-surface-raised">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  onClick={() => {
                    if (sortKey === column.key) setDesc((value) => !value);
                    else {
                      setSortKey(column.key);
                      setDesc(true);
                    }
                  }}
                  className={cn(
                    "cursor-pointer whitespace-nowrap border-b border-border px-3.5 py-2.5 text-start text-[11.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground",
                    sortKey === column.key && "text-primary",
                    column.className,
                  )}
                >
                  {column.header}
                  {sortKey === column.key ? (desc ? " ↓" : " ↑") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, index) => (
              <tr
                key={index}
                className={cn("transition-colors hover:bg-secondary/45", index % 2 ? "bg-background/55" : "bg-white")}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "whitespace-nowrap border-b border-border/60 px-3.5 py-2.5",
                      typeof row[column.key] === "number" && "font-mono",
                      column.className,
                    )}
                  >
                    {cellAction && cellAction.key === column.key ? (
                      <button
                        type="button"
                        title={cellAction.label}
                        onClick={() => cellAction.onClick(row)}
                        className="text-start font-medium underline decoration-border decoration-dashed underline-offset-4 hover:text-primary-text hover:decoration-primary"
                      >
                        {render(row, column)}
                      </button>
                    ) : (
                      render(row, column)
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  لا توجد بيانات مطابقة
                </td>
              </tr>
            ) : null}
          </tbody>
          {totalsRow && filtered.length > 0 ? (
            <tfoot className="sticky bottom-0 bg-surface-raised">
              <tr className="border-t-2 border-input font-semibold">
                {columns.map((column, index) => (
                  <td key={column.key} className="whitespace-nowrap px-3.5 py-2.5">
                    {index === 0 ? (
                      "الإجمالي"
                    ) : totalsRow[column.key] !== undefined ? (
                      <span className="num text-primary">{money(totalsRow[column.key])}</span>
                    ) : (
                      ""
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  );
}
