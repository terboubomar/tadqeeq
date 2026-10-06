import * as XLSX from "xlsx";

export interface ParseContext {
  platform?: "hungerstation" | "keeta" | "jahez";
  file?: string;
  sheet?: string;
  row?: number;
  column?: string;
  optional?: boolean;
}

export class ParseError extends Error {
  readonly context: Omit<ParseContext, "optional">;
  readonly raw: unknown;

  constructor(message: string, raw: unknown, context: ParseContext = {}) {
    super(message);
    this.name = "ParseError";
    this.raw = raw;
    this.context = {
      platform: context.platform,
      file: context.file,
      sheet: context.sheet,
      row: context.row,
      column: context.column,
    };
  }
}

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const BIDI_MARKS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

function normalizeDigits(value: string): string {
  return [...value]
    .map((char) => {
      const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(char);
      if (arabicIndex >= 0) return String(arabicIndex);
      const easternIndex = EASTERN_ARABIC_DIGITS.indexOf(char);
      if (easternIndex >= 0) return String(easternIndex);
      return char;
    })
    .join("");
}

function contextLabel(context: ParseContext): string {
  return [
    context.sheet ? "الورقة: " + context.sheet : null,
    context.row !== undefined ? "الصف: " + context.row : null,
    context.column ? "العمود: " + context.column : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function parseFailure(raw: unknown, context: ParseContext, reason: string): never {
  const location = contextLabel(context);
  throw new ParseError(
    location ? reason + " (" + location + ")" : reason,
    raw,
    context,
  );
}

/**
 * Strict accounting amount parser.
 *
 * Required values fail loudly. Only callers that explicitly mark a field as
 * optional may turn an empty cell into zero.
 */
export function parseAmount(value: unknown, context: ParseContext = {}): number {
  if (value === null || value === undefined || value === "") {
    if (context.optional) return 0;
    return parseFailure(value, context, "قيمة مالية مطلوبة مفقودة");
  }

  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    return parseFailure(value, context, "قيمة مالية غير صالحة");
  }

  let raw = normalizeDigits(String(value).replace(BIDI_MARKS, "").trim());
  if (!raw) {
    if (context.optional) return 0;
    return parseFailure(value, context, "قيمة مالية مطلوبة مفقودة");
  }

  let negativeByParentheses = false;
  if (raw.startsWith("(") || raw.endsWith(")")) {
    if (!(raw.startsWith("(") && raw.endsWith(")"))) {
      return parseFailure(value, context, "تنسيق الأقواس للقيمة المالية غير صالح");
    }
    negativeByParentheses = true;
    raw = raw.slice(1, -1).trim();
  }

  raw = raw
    .replace(/\bSAR\b/gi, "")
    .replace(/ر\.?\s*س\.?/g, "")
    .replace(/\u066c/g, ",")
    .replace(/\u066b/g, ".")
    .replace(/\s+/g, "")
    .trim();

  if (!raw) {
    if (context.optional) return 0;
    return parseFailure(value, context, "قيمة مالية مطلوبة مفقودة");
  }

  if (negativeByParentheses && /^[+-]/.test(raw)) {
    return parseFailure(value, context, "القيمة المالية تحتوي أكثر من إشارة سالبة");
  }

  const normalized = raw.replace(/,/g, "");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    return parseFailure(value, context, "تعذّر قراءة القيمة المالية");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return parseFailure(value, context, "القيمة المالية خارج النطاق المدعوم");
  }

  return negativeByParentheses ? -parsed : parsed;
}


/**
 * Round accounting money to the requested decimal precision.
 *
 * This is the shared monetary rounding primitive for deterministic engines.
 * It rejects non-finite inputs instead of quietly propagating NaN/Infinity.
 */
export function roundMoney(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) {
    throw new ParseError("قيمة مالية غير صالحة للتقريب", value);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) {
    throw new ParseError("عدد المنازل العشرية غير صالح", decimals);
  }

  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export type DateOrder = "DMY" | "MDY" | "ISO";

