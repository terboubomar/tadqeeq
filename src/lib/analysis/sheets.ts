import * as XLSX from "xlsx";

import { ParseError, type ParseContext } from "./parse";
import type { SheetMatrix, SheetSource } from "./xlsx-stream";

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
