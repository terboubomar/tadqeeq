export interface MonthToDateForecast {
  charges: number | null;
  settlement: number | null;
  missingDays: number[];
}

const rounded = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function forecastFromCompleteMonthToDate({
  businessDates,
  daysInMonth,
  chargesToDate,
  settlementToDate,
}: {
  businessDates: Iterable<string>;
  daysInMonth: number;
  chargesToDate: number;
  settlementToDate: number;
}): MonthToDateForecast {
  const coveredDays = new Set(
    [...businessDates]
      .map((date) => Number(date.slice(-2)))
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= daysInMonth),
  );
  if (coveredDays.size === 0) return { charges: null, settlement: null, missingDays: [] };

  const latestDay = Math.max(...coveredDays);
  const missingDays = Array.from({ length: latestDay }, (_, index) => index + 1).filter(
    (day) => !coveredDays.has(day),
  );
  if (missingDays.length > 0) return { charges: null, settlement: null, missingDays };

  return {
    charges: rounded((chargesToDate / latestDay) * daysInMonth),
    settlement: rounded((settlementToDate / latestDay) * daysInMonth),
    missingDays: [],
  };
}