export interface DateParseOptions {
  order: DateOrder;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function isoDate(
  year: number,
  month: number,
  day: number,
  raw: unknown,
  context: ParseContext,
): string {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    year > 2200 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return parseFailure(raw, context, "تاريخ غير صالح");
  }

  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return parseFailure(raw, context, "تاريخ غير صالح");
  }

  return (
    String(year).padStart(4, "0") +
    "-" +
    String(month).padStart(2, "0") +
    "-" +
    String(day).padStart(2, "0")
  );
}

/**
 * Strict calendar-date parser.
 *
 * - Date objects use local Y/M/D fields; they are never converted through
 *   toISOString(), avoiding UTC day shifts.
 * - Excel serials use SheetJS SSF date decoding.
 * - Numeric slash dates require an explicit DMY/MDY interpretation.
 * - Invalid or missing required dates fail loudly with source context.
 */
export function parseDate(
  value: unknown,
  options: DateParseOptions,
  context: ParseContext = {},
): string {
  if (value === null || value === undefined || value === "") {
    if (context.optional) return "";
    return parseFailure(value, context, "تاريخ مطلوب مفقود");
  }

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      return parseFailure(value, context, "تاريخ غير صالح");
    }
    return isoDate(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
      value,
      context,
    );
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return parseFailure(value, context, "تاريخ غير صالح");
    }
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) {
      return parseFailure(value, context, "تعذّر قراءة تاريخ Excel");
    }
    return isoDate(parsed.y, parsed.m, parsed.d, value, context);
  }

  const raw = normalizeDigits(
    String(value).replace(BIDI_MARKS, "").trim(),
  );
  if (!raw) {
    if (context.optional) return "";
    return parseFailure(value, context, "تاريخ مطلوب مفقود");
  }

  const numericSerial = Number(raw);
  if (
    Number.isFinite(numericSerial) &&
    numericSerial > 20000 &&
    numericSerial < 80000
  ) {
    const parsed = XLSX.SSF.parse_date_code(numericSerial);
    if (!parsed) {
      return parseFailure(value, context, "تعذّر قراءة تاريخ Excel");
    }
    return isoDate(parsed.y, parsed.m, parsed.d, value, context);
  }

  const iso = raw.match(/(?:^|\D)(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\D|$)/);
  if (iso) {
    return isoDate(
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
      value,
      context,
    );
  }

  const english = raw.match(
    /(?:^|\D)(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})(?:\D|$)/,
  );
  if (english) {
    const month = MONTH_NAMES[english[2]!.toLowerCase()];
    if (!month) {
      return parseFailure(value, context, "اسم الشهر غير معروف");
    }
    return isoDate(
      Number(english[3]),
      month,
      Number(english[1]),
      value,
      context,
    );
  }

  const numeric = raw.match(
    /(?:^|\D)(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\D|$)/,
  );
  if (numeric) {
    if (options.order === "ISO") {
      return parseFailure(
        value,
        context,
        "تنسيق التاريخ الرقمي غير متوقع؛ يلزم ترتيب سنة-شهر-يوم",
      );
    }
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = Number(numeric[3]);
    const day = options.order === "DMY" ? first : second;
    const month = options.order === "DMY" ? second : first;
    return isoDate(year, month, day, value, context);
  }

  return parseFailure(value, context, "تعذّر قراءة التاريخ");
}

function isoToUtcMs(value: string): number {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("Expected normalized ISO date");
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function assertDateInRange(
  date: string,
  start: string,
  end: string,
  context: ParseContext = {},
  toleranceDays = 1,
): void {
  const value = isoToUtcMs(date);
  const min = isoToUtcMs(start) - toleranceDays * 86_400_000;
  const max = isoToUtcMs(end) + toleranceDays * 86_400_000;

  if (value < min || value > max) {
    parseFailure(
      date,
      context,
      "ترتيب اليوم/الشهر في الملف غير متوقع أو التاريخ خارج فترة التقرير",
    );
  }
}
