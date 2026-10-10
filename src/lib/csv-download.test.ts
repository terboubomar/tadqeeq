import { describe, expect, test } from "bun:test";

import { csvCell, toCsv } from "./csv-download";

describe("csv", () => {
  test("quotes cells that need it and leaves empty values blank", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(1490)).toBe("1490");
  });

  test("starts with a BOM and joins rows", () => {
    expect(toCsv(["العميل", "المبلغ"], [["مطاعم, المذاق", 1490]])).toBe('﻿العميل,المبلغ\n"مطاعم, المذاق",1490');
  });
});
