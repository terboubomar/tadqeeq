export interface PercentRateResult {
  percent: number;
  fraction: number;
}

export class PercentRateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PercentRateError";
  }
}

/**
 * Parse a human-entered percentage such as "2.5" into the fractional rate 0.025.
 * Tadqeeq intentionally rejects fraction-style input such as 0.025 to avoid
 * silently applying a 0.025% fee when the user meant 2.5%.
 */
export function parsePercentRateInput(raw: string): PercentRateResult | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    throw new PercentRateError("أدخل نسبة رسوم الدفع كرقم، مثال: 2.5");
  }

  const percent = Number(normalized);
  if (!Number.isFinite(percent) || percent <= 0) {
    throw new PercentRateError("نسبة رسوم الدفع يجب أن تكون أكبر من 0%.");
  }
  if (percent > 10) {
    throw new PercentRateError("نسبة رسوم الدفع يجب ألا تتجاوز 10%.");
  }
  if (percent < 0.1) {
    throw new PercentRateError(
      "أدخل النسبة كنسبة مئوية مثل 2.5 وليس 0.025. سيتم تفسير 2.5% على أنها 0.025.",
    );
  }

  return {
    percent,
    fraction: percent / 100,
  };
}

export function formatPercentRateInterpretation(result: PercentRateResult): string {
  return (
    result.percent.toLocaleString("en-US", {
      maximumFractionDigits: 4,
    }) +
    "% = " +
    result.fraction.toLocaleString("en-US", {
      maximumFractionDigits: 6,
      useGrouping: false,
    })
  );
}
