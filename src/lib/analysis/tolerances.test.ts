import { describe, expect, test } from "bun:test";

import {
  DEFAULT_CONTRACT_TOLERANCE,
  DEFAULT_DATA_TOLERANCE,
  HUNGERSTATION_TOLERANCES,
  JAHEZ_TOLERANCES,
  KEETA_TOLERANCES,
} from "./tolerances";

describe("financial tolerance contract", () => {
  test("preserves HungerStation thresholds", () => {
    expect(HUNGERSTATION_TOLERANCES).toEqual({
      commission: 0.05,
      paymentFee: 0.1,
      otherFee: 0.1,
      collections: 0.05,
      creditSales: 0.05,
      rounding: 0.005,
    });
  });

  test("preserves Keeta thresholds", () => {
    expect(KEETA_TOLERANCES).toEqual({
      check: 0.05,
      branchMatch: 0.02,
      branchRounding: 0.06,
    });
  });

  test("preserves Jahez and default thresholds", () => {
    expect(JAHEZ_TOLERANCES).toEqual({
      check: 0.05,
      settlement: 0.01,
      compensation: 0.01,
    });
    expect(DEFAULT_DATA_TOLERANCE).toBe(0.05);
    expect(DEFAULT_CONTRACT_TOLERANCE).toBe(0.1);
  });
});
