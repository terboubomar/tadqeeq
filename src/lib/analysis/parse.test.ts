import { describe, expect, test } from "bun:test";

import { ParseError, assertDateInRange, parseAmount, parseDate } from "./parse";

describe("parseAmount", () => {
  test("parses accounting parentheses as a negative amount", () => {
    expect(parseAmount("(1,234.50)")).toBe(-1234.5);
  });

  test("parses Arabic-Indic digits and Arabic separators", () => {
    expect(parseAmount("١٬٢٣٤٫٥٠")).toBe(1234.5);
  });

  test("parses Eastern Arabic digits, currency labels and bidi marks", () => {
    expect(parseAmount("\u200fSAR ۱٬۲۳۴٫۵۰\u200e")).toBe(1234.5);
    expect(parseAmount("١٢٣٫٤٥ ر.س")).toBe(123.45);
  });

  test("keeps normal negative values negative", () => {
    expect(parseAmount("-1,234.50")).toBe(-1234.5);
  });

  test("allows an empty value only when the caller declares it optional", () => {
    expect(parseAmount(null, { optional: true })).toBe(0);
    expect(() => parseAmount(null)).toThrow(ParseError);
  });

  test("fails loudly on unparseable required values with source context", () => {
    try {
      parseAmount("not-a-number", {
        platform: "keeta",
        sheet: "Order Summary",
        row: 7,
        column: "Payable to merchant",
      });
      throw new Error("expected ParseError");
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as Error).message).toContain("Order Summary");
      expect((error as Error).message).toContain("Payable to merchant");
      expect((error as ParseError).raw).toBe("not-a-number");
    }
  });
});


describe("parseDate", () => {
  test("parses ISO dates and timestamps without guessing", () => {
    expect(parseDate("2026-08-31 23:59:00", { order: "ISO" })).toBe("2026-08-31");
    expect(parseDate("2026/08/31", { order: "ISO" })).toBe("2026-08-31");
  });

  test("parses DMY and MDY only according to the declared source format", () => {
    expect(parseDate("31/08/2026 11:59 PM", { order: "DMY" })).toBe("2026-08-31");
    expect(parseDate("8/1/2026 2:13", { order: "MDY" })).toBe("2026-08-01");
    expect(parseDate("1 Aug 2026", { order: "DMY" })).toBe("2026-08-01");
  });

  test("uses local calendar fields for Date objects instead of UTC conversion", () => {
    const value = new Date(2026, 7, 31, 0, 30, 0);
    expect(parseDate(value, { order: "ISO" })).toBe("2026-08-31");
  });

  test("parses Arabic-Indic digits and bidi marks in dates", () => {
    expect(parseDate("\u200f٣١/٠٨/٢٠٢٦\u200e", { order: "DMY" })).toBe("2026-08-31");
  });

  test("fails loudly on invalid or unexpected date formats", () => {
    expect(() =>
      parseDate("31/08/2026", { order: "ISO" }, {
        platform: "hungerstation",
        sheet: "Commissionable GMV",
        column: "Operation Day",
      }),
    ).toThrow(ParseError);

    expect(() => parseDate("31/02/2026", { order: "DMY" })).toThrow(ParseError);
    expect(() => parseDate("garbage", { order: "DMY" })).toThrow(ParseError);
  });

  test("asserts normalized dates remain inside the report range", () => {
    expect(() =>
      assertDateInRange(
        "2026-09-05",
        "2026-08-01",
        "2026-08-31",
        { platform: "jahez", sheet: "Jahez Order Details", column: "Date" },
      ),
    ).toThrow(ParseError);

    expect(() =>
      assertDateInRange(
        "2026-09-01",
        "2026-08-01",
        "2026-08-31",
        { platform: "jahez" },
      ),
    ).not.toThrow();
  });
});
