/**
 * Do the order file and the invoice PDF cover the same dates? An October order sheet uploaded with a September
 * invoice is stopped before analysis is saved, with a message saying what to check.
 *
 * Reads the invoice's printed period from the PDF text on its own; the invoice parsers, the accounting engine and
 * every figure stay as they are. When the invoice prints no period this check finds, it says nothing.
 */

const ARABIC_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export interface DateRange {
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD */
  end: string;
}

const DATE = String.raw`(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})`;
const TIME = String.raw`(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?`;

/** Latin digits, so «٢٠٢٦» and «2026» read the same. */
function latinDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

/** "2026-10-01", "2026/10/01", "01/10/2026" or "01-10-2026" as YYYY-MM-DD; null when it is not a real date. */
function isoDate(raw: string): string | null {
  const parts = raw.split(/[-/.]/).map(Number);
  const [year, month, day] = parts[0]! > 31 ? [parts[0]!, parts[1]!, parts[2]!] : [parts[2]!, parts[1]!, parts[0]!];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const dayNumber = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;

/**
 * The period the invoice prints, for example HungerStation's «Invoice Period From 2026-10-01 00:00:00 To
 * 2026-10-31 00:00:00». Null when no period is printed in a form this reads.
 */
export function readInvoicePeriod(text: string): DateRange | null {
  const source = latinDigits(text);
  const patterns = [
    new RegExp(String.raw`\bfrom\s+(${DATE})${TIME}\s+to\s+(${DATE})`, "i"),
    new RegExp(String.raw`من\s+(${DATE})${TIME}\s+(?:إلى|الى|حتى)\s+(${DATE})`),
    new RegExp(String.raw`(?:period|billing|الفترة|فترة)[^\n]{0,80}?(${DATE})${TIME}\s*(?:-|–|—|~|to|إلى|الى|حتى)\s*(${DATE})`, "i"),
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const start = isoDate(match[1]!);
    const end = isoDate(match[2]!);
    if (!start || !end || start > end) continue;
    if (dayNumber(end) - dayNumber(start) > 62) continue;
    return { start, end };
  }
  return null;
}

export interface PeriodMismatch {
  data: DateRange;
  invoice: DateRange;
}

/**
 * A mismatch when fewer than half the days of the shorter range fall inside the other. A stray order a few hours
 * either side of the month, or a part-month order file, is not one; an October sheet with a September invoice is.
 */
export function invoicePeriodMismatch(
  invoice: DateRange | null,
  dataStart: string | null | undefined,
  dataEnd: string | null | undefined,
): PeriodMismatch | null {
  if (!invoice || !dataStart || !dataEnd) return null;
  const data = { start: dataStart.slice(0, 10), end: dataEnd.slice(0, 10) };
  if (!isoDate(data.start) || !isoDate(data.end) || data.start > data.end) return null;
  const length = (range: DateRange) => dayNumber(range.end) - dayNumber(range.start) + 1;
  const overlap = Math.max(
    0,
    Math.min(dayNumber(data.end), dayNumber(invoice.end)) - Math.max(dayNumber(data.start), dayNumber(invoice.start)) + 1,
  );
  if (overlap * 2 >= Math.min(length(data), length(invoice))) return null;
  return { data, invoice };
}

/** «أكتوبر 2026», or «سبتمبر – أكتوبر 2026» when the dates run across months. */
function monthsOf(range: DateRange): string {
  const name = (iso: string) => `${ARABIC_MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
  const first = name(range.start);
  const last = name(range.end);
  return first === last ? first : `${first} – ${last}`;
}

/** The message shown when analysis stops: both date ranges, then what to check. */
export function invoicePeriodMismatchMessage({ data, invoice }: PeriodMismatch): string {
  return [
    "تواريخ الملفات غير متطابقة، لذلك لم يبدأ التحليل.",
    `• ملف البيانات يغطي: من ${data.start} إلى ${data.end} (${monthsOf(data)}).`,
    `• فاتورة PDF لفترة: من ${invoice.start} إلى ${invoice.end} (${monthsOf(invoice)}).`,
    "تحقّق من أن ملف الطلبات والفاتورة لنفس الشهر ولنفس المنصة، وأنك نزّلت فاتورة الشهر الصحيح من بوابة المنصة، ثم ارفعهما مرة أخرى.",
  ].join("\n");
}
