import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

import { analyzeAdsRoi } from "./analysis";
import { adsRoiExportFileName, buildAdsRoiWorkbook } from "./export";
import { readCsvText } from "./read-file";
import { parseHsAdsReport } from "./reports";

const report = parseHsAdsReport(readCsvText(readFileSync(join(import.meta.dir, "fixtures/hungerstation-ads.csv"), "utf8")).rows);
const result = analyzeAdsRoi({ report, settings: { ALPHA: { commissionRate: 0.15, foodCostRate: 0.3 } } });
const meta = { sourceFileName: "ads.csv", ordersFileName: null };

function roundTrip(book: XLSX.WorkBook): XLSX.WorkBook {
  return XLSX.read(XLSX.write(book, { type: "array", bookType: "xlsx" }), { type: "array" });
}

describe("Excel export", () => {
  test("the full report has a summary, campaigns, branches and budget shifts, right to left", () => {
    const book = roundTrip(buildAdsRoiWorkbook(result, meta, "full"));
    expect(book.SheetNames).toEqual(["الملخص", "الحملات", "الفروع", "نقل الميزانية"]);
    expect(book.Workbook?.Views?.[0]?.RTL).toBe(true);
  });

  test("money stays a number, so it can be summed in Excel", () => {
    const book = roundTrip(buildAdsRoiWorkbook(result, meta, "campaigns"));
    expect(book.SheetNames).toEqual(["الحملات"]);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets["الحملات"]!);
    expect(rows).toHaveLength(26);
    const spent = rows.reduce((sum, row) => sum + Number(row["الإنفاق"]), 0);
    expect(spent).toBeCloseTo(result.totals.spent, 2);
    expect(typeof rows[0]!["الربح بعد الإعلان"]).toBe("number");
    expect(rows[0]!["التوصية"]).toBe("أوقفها");
  });

  test("the summary carries the headline numbers", () => {
    const book = roundTrip(buildAdsRoiWorkbook(result, meta, "full"));
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets["الملخص"]!, { header: 1 });
    const value = (label: string) => rows.find((row) => row[0] === label)?.[1];
    expect(value("الإنفاق الإعلاني")).toBeCloseTo(2953.48, 2);
    expect(value("الربح بعد الإعلان")).toBeCloseTo(result.totals.profit, 2);
    expect(value("حملات تخسر")).toBe(result.verdict.loss.campaigns);
    expect(value("الفترة")).toBe("01/08/2026");
  });

  test("file names say what is inside", () => {
    expect(adsRoiExportFileName(result, "full")).toBe("tadqeeq-ads-roi-report-2026-08-01.xlsx");
    expect(adsRoiExportFileName({ ...result, dateTo: "2026-08-28" }, "branches")).toBe("tadqeeq-ads-roi-branches-2026-08-01_2026-08-28.xlsx");
  });
});
