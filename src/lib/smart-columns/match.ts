import * as XLSX from "xlsx";

import { parseCsv as parseJahezCsv } from "../analysis/jahez";
import { HUNGERSTATION_ORDER_FORMAT, JAHEZ_DETAIL_FORMAT, JAHEZ_SUMMARY_FORMAT, KEETA_ORDER_FORMAT } from "../analysis/formats";
import { normalizeFormatHeader, type FormatFingerprint } from "../analysis/formats/types";
import { resolveSheetName } from "../analysis/sheets";
import type { Platform } from "../analysis/types";

/**
 * Smart column matching for platform exports whose column names changed.
 *
 * When a required column is missing, every other column of the same table is scored as a
 * candidate: by its name (word overlap and character trigrams against the expected name and
 * known synonyms) and by its values (money, date, text or ID, from a sample of rows). The user
 * confirms a match; it is then stored for the workspace and applied before analysis by renaming
 * the header cell only. The engines run unchanged on the renamed file, with all their checks.
 */

export type ValueKind = "money" | "date" | "text" | "id";

export interface ColumnAlias {
  /** Fingerprint source (sheet or table) the column belongs to, e.g. "Order Summary". */
  source: string;
  /** The column name the engine expects. */
  canonical: string;
  /** The column name in the new export. */
  observed: string;
}

export interface ColumnCandidate {
  header: string;
  /** 0–1. */
  confidence: number;
  /** A few non-empty values from the column, as text. */
  samples: string[];
}

export interface ColumnReviewField {
  source: string;
  /** Expected column names, any one of which satisfies the engine (first is shown). */
  expected: string[];
  kind: ValueKind;
  candidates: ColumnCandidate[];
  /** Every other unclaimed column of the table, for a manual pick when none of the candidates fits. */
  others: string[];
  /** Pre-selected when one candidate is clearly best. */
  suggested: string | null;
}

export interface ColumnReview {
  platform: Platform;
  formatId: string;
  fields: ColumnReviewField[];
}

const FINGERPRINTS: Record<Platform, FormatFingerprint[]> = {
  hungerstation: [HUNGERSTATION_ORDER_FORMAT],
  keeta: [KEETA_ORDER_FORMAT],
  jahez: [JAHEZ_SUMMARY_FORMAT, JAHEZ_DETAIL_FORMAT],
};

/** Value type and extra names for each required column (keyed by its first expected name). */
const FIELD_HINTS: Record<string, { kind: ValueKind; synonyms?: string[] }> = {
  // HungerStation
  Status: { kind: "text", synonyms: ["order status", "الحالة"] },
  "Branch Name": { kind: "text", synonyms: ["outlet name", "restaurant name", "store name", "vendor name", "اسم الفرع"] },
  "HS Branch ID": { kind: "id", synonyms: ["branch id", "restaurant id", "outlet id", "store id", "vendor id"] },
  "Payment Type": { kind: "text", synonyms: ["payment method", "طريقة الدفع"] },
  "Commissionable GMV (VAT Excluded)": { kind: "money", synonyms: ["commissionable gmv", "gmv excl vat", "commissionable sales"] },
  Commission: { kind: "money", synonyms: ["commission amount", "commission fee", "العمولة"] },
  "CC Amount": { kind: "money", synonyms: ["card amount", "credit card amount", "online payment amount"] },
  "Operation Day": { kind: "date", synonyms: ["order date", "date", "creation time", "التاريخ"] },
  // Keeta
  "Brand Name": { kind: "text", synonyms: ["brand", "merchant name"] },
  "Store name": { kind: "text", synonyms: ["branch name", "outlet name", "restaurant name"] },
  "Transaction date": { kind: "date", synonyms: ["date", "order date", "settlement date"] },
  "Transaction type": { kind: "text", synonyms: ["type", "order type"] },
  "Original item price (VAT included)": { kind: "money", synonyms: ["item price incl vat", "original price", "food price"] },
  "Subtotal of commission fee (VAT included)": { kind: "money", synonyms: ["commission fee incl vat", "commission subtotal", "commission"] },
  "Bank fee (VAT included)": { kind: "money", synonyms: ["payment fee", "card fee", "bank charges", "رسوم البنك", "رسوم الدفع"] },
  "Payable to merchant": { kind: "money", synonyms: ["net payable", "payout", "amount payable", "settlement amount"] },
  // Jahez
  Date: { kind: "date", synonyms: ["order date", "التاريخ"] },
  "Orders Amount": { kind: "money", synonyms: ["total orders amount", "sales amount"] },
  "Jahez Commision": { kind: "money", synonyms: ["jahez commission", "commission"] },
  "Restaurant Amount": { kind: "money", synonyms: ["restaurant net", "net amount", "payable"] },
  "Payment Fees": { kind: "money", synonyms: ["payment fee", "card fees"] },
  "Payment Fees Vat": { kind: "money", synonyms: ["payment fees vat", "payment fee vat"] },
  "Offer Amount": { kind: "money", synonyms: ["offer", "discount amount"] },
  "Delivery Offer": { kind: "money", synonyms: ["delivery discount"] },
  "Delivery Coupon": { kind: "money", synonyms: ["delivery voucher"] },
  "#": { kind: "id", synonyms: ["no", "row", "serial"] },
  "Order #": { kind: "id", synonyms: ["order id", "order number", "order no"] },
  "Order Amount": { kind: "money", synonyms: ["order total", "amount"] },
  "Delivery Charge": { kind: "money", synonyms: ["delivery fee"] },
};

