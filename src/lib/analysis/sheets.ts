import * as XLSX from "xlsx";

import { ParseError, type ParseContext } from "./parse";
import { ROW_HAS_SKIPPED_VALUES, type SheetMatrix, type SheetSource } from "./xlsx-stream";

/** A SheetJS workbook as a SheetSource; each sheet is converted once, on first use. */
export function workbookSheetSource(wb: XLSX.WorkBook): SheetSource {
  const cache = new Map<string, SheetMatrix>();
  return {
    names: wb.SheetNames,
    matrix(name) {
      const sheet = wb.Sheets[name];
      if (!sheet) return undefined;
      let matrix = cache.get(name);
      if (!matrix) {
        matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
        cache.set(name, matrix);
      }
      return matrix;
    },
  };
}

function normalizeSheetName(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolve a workbook sheet deterministically.
 *
 * 1. Case-insensitive exact match wins.
 * 2. Otherwise exactly one partial match is accepted.
 * 3. Multiple possible partial matches fail loudly.
 */
export function resolveSheetName(
  sheetNames: string[],
  requested: string,
  context: ParseContext = {},
): string | undefined {
  const target = normalizeSheetName(requested);
  const exact = sheetNames.filter(
    (name) => normalizeSheetName(name) === target,
  );

  if (exact.length === 1) return exact[0];

  if (exact.length > 1) {
    throw new ParseError(
      "يوجد أكثر من ورقة مطابقة تماماً للاسم المطلوب: " + exact.join(" | "),
      requested,
      {
        ...context,
        sheet: requested,
      },
    );
  }

  const partial = sheetNames.filter((name) =>
    normalizeSheetName(name).includes(target),
  );

  if (partial.length === 0) return undefined;
  if (partial.length === 1) return partial[0];

  throw new ParseError(
    "اسم الورقة غير محدد لأن أكثر من ورقة تطابق البحث: " +
      partial.join(" | "),
    requested,
    {
      ...context,
      sheet: requested,
    },
  );
}

const ROW_VALUES = Symbol("rowValues");
const ROW_SHAPE = Symbol("rowShape");

interface RowShape {
  /** Column names in the order Object.keys gives them on an equivalent plain row object. */
  keys: string[];
  /** Case-insensitive column resolutions, shared by every row of the sheet. */
  lookups: Map<string, string | undefined>;
}

/** Header cell text as SheetJS formats it for object rows (string headers, the common case, pass through). */
function headerName(value: unknown): string {
  if (value === null || value === undefined) return "__EMPTY";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

/**
 * The rows of a sheet as objects keyed by the first row's headers, exactly like SheetJS
 * sheet_to_json(sheet, { defval: null }): blank header cells become "__EMPTY", repeated headers get
 * "_1", "_2"… suffixes, and rows with no values are skipped.
 *
 * Rows are views over the sheet's own row arrays rather than copies, so a large export is not held
 * twice in memory (a Worker has 128 MB). Reading row[header] and `header in row` work as on plain
 * objects; use rowKeys() instead of Object.keys() to list the columns.
 */
export function objectRows(matrix: SheetMatrix, limit = Infinity): Record<string, unknown>[] {
  if (matrix.length === 0) return [];
  const headerRow = matrix[0]!;
  const counts: Record<string, number> = {};
  const names = headerRow.map((cell) => {
    const name = headerName(cell);
    let counter = counts[name] || 0;
    if (!counter) {
      counts[name] = 1;
      return name;
    }
    let unique: string;
    do unique = `${name}_${counter++}`;
    while (counts[unique]);
    counts[name] = counter;
    counts[unique] = 1;
    return unique;
  });

  const proto: Record<PropertyKey, unknown> = {};
  const plain: Record<string, number> = {};
  names.forEach((name, index) => {
    plain[name] = index;
    Object.defineProperty(proto, name, {
      enumerable: true,
      get(this: { [ROW_VALUES]: unknown[] }) {
        return this[ROW_VALUES][index] ?? null;
      },
    });
  });
  const shape: RowShape = { keys: Object.keys(plain), lookups: new Map() };
  Object.defineProperty(proto, ROW_SHAPE, { value: shape });

  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < matrix.length && rows.length < limit; r++) {
    const values = matrix[r]!;
    const skipped = (values as { [ROW_HAS_SKIPPED_VALUES]?: boolean })[ROW_HAS_SKIPPED_VALUES];
    if (!skipped && !values.some((value) => value !== null && value !== undefined)) continue;
    const row = Object.create(proto) as Record<PropertyKey, unknown>;
    row[ROW_VALUES] = values;
    rows.push(row as Record<string, unknown>);
  }
  return rows;
}

/** The column names of a row from objectRows (or of any plain row object). */
export function rowKeys(row: Record<string, unknown>): string[] {
  return (row as { [ROW_SHAPE]?: RowShape })[ROW_SHAPE]?.keys ?? Object.keys(row);
}

/**
 * The first column (in rowKeys order) matching one of the candidates case-insensitively, trying
 * candidates in order. Cached per sheet for rows from objectRows.
 */
export function findColumnIgnoringCase(row: Record<string, unknown>, candidates: string[]): string | undefined {
  const shape = (row as { [ROW_SHAPE]?: RowShape })[ROW_SHAPE];
  const cacheKey = candidates.join("\u0000");
  if (shape?.lookups.has(cacheKey)) return shape.lookups.get(cacheKey);
  const keys = shape?.keys ?? Object.keys(row);
  let found: string | undefined;
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    found = keys.find((key) => key.toLowerCase() === lower);
    if (found !== undefined) break;
  }
  shape?.lookups.set(cacheKey, found);
  return found;
}
