import { describe, expect, test } from "bun:test";

import { isIncompleteDay } from "./completeness";

describe("incomplete daily files", () => {
  test("a file exported before the platform settled most orders is incomplete", () => {
    expect(isIncompleteDay({ orderCount: 1264, unsettledOrderCount: 1044 })).toBe(true);
  });

  test("a few unsettled orders on a busy day are not enough", () => {
    expect(isIncompleteDay({ orderCount: 1300, unsettledOrderCount: 19 })).toBe(false);
    expect(isIncompleteDay({ orderCount: 1300, unsettledOrderCount: 40 })).toBe(false);
  });

  test("files saved before the count existed are treated as complete", () => {
    expect(isIncompleteDay({ orderCount: 1300 })).toBe(false);
  });
});
