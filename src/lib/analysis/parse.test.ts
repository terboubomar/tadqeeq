import { describe, expect, test } from "bun:test";

import { ParseError, parseAmount } from "./parse";

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
