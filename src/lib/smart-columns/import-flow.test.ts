import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import * as XLSX from "xlsx";

import { FIXTURE_DIRS } from "../analysis/fixtures/load";
import { analyzeKeeta } from "../analysis/keeta";
import type { ServerUserClient } from "../server-auth.server";

const { buildAnalysis, ColumnReviewRequired } = await import("../import-audit.server");

function keetaFile(renamed: Record<string, string> = {}): File {
  const source = JSON.parse(readFileSync(FIXTURE_DIRS.keeta + "/source.json", "utf8")) as { sheetName: string; headers: string[]; rows: unknown[][] };
  const workbook = XLSX.utils.book_new();
  const blank = Array(source.headers.length).fill(null);
  const headers = source.headers.map((header) => renamed[header] ?? header);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([blank, blank, headers, ...source.rows]), source.sheetName);
  return new File([XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer], "keeta.xlsx");
}

/** A client whose stored matches are the given rows (the only query this path makes for Keeta). */
function clientWith(rows: unknown[]): ServerUserClient {
  const query = { select: () => query, eq: () => query, then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }) };
  return { from: () => query } as unknown as ServerUserClient;
}

function form(file: File, aliases?: unknown): FormData {
  const data = new FormData();
  data.set("platform", "keeta");
  data.set("dataFile", file);
  if (aliases) data.set("columnAliases", JSON.stringify(aliases));
  return data;
}

const RENAMED = { "Subtotal of commission fee (VAT included)": "Commission fee incl. VAT" };
const ALIAS = { source: "Order Summary", canonical: "Subtotal of commission fee (VAT included)", observed: "Commission fee incl. VAT" };

describe("smart columns in the import flow", () => {
  test("a renamed column asks for confirmation instead of failing", async () => {
    const error = await buildAnalysis(form(keetaFile(RENAMED)), "keeta", clientWith([]), "owner", "workspace", {}).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ColumnReviewRequired);
    expect((error as InstanceType<typeof ColumnReviewRequired>).review.fields[0]?.suggested).toBe("Commission fee incl. VAT");
  });

  test("confirmed and stored matches give the same audit as the original file, and the source file is kept as uploaded", async () => {
    const original = analyzeKeeta(await keetaFile().arrayBuffer());
    const file = keetaFile(RENAMED);

    const confirmed = await buildAnalysis(form(file, [ALIAS]), "keeta", clientWith([]), "owner", "workspace", {});
    expect(confirmed.result).toEqual(original);
    expect(confirmed.confirmedAliases).toEqual([ALIAS]);
    const kept = new Uint8Array(await confirmed.sources[0]!.file.arrayBuffer());
    expect(kept).toEqual(new Uint8Array(await file.arrayBuffer()));

    const stored = await buildAnalysis(form(file), "keeta", clientWith([ALIAS]), "owner", "workspace", {});
    expect(stored.result).toEqual(original);
    expect(stored.confirmedAliases).toEqual([]);
    expect(stored.appliedAliases).toEqual([ALIAS]);
  });

  test("a match pointing at a column that is not in the file is refused", async () => {
    const bad = { ...ALIAS, observed: "Missing column" };
    await expect(buildAnalysis(form(keetaFile(RENAMED), [bad]), "keeta", clientWith([]), "owner", "workspace", {})).rejects.toThrow("العمود غير موجود");
  });
});
