import type { AnalystFact } from "./analyst-context";
import type {
  AnalystAiResponse,
  AnalystHistoryMessage,
} from "./analyst-ai";

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function normalizeDigits(value: string): string {
  return [...value]
    .map((char) => {
      const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(char);
      if (arabicIndex >= 0) return String(arabicIndex);
      const easternIndex = EASTERN_ARABIC_DIGITS.indexOf(char);
      if (easternIndex >= 0) return String(easternIndex);
      return char;
    })
    .join("")
    .replace(/\u066c/g, ",")
    .replace(/\u066b/g, ".");
}

function extractNumericValues(value: string): number[] {
  const normalized = normalizeDigits(value);
  const matches =
    normalized.match(/[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g) ?? [];

  return matches
    .map((token) => Number(token.replace(/,/g, "")))
    .filter((number) => Number.isFinite(number));
}

function collectNumbers(value: unknown, target: number[]): void {
  if (typeof value === "number") {
    if (Number.isFinite(value)) target.push(value);
    return;
  }

  if (typeof value === "string") {
    target.push(...extractNumericValues(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, target);
    return;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectNumbers(item, target);
    }
  }
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-9;
}

export interface NumericGroundingResult {
  valid: boolean;
  answerNumbers: number[];
  unsupportedNumbers: number[];
}

export function validateAnalystAnswerNumbers(
  answer: string,
  citedFacts: AnalystFact[],
): NumericGroundingResult {
  const answerNumbers = extractNumericValues(answer);
  if (!answerNumbers.length) {
    return { valid: true, answerNumbers: [], unsupportedNumbers: [] };
  }

  const allowedNumbers: number[] = [];
  for (const fact of citedFacts) {
    collectNumbers(fact.displayValue, allowedNumbers);
    collectNumbers(fact.data, allowedNumbers);
  }

  const unsupportedNumbers = answerNumbers.filter(
    (candidate) =>
      !allowedNumbers.some((allowed) => sameNumber(candidate, allowed)),
  );

  return {
    valid: unsupportedNumbers.length === 0,
    answerNumbers,
    unsupportedNumbers,
  };
}

export function enforceAnalystNumericGrounding(
  response: AnalystAiResponse,
  citedFacts: AnalystFact[],
  fallback: AnalystAiResponse,
): AnalystAiResponse {
  if (response.answerability === "not_available") return response;

  const result = validateAnalystAnswerNumbers(response.answer, citedFacts);
  return result.valid ? response : fallback;
}

export function userOnlyAnalystHistory(
  history: AnalystHistoryMessage[],
  limit = 8,
): AnalystHistoryMessage[] {
  return history
    .filter((message) => message.role === "user")
    .slice(-limit);
}
