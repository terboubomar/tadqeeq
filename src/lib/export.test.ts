import { describe, expect, test } from "bun:test";

import * as XLSX from "xlsx";

import { csvSafeText, safeSheetName } from "./export";

describe("csvSafeText", () => {
  test("neutralises text that Excel would run as a formula", () => {
    expect(csvSafeText('=HYPERLINK("https://evil.com","فرع")')).toBe(`'=HYPERLINK("https://evil.com","فرع")`);
    for (const raw of ["+1+1", "-2+3", "@SUM(A1)", "\tx", "\rx"]) expect(csvSafeText(raw).startsWith("'")).toBe(true);
  });

  test("leaves normal text and numbers alone", () => {
    expect(csvSafeText("فرع العليا")).toBe("فرع العليا");
    expect(csvSafeText(-1250.5)).toBe("-1250.5");
    expect(csvSafeText(null)).toBe("");
  });
});

describe("safeSheetName", () => {
  test("never starts or ends with an apostrophe, even after cutting to 31 characters", () => {
    const name = safeSheetName("12 - PAST - Al Mu'tamarat Branch'");
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name.startsWith("'")).toBe(false);
    expect(name.endsWith("'")).toBe(false);
    expect(safeSheetName("3 - PAST - Abhur Ash Shamalya'h")).toBe("3 - PAST - Abhur Ash Shamalya'h");
    expect(safeSheetName("1 - PAST - Abhur Ash Shamalyah'Extra")).toBe("1 - PAST - Abhur Ash Shamalyah");
    expect(safeSheetName("'quoted'")).toBe("quoted");
  });

  test("drops characters Excel forbids and keeps names unique", () => {
    const taken = new Set<string>();
    expect(safeSheetName("a/b:c*d?e[f]g\\h", taken)).toBe("a b c d e f g h");
    expect(safeSheetName("Same", taken)).toBe("Same");
    expect(safeSheetName("same", taken)).toBe("same (2)");
    expect(safeSheetName("''", taken)).toBe("Sheet");
  });

  test("every name it returns is accepted by the xlsx writer", () => {
    const taken = new Set<string>();
    const wb = XLSX.utils.book_new();
    for (const name of ["12 - PAST - Al Mu'tamarat Branch'", "'x", "x'", "a".repeat(40), "a".repeat(40), "[]"]) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["x"]]), safeSheetName(name, taken));
    }
    expect(() => XLSX.write(wb, { type: "array", bookType: "xlsx" })).not.toThrow();
  });
});
