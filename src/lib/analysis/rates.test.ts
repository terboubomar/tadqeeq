import { describe, expect, test } from "bun:test";

import {
  PercentRateError,
  formatPercentRateInterpretation,
  parsePercentRateInput,
} from "./rates";

describe("parsePercentRateInput", () => {
  test("converts human percent input to a fractional rate", () => {
    expect(parsePercentRateInput("2.5")).toEqual({
      percent: 2.5,
      fraction: 0.025,
    });
    expect(parsePercentRateInput("2,5")?.fraction).toBe(0.025);
  });

  test("returns null when the optional rate is left blank", () => {
    expect(parsePercentRateInput("   ")).toBeNull();
  });

  test("rejects fraction-style input that is likely entered at the wrong scale", () => {
    expect(() => parsePercentRateInput("0.025")).toThrow(PercentRateError);
    expect(() => parsePercentRateInput("0.025")).toThrow("2.5");
  });

  test("rejects zero, negative, non-numeric, and implausibly high percentages", () => {
    for (const value of ["0", "-2.5", "abc", "10.01"]) {
      expect(() => parsePercentRateInput(value)).toThrow(PercentRateError);
    }
  });

  test("shows the exact interpretation before analysis", () => {
    const result = parsePercentRateInput("2.5");
    if (!result) throw new Error("expected rate");
    expect(formatPercentRateInterpretation(result)).toBe("2.5% = 0.025");
  });
});
