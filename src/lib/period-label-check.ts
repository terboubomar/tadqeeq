/**
 * Does a period's name agree with the dates in its file? A name like «سبتمبر 2026» on a file that runs through
 * October is caught at upload, before the period is saved. Display and confirmation only: never changes figures.
 */

const MONTH_WORDS: Array<[RegExp, number]> = [
  [/يناير|جانفي|كانون\s*الثاني/, 1],
  [/فبراير|فيفري|شباط/, 2],
  [/مارس|آذار|اذار/, 3],
  [/أبريل|ابريل|إبريل|نيسان/, 4],
  [/مايو|أيار|ايار/, 5],
  [/يونيو|يونيه|جوان|حزيران/, 6],
  [/يوليو|يوليه|جويلية|تموز/, 7],
  [/أغسطس|اغسطس|أوت|آب/, 8],
  [/سبتمبر|أيلول|ايلول/, 9],
  [/أكتوبر|اكتوبر|تشرين\s*الأول|تشرين\s*الاول/, 10],
  [/نوفمبر|تشرين\s*الثاني/, 11],
  [/ديسمبر|كانون\s*الأول|كانون\s*الاول/, 12],
  [/\b(?:jan|january)\b/i, 1],
  [/\b(?:feb|february)\b/i, 2],
  [/\b(?:mar|march)\b/i, 3],
  [/\b(?:apr|april)\b/i, 4],
  [/\bmay\b/i, 5],
  [/\b(?:jun|june)\b/i, 6],
  [/\b(?:jul|july)\b/i, 7],
  [/\b(?:aug|august)\b/i, 8],
  [/\b(?:sep|sept|september)\b/i, 9],
  [/\b(?:oct|october)\b/i, 10],
  [/\b(?:nov|november)\b/i, 11],
  [/\b(?:dec|december)\b/i, 12],
];

const ARABIC_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** "YYYY-MM" for each calendar month the dates touch, oldest first. */
function monthsBetween(start: string, end: string): string[] {
  const months: string[] = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const lastYear = Number(end.slice(0, 4));
  const lastMonth = Number(end.slice(5, 7));
  while ((year < lastYear || (year === lastYear && month <= lastMonth)) && months.length < 36) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** Latin digits, so «٢٠٢٦» and «2026» read the same. */
function latinDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

/** The months a name mentions: month words with an optional year, and «2026-09» / «09/2026». */
export function labelMonths(label: string): { month: number; year: number | null }[] {
  const text = latinDigits(label);
  const years = [...text.matchAll(/(?<!\d)(20\d{2})(?!\d)/g)].map((match) => Number(match[1]));
  const year = years.length === 1 ? years[0]! : null;
  const found: { month: number; year: number | null }[] = [];
  for (const match of text.matchAll(/(?<!\d)(20\d{2})[-/.](\d{1,2})(?!\d)/g)) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) found.push({ month, year: Number(match[1]) });
  }
  for (const match of text.matchAll(/(?<![\d/.-])(\d{1,2})[-/.](20\d{2})(?!\d)/g)) {
    const month = Number(match[1]);
    if (month >= 1 && month <= 12) found.push({ month, year: Number(match[2]) });
  }
  for (const [pattern, month] of MONTH_WORDS) {
    if (pattern.test(text) && !found.some((item) => item.month === month)) found.push({ month, year });
  }
  return found;
}

export interface LabelMismatch {
  /** The months the name mentions, in Arabic (with the year when the name gives one). */
  labelMonths: string[];
  /** The months the file's dates cover, in Arabic with the year. */
  fileMonths: string[];
}

const monthName = (month: number, year: number | null) => `${ARABIC_MONTHS[month - 1]}${year ? ` ${year}` : ""}`;

/**
 * Null when the name mentions no month, or when any month it mentions falls in the file's dates. Otherwise the
 * months on each side, for the warning.
 */
export function periodLabelMismatch(
  label: string,
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
): LabelMismatch | null {
  if (!periodStart || !periodEnd) return null;
  const mentioned = labelMonths(label);
  if (!mentioned.length) return null;
  const covered = monthsBetween(periodStart.slice(0, 10), periodEnd.slice(0, 10));
  const agrees = mentioned.some(({ month, year }) =>
    covered.some((key) => Number(key.slice(5, 7)) === month && (year === null || Number(key.slice(0, 4)) === year)),
  );
  if (agrees) return null;
  return {
    labelMonths: mentioned.map(({ month, year }) => monthName(month, year)),
    fileMonths: covered.map((key) => monthName(Number(key.slice(5, 7)), Number(key.slice(0, 4)))),
  };
}
