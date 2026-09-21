import { describe, expect, test } from "bun:test";

import { ParseError } from "./parse";
import { resolveSheetName } from "./sheets";

describe("resolveSheetName", () => {
  test("prefers a case-insensitive exact match before partial matches", () => {
    expect(
      resolveSheetName(
        ["Orders Summary", "Orders", "Other"],
        "orders",
        { platform: "keeta" },
      ),
    ).toBe("Orders");
  });

  test("accepts one unambiguous partial match", () => {
    expect(
      resolveSheetName(
        ["1 Commissionable GMV", "2 Free Delivery Orders"],
        "commissionable gmv",
        { platform: "hungerstation" },
      ),
    ).toBe("1 Commissionable GMV");
  });

  test("fails loudly when multiple partial sheets match", () => {
    try {
      resolveSheetName(
        ["1 Orders Detail", "2 Orders Summary"],
        "orders",
        { platform: "hungerstation" },
      );
      throw new Error("expected ParseError");
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as Error).message).toContain("1 Orders Detail");
      expect((error as Error).message).toContain("2 Orders Summary");
    }
  });
});
