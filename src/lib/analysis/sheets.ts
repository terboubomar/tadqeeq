import { ParseError, type ParseContext } from "./parse";

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
