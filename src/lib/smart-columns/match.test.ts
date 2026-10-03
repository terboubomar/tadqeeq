import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import * as XLSX from "xlsx";

import { analyzeHungerStation } from "../analysis/hungerstation";
import { analyzeJahez } from "../analysis/jahez";
import { analyzeKeeta } from "../analysis/keeta";
import { FIXTURE_DIRS } from "../analysis/fixtures/load";
import { UnsupportedFormatError } from "../analysis/formats";
import { applyColumnAliases, buildColumnReview, headerSimilarity, kindFit, validateAliases, type ColumnAlias } from "./match";

function rename<T>(headers: T[], from: Record<string, string>): T[] {
  return headers.map((header) => (typeof header === "string" && from[header] ? (from[header] as T) : header));
}

function keetaFile(renamed: Record<string, string> = {}): ArrayBuffer {
  const source = JSON.parse(readFileSync(FIXTURE_DIRS.keeta + "/source.json", "utf8")) as { sheetName: string; headers: string[]; rows: unknown[][] };
  const workbook = XLSX.utils.book_new();
  const blank = Array(source.headers.length).fill(null);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([blank, blank, rename(source.headers, renamed), ...source.rows]), source.sheetName);
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function hungerFile(renamed: Record<string, string> = {}): ArrayBuffer {
  const source = JSON.parse(readFileSync(FIXTURE_DIRS.hungerstation + "/source.json", "utf8")) as { sheetName: string; rows: Array<Record<string, unknown>> };
  const headers = Object.keys(source.rows[0]!);
  const matrix = [rename(headers, renamed), ...source.rows.map((row) => headers.map((header) => row[header] ?? null))];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), source.sheetName);
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function jahezFile(renamed: Record<string, string> = {}): ArrayBuffer {
  let text = readFileSync(FIXTURE_DIRS.jahez + "/source.csv", "utf8");
  for (const [from, to] of Object.entries(renamed)) text = text.split("," + from + ",").join("," + to + ",");
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function aliasesFrom(review: NonNullable<ReturnType<typeof buildColumnReview>>): ColumnAlias[] {
  return review.fields.map((field) => ({ source: field.source, canonical: field.expected[0]!, observed: field.suggested! }));
}

describe("smart columns", () => {
  test("names are compared by words, trigrams and synonyms", () => {
    expect(headerSimilarity("Commission fee incl. VAT", ["Subtotal of commission fee (VAT included)"])).toBeGreaterThan(0.6);
    expect(headerSimilarity("Outlet name", ["Branch Name"])).toBeGreaterThan(0.9);
    expect(headerSimilarity("Wallet Amount", ["Commission"])).toBeLessThan(0.3);
  });

  test("values are profiled as money, dates, text or IDs", () => {
    expect(kindFit("money", [-17.25, "1,250.50", "(3.00)", null])).toBe(1);
    expect(kindFit("date", ["1 Aug 2026", "2026-08-01", 46000])).toBeCloseTo(2 / 3, 5);
    expect(kindFit("text", ["Delivery Order", "Pickup Order"])).toBe(1);
    expect(kindFit("money", [])).toBe(0);
  });

  test("Keeta: a renamed commission column is suggested, and the mapped file gives the original results", () => {
    const original = analyzeKeeta(keetaFile());
    const changed = keetaFile({ "Subtotal of commission fee (VAT included)": "Commission fee incl. VAT" });
    expect(() => analyzeKeeta(changed)).toThrow(UnsupportedFormatError);

    const review = buildColumnReview("keeta", changed)!;
    expect(review.fields).toHaveLength(1);
    expect(review.fields[0]).toMatchObject({ expected: ["Subtotal of commission fee (VAT included)"], kind: "money", suggested: "Commission fee incl. VAT" });

    const aliases = validateAliases("keeta", changed, aliasesFrom(review));
    const mapped = applyColumnAliases("keeta", changed, aliases);
    expect(mapped.applied).toEqual(aliases);
    expect(analyzeKeeta(mapped.file)).toEqual(original);
  });

  test("HungerStation: two renamed columns are matched to the right fields", () => {
    const original = analyzeHungerStation(hungerFile());
    const changed = hungerFile({ "Branch Name": "Outlet Name", Commission: "Commission Amount" });
    expect(() => analyzeHungerStation(changed)).toThrow(UnsupportedFormatError);

    const review = buildColumnReview("hungerstation", changed)!;
    expect(Object.fromEntries(review.fields.map((f) => [f.expected[0], f.suggested]))).toEqual({
      "Branch Name": "Outlet Name",
      Commission: "Commission Amount",
    });
    const mapped = applyColumnAliases("hungerstation", changed, aliasesFrom(review));
    expect(analyzeHungerStation(mapped.file)).toEqual(original);
  });

  test("Jahez: a renamed column in the order table is matched and the CSV is rebuilt faithfully", () => {
    const original = analyzeJahez(jahezFile());
    const changed = jahezFile({ "Delivery Charge": "Delivery Fee" });
    expect(() => analyzeJahez(changed)).toThrow(UnsupportedFormatError);

    const review = buildColumnReview("jahez", changed)!;
    expect(review.fields.map((f) => [f.source, f.expected[0], f.suggested])).toEqual([["Jahez Order Details", "Delivery Charge", "Delivery Fee"]]);
    const mapped = applyColumnAliases("jahez", changed, aliasesFrom(review));
    expect(analyzeJahez(mapped.file)).toEqual(original);
  });

  test("a column renamed beyond recognition can still be picked from all columns, and is never pre-selected", () => {
    const changed = keetaFile({ "Bank fee (VAT included)": "Col 14" });
    const [field] = buildColumnReview("keeta", changed)!.fields;
    expect([...field!.candidates.map((c) => c.header), ...field!.others]).toContain("Col 14");
    expect(field!.others).not.toContain("Brand Name");
    expect(field!.suggested).toBeNull();
  });

  test("files in the expected format pass through untouched", () => {
    const file = keetaFile();
    const aliases = [{ source: "Order Summary", canonical: "Subtotal of commission fee (VAT included)", observed: "Commission fee incl. VAT" }];
    const result = applyColumnAliases("keeta", file, aliases);
    expect(result.file).toBe(file);
    expect(result.applied).toEqual([]);
  });

  test("an alias never replaces a column the file already has", () => {
    // "Bank fee" exists; an alias pointing another column at it must be ignored.
    const file = keetaFile();
    const result = applyColumnAliases("keeta", file, [{ source: "Order Summary", canonical: "Bank fee (VAT included)", observed: "VAT withholding" }]);
    expect(result.applied).toEqual([]);
  });

  test("confirmed aliases must name a required column and an existing header", () => {
    const changed = keetaFile({ "Subtotal of commission fee (VAT included)": "Commission fee incl. VAT" });
    expect(() => validateAliases("keeta", changed, [{ source: "Order Summary", canonical: "Tips", observed: "Commission fee incl. VAT" }])).toThrow();
    expect(() =>
      validateAliases("keeta", changed, [{ source: "Order Summary", canonical: "Subtotal of commission fee (VAT included)", observed: "Nope" }]),
    ).toThrow();
    expect(() => validateAliases("keeta", changed, [{ source: "Invoice", canonical: "Brand Name", observed: "Brand Name" }])).toThrow();
  });

  test("no review when a whole sheet is missing", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["a", "b"], [1, 2]]), "Other");
    expect(buildColumnReview("keeta", XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer)).toBeNull();
  });
});