/** Below this a candidate is not shown. */
const MIN_CONFIDENCE = 0.35;
/** A suggestion is pre-selected only above this and clearly ahead of the next one. */
const SUGGEST_CONFIDENCE = 0.6;
const SUGGEST_MARGIN = 0.1;
const SAMPLE_ROWS = 200;

// ---------------------------------------------------------------- name similarity

function words(value: string): string[] {
  return normalizeFormatHeader(value)
    .replace(/[^\p{L}\p{N}#]+/gu, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => (word === "commision" ? "commission" : word === "incl" || word === "included" || word === "including" ? "incl" : word));
}

/** Words that appear in many money columns and say little about which one it is. */
const GENERIC = new Set(["amount", "fee", "fees", "total", "vat", "incl", "excl", "of", "the", "for", "by", "sar", "value", "price"]);

function informative(value: string): Set<string> {
  const all = words(value);
  const kept = all.filter((word) => !GENERIC.has(word));
  return new Set(kept.length ? kept : all);
}

function trigrams(value: string): Set<string> {
  const compact = " " + [...informative(value)].join(" ") + " ";
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= compact.length; i += 1) grams.add(compact.slice(i, i + 3));
  return grams;
}

function nameScore(a: string, b: string): number {
  const wa = informative(a);
  const wb = informative(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  const shared = [...wa].filter((word) => wb.has(word)).length;
  const jaccard = shared / (wa.size + wb.size - shared);
  const containment = shared / Math.min(wa.size, wb.size);
  const ta = trigrams(a);
  const tb = trigrams(b);
  const sharedGrams = [...ta].filter((gram) => tb.has(gram)).length;
  const dice = ta.size + tb.size ? (2 * sharedGrams) / (ta.size + tb.size) : 0;
  return Math.max(jaccard, dice, containment * 0.85);
}

export function headerSimilarity(observed: string, expected: string[]): number {
  const names = [...expected, ...(FIELD_HINTS[expected[0] ?? ""]?.synonyms ?? [])];
  return Math.max(0, ...names.map((name) => nameScore(observed, name)));
}

// ---------------------------------------------------------------- value profile

function isMoney(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  const text = String(value).trim().replace(/[,\s]/g, "").replace(/^\((.*)\)$/, "-$1").replace(/(SAR|ر\.س)$/i, "");
  return /^[-+]?\d+(\.\d+)?$/.test(text);
}

function isDate(value: unknown): boolean {
  if (value instanceof Date) return Number.isFinite(value.getTime());
  if (typeof value === "number") return value > 30000 && value < 80000;
  const text = String(value).trim();
  return /^\d{4}-\d{1,2}-\d{1,2}/.test(text) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(text);
}

/** Share of non-empty sample values that fit the expected kind (0 when the column is empty). */
export function kindFit(kind: ValueKind, values: unknown[]): number {
  const present = values.filter((value) => value !== null && value !== undefined && String(value).trim() !== "");
  if (present.length === 0) return 0;
  const share = (test: (value: unknown) => boolean) => present.filter(test).length / present.length;
  switch (kind) {
    case "money": {
      const fit = share((value) => isMoney(value) && !isDate(value));
      // A column of only zeros fits any amount and says nothing about which one it is.
      const anyNonZero = present.some((value) => isMoney(value) && Number(String(value).replace(/[^\d.-]/g, "")) !== 0);
      return anyNonZero ? fit : fit * 0.5;
    }
    case "date":
      return share(isDate);
    case "text":
      return share((value) => !isMoney(value) && !isDate(value));
    case "id": {
      const fit = share((value) => /^[\p{L}\p{N}_-]{1,40}$/u.test(String(value).trim()) && !isDate(value));
      return fit;
    }
  }
}

// ---------------------------------------------------------------- source tables

export interface SourceTable {
  source: string;
  headers: string[];
  rows: unknown[][];
}

function headerRowIndex(matrix: unknown[][]): number {
  let best = 0;
  let bestCount = -1;
  matrix.slice(0, 30).forEach((row, index) => {
    const count = row.filter((value) => typeof value === "string" && value.trim() !== "" && !isMoney(value)).length;
    if (count > bestCount) {
      best = index;
      bestCount = count;
    }
  });
  return best;
}

function sheetMatrix(wb: XLSX.WorkBook, platform: Platform, source: string): unknown[][] | null {
  const name = resolveSheetName(wb.SheetNames, source, { platform });
  const sheet = name ? wb.Sheets[name] : undefined;
  if (!sheet) return null;
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
}

function jahezTable(matrix: string[][], source: string): { headerIndex: number } | null {
  if (source === JAHEZ_SUMMARY_FORMAT.source) return matrix.length ? { headerIndex: 0 } : null;
  const index = matrix.findIndex((row, i) => i > 0 && row[0]?.trim() === "#");
  if (index >= 0) return { headerIndex: index };
  // The detail table's "#" column itself may have been renamed: take the widest row after the summary.
  let best = -1;
  let width = 0;
  matrix.slice(2, 40).forEach((row, i) => {
    const count = row.filter((value) => value.trim() !== "" && !isMoney(value)).length;
    if (count > width) {
      width = count;
      best = i + 2;
    }
  });
  return best >= 0 ? { headerIndex: best } : null;
}

/** The table a fingerprint source reads, with a sample of its rows. Null when the sheet itself is missing. */
export function readSourceTable(platform: Platform, source: string, file: ArrayBuffer): SourceTable | null {
  if (platform === "jahez") {
    const matrix = parseJahezCsv(new TextDecoder("utf-8").decode(file).replace(/^\uFEFF/, ""));
    const table = jahezTable(matrix, source);
    if (!table) return null;
    const headers = (matrix[table.headerIndex] ?? []).map((value) => value.trim());
    const end = source === JAHEZ_SUMMARY_FORMAT.source ? table.headerIndex + 2 : table.headerIndex + 1 + SAMPLE_ROWS;
    return { source, headers, rows: matrix.slice(table.headerIndex + 1, end).filter((row) => row.some((v) => v.trim() !== "")) };
  }
  const matrix = sheetMatrix(XLSX.read(file, { type: "array" }), platform, source);
  if (!matrix || matrix.length === 0) return null;
  const index = platform === "hungerstation" ? 0 : headerRowIndex(matrix);
  const headers = (matrix[index] ?? []).map((value) => String(value ?? "").trim());
  return { source, headers, rows: matrix.slice(index + 1, index + 1 + SAMPLE_ROWS) };
}

// ---------------------------------------------------------------- suggestions

function presentGroups(fingerprint: FormatFingerprint, headers: string[]) {
  const normalized = new Set(headers.map(normalizeFormatHeader));
  return fingerprint.requiredHeaderGroups.map((group) => ({
    group: [...group],
    present: group.some((name) => normalized.has(normalizeFormatHeader(name))),
  }));
}

/** Scores the table's unclaimed columns for each missing required column. */
export function suggestColumns(fingerprint: FormatFingerprint, table: SourceTable): ColumnReviewField[] {
  const groups = presentGroups(fingerprint, table.headers);
  const claimed = new Set(
    groups.filter((g) => g.present).flatMap((g) => g.group.map(normalizeFormatHeader)),
  );
  const free = table.headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => header !== "" && !claimed.has(normalizeFormatHeader(header)));

  const fields = groups
    .filter((g) => !g.present)
    .map((g): ColumnReviewField => {
      const kind = FIELD_HINTS[g.group[0]!]?.kind ?? "text";
      const scored = free
        .map(({ header, index }) => {
          const values = table.rows.map((row) => row[index]);
          const name = headerSimilarity(header, g.group);
          const fit = kindFit(kind, values);
          const confidence = fit === 0 ? name * 0.3 : 0.6 * name + 0.4 * fit;
          const samples = values
            .filter((value) => value !== null && value !== undefined && String(value).trim() !== "" && String(value).trim() !== "0")
            .slice(0, 3)
            .map((value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).trim()).slice(0, 40));
          return { header, name, confidence: Math.round(confidence * 100) / 100, samples };
        })
        .filter((candidate) => candidate.confidence >= MIN_CONFIDENCE);
      // Columns matched on values alone are only worth showing when no column has a similar name.
      const named = scored.some((candidate) => candidate.name >= 0.25);
      const candidates = scored
        .filter((candidate) => !named || candidate.name >= 0.15)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3)
        .map(({ header, confidence, samples }) => ({ header, confidence, samples }));
      const shown = new Set(candidates.map((candidate) => candidate.header));
      const others = free.map(({ header }) => header).filter((header) => !shown.has(header)).slice(0, 120);
      return { source: fingerprint.source, expected: g.group, kind, candidates, others, suggested: null };
    });

  // Pre-select greedily, best match first, so one column is never suggested for two fields.
  const used = new Set<string>();
  const order = fields
    .flatMap((field, fieldIndex) => field.candidates.map((candidate, rank) => ({ field, fieldIndex, candidate, rank })))
    .sort((a, b) => b.candidate.confidence - a.candidate.confidence);
  for (const { field, candidate } of order) {
    if (field.suggested || used.has(candidate.header) || candidate.confidence < SUGGEST_CONFIDENCE) continue;
    const runnerUp = field.candidates.find((other) => other.header !== candidate.header && !used.has(other.header));
    if (runnerUp && candidate.confidence - runnerUp.confidence < SUGGEST_MARGIN) continue;
    field.suggested = candidate.header;
    used.add(candidate.header);
  }
  return fields;
}

