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
