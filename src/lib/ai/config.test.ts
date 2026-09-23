import { describe, expect, test } from "bun:test";

import { isAiServerEnabled } from "./config.server";

describe("AI deployment feature switch", () => {
  test("defaults to enabled for backward compatibility", () => {
    expect(isAiServerEnabled({})).toBe(true);
  });

  test("supports explicit disabled values", () => {
    for (const value of ["false", "0", "off", "no", "disabled"]) {
      expect(isAiServerEnabled({ AI_ENABLED: value })).toBe(false);
    }
  });

  test("supports explicit enable", () => {
    expect(isAiServerEnabled({ AI_ENABLED: "true" })).toBe(true);
  });
});
