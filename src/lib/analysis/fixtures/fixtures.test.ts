import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";

import { analyzeHungerStation } from "../hungerstation";
import { analyzeJahez } from "../jahez";
import { analyzeKeeta } from "../keeta";

type Expected = {
  platform: string;
  formatIds: string[];
  summary: Record<string, number | string | null>;
};

async function expected(path: string): Promise<Expected> {
  return Bun.file(path).json() as Promise<Expected>;
}

function expectSummary(
  actual: Record<string, unknown>,
  wanted: Record<string, number | string | null>,
) {
  for (const [key, value] of Object.entries(wanted)) {
    const current = actual[key];
    if (typeof value === "number") {
      expect(Number(current)).toBeCloseTo(value, 6);
    } else {
      expect(current).toBe(value);
    }
  }
}

describe("platform regression fixture corpus", () => {
  test("HungerStation supported format reproduces expected audit summary", async () => {
    const base =
      "src/lib/analysis/fixtures/hungerstation/hungerstation-orders-v1";
    const source = (await Bun.file(base + "/source.json").json()) as {
      sheetName: string;
      rows: Array<Record<string, unknown>>;
    };
    const wanted = await expected(base + "/expected.json");

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(source.rows),
      source.sheetName,
    );
    const file = XLSX.write(workbook, {
      type: "array",
      bookType: "xlsx",
    }) as ArrayBuffer;

    const result = analyzeHungerStation(file);
    expect(result.platform).toBe(wanted.platform);
    expect(result.formatIds).toEqual(wanted.formatIds);
    expectSummary(
      result.summary as unknown as Record<string, unknown>,
      wanted.summary,
    );
  });

  test("Keeta supported format reproduces expected audit summary", async () => {
    const base = "src/lib/analysis/fixtures/keeta/keeta-order-summary-v1";
    const source = (await Bun.file(base + "/source.json").json()) as {
      sheetName: string;
      headers: string[];
      rows: unknown[][];
    };
    const wanted = await expected(base + "/expected.json");

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        Array(source.headers.length).fill(null),
        Array(source.headers.length).fill(null),
        source.headers,
        ...source.rows,
      ]),
      source.sheetName,
    );
    const file = XLSX.write(workbook, {
      type: "array",
      bookType: "xlsx",
    }) as ArrayBuffer;

    const result = analyzeKeeta(file);
    expect(result.platform).toBe(wanted.platform);
    expect(result.formatIds).toEqual(wanted.formatIds);
    expectSummary(
      result.summary as unknown as Record<string, unknown>,
      wanted.summary,
    );
  });

  test("Jahez supported format reproduces expected audit summary", async () => {
    const base = "src/lib/analysis/fixtures/jahez/jahez-financial-report-v1";
    const text = await Bun.file(base + "/source.csv").text();
    const wanted = await expected(base + "/expected.json");

    const result = analyzeJahez(
      new TextEncoder().encode(text).buffer as ArrayBuffer,
    );
    expect(result.platform).toBe(wanted.platform);
    expect(result.formatIds).toEqual(wanted.formatIds);
    expectSummary(
      result.summary as unknown as Record<string, unknown>,
      wanted.summary,
    );
  });
});
