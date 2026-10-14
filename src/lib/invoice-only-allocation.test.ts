import { describe, expect, test } from "bun:test";

import { invoiceOnlyAllocation } from "./invoice-only-allocation";
import type { StoredPeriod } from "./periods";

/** HS-2026/9-4871148: printers on three branches, subscription on one, free-delivery fee in the summary only. */
const period = {
  platform: "hungerstation",
  summary: { invoiceOnlyExtras: 2287.83 },
  invoice: {
    branches: [
      { branch: "PAST - al mazrua", invoiceOnlyItems: [{ label: "Printers", amount: 500 }] },
      { branch: "PAST - Al Hamadaniyah", invoiceOnlyItems: [{ label: "Printers", amount: 500 }] },
      { branch: "PAST - Al Khubar Ash shamaliyah", invoiceOnlyItems: [{ label: "Printers", amount: 500 }] },
      { branch: "Motto - Uhud", invoiceOnlyItems: [{ label: "Monthly subscription fees", amount: 200 }] },
      { branch: "PAST - Uhud", invoiceOnlyCharges: 0 },
    ],
    unallocatedCharges: [{ label: "Free Delivery fee campaign Charges", amount: 587.83 }],
  },
} as unknown as StoredPeriod;

describe("invoiceOnlyAllocation", () => {
  test("branch charges plus platform-level ones reconcile to the invoice-only total", () => {
    const allocation = invoiceOnlyAllocation(period);
    expect(allocation.allocated).toBe(1700);
    expect(allocation.unallocated).toBe(587.83);
    expect(allocation.total).toBe(2287.83);
    expect(allocation.residual).toBe(0);
    expect(allocation.rows.filter((row) => row.rule === "direct")).toHaveLength(4);
    expect(allocation.rows.find((row) => row.rule === "platform_level")).toMatchObject({ branch: null, amount: 587.83 });
  });

  test("an unexplained gap is shown as a residual", () => {
    const short = { ...period, summary: { invoiceOnlyExtras: 2300 } } as unknown as StoredPeriod;
    expect(invoiceOnlyAllocation(short).residual).toBe(12.17);
  });

  test("no invoice-only charges, no rows", () => {
    expect(invoiceOnlyAllocation({ platform: "keeta", summary: {}, invoice: {} } as unknown as StoredPeriod).rows).toEqual([]);
  });
});
