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
