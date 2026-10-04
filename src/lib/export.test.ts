import { describe, expect, test } from "bun:test";

import { csvSafeText } from "./export";

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
