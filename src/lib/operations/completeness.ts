import type { OperationImportSummary } from "./types";

/** At least this many unsettled orders, and this share of the day's orders, before a day counts as incomplete. */
const MIN_UNSETTLED = 20;
const MIN_SHARE = 0.05;

/**
 * True when a day's file was exported before the platform settled it: many delivered orders have sales but no
 * commission and no earnings yet, so its cost and payout are understated until the file is exported again.
 */
export function isIncompleteDay(summary: Pick<OperationImportSummary, "orderCount" | "unsettledOrderCount">): boolean {
  const unsettled = summary.unsettledOrderCount ?? 0;
  return unsettled >= MIN_UNSETTLED && unsettled >= summary.orderCount * MIN_SHARE;
}
