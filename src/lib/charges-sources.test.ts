import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { chargeLineSource, DOCUMENTED_CHARGE_LINE_IDS } from "./charges-sources";
import type { MarketplaceChargeLine } from "./charges-mapper";
import type { StoredPeriod } from "./periods";

const PREFIX_IDS = new Set(["hs-unmapped-invoice-extra-"]);

function mapperLineIds(): string[] {
  const source = readFileSync(new URL("./charges-mapper.ts", import.meta.url), "utf8");
  return [...source.matchAll(/id: "([a-z-]+)"/g)].map((match) => match[1]!);
}

const line = (id: string, label = "بند"): MarketplaceChargeLine => ({
  id,
  label,
  category: "unmapped",
  amount: 10,
  scope: "audit_total",
  source: "fallback",
  evidence: "data",
  fundingSource: "unknown",
  mapped: false,
});

const period = { label: "P", summary: { bankRate: 0.02, bankRateSource: "manual" }, branches: [] } as unknown as StoredPeriod;

describe("charge line sources", () => {
  test("every line id the mapper can produce has a documented source", () => {
    const missing = mapperLineIds().filter((id) => !PREFIX_IDS.has(id) && !DOCUMENTED_CHARGE_LINE_IDS.includes(id));
    expect(missing).toEqual([]);
  });

  test("documented sources name a file and say how the amount is computed", () => {
    for (const id of DOCUMENTED_CHARGE_LINE_IDS) {
      const source = chargeLineSource(line(id), period);
      expect(source.file.length).toBeGreaterThan(0);
      expect(source.formula.length).toBeGreaterThan(0);
    }
  });

  test("run-time lines get a specific explanation, not the bare fallback", () => {
    expect(chargeLineSource(line("hs-unmapped-invoice-extra-1", "Printer rental"), period).formula).toContain("Printer rental");
    expect(chargeLineSource(line("keeta-unmapped-reconciliation-residual"), period).file).not.toBe("fallback");
  });

  test("card fee formula shows the contract rate", () => {
    expect(chargeLineSource(line("hs-card-payment-fees"), period).formula).toContain("2.00%");
  });
});
