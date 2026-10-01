import * as XLSX from "xlsx";

import { analyzeHungerStation } from "../hungerstation";
import { analyzeJahez } from "../jahez";
import { analyzeKeeta } from "../keeta";
import type { AnalysisResult } from "../types";

/** Fixture corpus shared by the regression tests. Paths are relative to the repo root. */
export const FIXTURE_DIRS = {
  hungerstation: "src/lib/analysis/fixtures/hungerstation/hungerstation-orders-v1",
  keeta: "src/lib/analysis/fixtures/keeta/keeta-order-summary-v1",
  jahez: "src/lib/analysis/fixtures/jahez/jahez-financial-report-v1",
} as const;

export type FixturePlatform = keyof typeof FIXTURE_DIRS;

/** Rebuilds the fixture's source file exactly as the platform exports it and runs the engine. */
export async function analyzeFixture(platform: FixturePlatform): Promise<AnalysisResult> {
  const base = FIXTURE_DIRS[platform];

  if (platform === "hungerstation") {
    const source = (await Bun.file(base + "/source.json").json()) as {
      sheetName: string;
      rows: Array<Record<string, unknown>>;
    };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(source.rows), source.sheetName);
    return analyzeHungerStation(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  }

  if (platform === "keeta") {
    const source = (await Bun.file(base + "/source.json").json()) as {
      sheetName: string;
      headers: string[];
      rows: unknown[][];
    };
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
    return analyzeKeeta(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  }

  const text = await Bun.file(base + "/source.csv").text();
  return analyzeJahez(new TextEncoder().encode(text).buffer as ArrayBuffer);
}
