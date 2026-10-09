import { describe, expect, test } from "bun:test";

import { costCenterKey } from "./journal-cost-centers";

describe("cost center key", () => {
  test("the platform's branch ID, or the name when the file gave no ID", () => {
    expect(costCenterKey({ branchId: " 500007 ", branch: "PAST - Uhud" })).toBe("500007");
    expect(costCenterKey({ branchId: "", branch: "فرع في الفاتورة فقط" })).toBe("name:فرع في الفاتورة فقط");
  });
});