/**
 * A review for a file whose required columns are missing; null when nothing can be matched
 * (e.g. a whole sheet is missing, or no column comes close).
 */
export function buildColumnReview(platform: Platform, file: ArrayBuffer): ColumnReview | null {
  const fields: ColumnReviewField[] = [];
  for (const fingerprint of FINGERPRINTS[platform]) {
    const table = readSourceTable(platform, fingerprint.source, file);
    if (!table) return null;
    fields.push(...suggestColumns(fingerprint, table));
  }
  if (fields.length === 0 || fields.some((field) => field.candidates.length + field.others.length === 0)) return null;
  return { platform, formatId: FINGERPRINTS[platform][0]!.id, fields };
}

/** Checks that confirmed aliases only fill missing required columns with columns that exist in the file. */
export function validateAliases(platform: Platform, file: ArrayBuffer, aliases: ColumnAlias[]): ColumnAlias[] {
  const valid: ColumnAlias[] = [];
  for (const alias of aliases) {
    const fingerprint = FINGERPRINTS[platform].find((candidate) => candidate.source === alias.source);
    if (!fingerprint) throw new Error("مطابقة أعمدة غير صالحة: " + alias.source);
    const known = fingerprint.requiredHeaderGroups.some((group) => group.includes(alias.canonical));
    if (!known) throw new Error("مطابقة أعمدة غير صالحة: " + alias.canonical);
    const table = readSourceTable(platform, alias.source, file);
    const headers = new Set((table?.headers ?? []).map(normalizeFormatHeader));
    if (!headers.has(normalizeFormatHeader(alias.observed))) {
      throw new Error("العمود غير موجود في الملف: " + alias.observed);
    }
    valid.push(alias);
  }
  return valid;
}

