/**
 * Series colours for report charts, in a fixed order: a series keeps its slot (never re-coloured by rank),
 * and anything past the fifth slot folds into OTHER_SERIES_COLOR. Checked with the dataviz palette validator
 * on the white card: lightness band, chroma floor, colour-blind and normal-vision separation of neighbours,
 * and 3:1 contrast all pass.
 */
export const SERIES_COLORS = ["#b66c18", "#316ca5", "#318454", "#855ea1", "#b94642"] as const;

/** Cool grey for "other" / context marks (3:1 on the card, distinct from every series colour). */
export const OTHER_SERIES_COLOR = "#86959c";

export function seriesColor(slot: number): string {
  return SERIES_COLORS[slot] ?? OTHER_SERIES_COLOR;
}

/** One amber hue for heatmaps, light to dark: more is darker. Only the darkest step takes light text. */
export const HEAT_RAMP = ["oklch(0.95 0.035 78)", "oklch(0.88 0.065 74)", "oklch(0.8 0.095 70)", "oklch(0.7 0.12 65)", "oklch(0.58 0.13 60)"] as const;

/** Weekday names, Sunday first (the order of Date#getUTCDay). */
export const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;
export const WEEKDAYS_SHORT = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"] as const;