// ---------------------------------------------------------------- applying aliases

function csvField(value: string): string {
  return '"' + value.replace(/"/g, '""') + '"';
}

function renameRow(headers: string[], aliases: ColumnAlias[]): { renamed: string[]; applied: ColumnAlias[] } {
  const present = new Set(headers.map(normalizeFormatHeader));
  const applied: ColumnAlias[] = [];
  const renamed = [...headers];
  for (const alias of aliases) {
    // Never shadow a column the file already has under the expected name.
    if (present.has(normalizeFormatHeader(alias.canonical))) continue;
    const index = renamed.findIndex((header) => normalizeFormatHeader(header) === normalizeFormatHeader(alias.observed));
    if (index < 0) continue;
    renamed[index] = alias.canonical;
    present.add(normalizeFormatHeader(alias.canonical));
    applied.push(alias);
  }
  return { renamed, applied };
}

/**
 * Renames confirmed columns in the export before analysis. Only header cells change, and only
 * when the expected name is missing, so files in the original format pass through untouched
 * (the same buffer is returned when nothing applies).
 */
export function applyColumnAliases(
  platform: Platform,
  file: ArrayBuffer,
  aliases: ColumnAlias[],
): { file: ArrayBuffer; applied: ColumnAlias[] } {
  if (aliases.length === 0) return { file, applied: [] };
  const applied: ColumnAlias[] = [];

  if (platform === "jahez") {
    const text = new TextDecoder("utf-8").decode(file).replace(/^\uFEFF/, "");
    const matrix = parseJahezCsv(text);
    for (const fingerprint of FINGERPRINTS.jahez) {
      const table = jahezTable(matrix, fingerprint.source);
      if (!table) continue;
      const result = renameRow(matrix[table.headerIndex] ?? [], aliases.filter((alias) => alias.source === fingerprint.source));
      if (result.applied.length === 0) continue;
      matrix[table.headerIndex] = result.renamed;
      applied.push(...result.applied);
    }
    if (applied.length === 0) return { file, applied };
    const csv = matrix.map((row) => row.map(csvField).join(",")).join("\n") + "\n";
    return { file: new TextEncoder().encode(csv).buffer as ArrayBuffer, applied };
  }

  const wb = XLSX.read(file, { type: "array" });
  for (const fingerprint of FINGERPRINTS[platform]) {
    const sheetName = resolveSheetName(wb.SheetNames, fingerprint.source, { platform });
    const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true, blankrows: true });
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    const index = platform === "hungerstation" ? 0 : headerRowIndex(matrix);
    const headers = (matrix[index] ?? []).map((value) => String(value ?? "").trim());
    const result = renameRow(headers, aliases.filter((alias) => alias.source === fingerprint.source));
    for (const alias of result.applied) {
      const column = headers.findIndex((header) => normalizeFormatHeader(header) === normalizeFormatHeader(alias.observed));
      const address = XLSX.utils.encode_cell({ r: range.s.r + index, c: range.s.c + column });
      sheet[address] = { t: "s", v: alias.canonical, w: alias.canonical };
    }
    applied.push(...result.applied);
  }
  if (applied.length === 0) return { file, applied };
  return { file: XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer, applied };
}
