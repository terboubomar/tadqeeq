/**
 * Central financial tolerances.
 *
 * These values preserve the current audited behavior. Changing any value here
 * is an accounting-engine behavior change and requires fixtures, regression
 * evidence, real-file comparison, and an engine-version bump once versioning is active.
 */
export const DEFAULT_DATA_TOLERANCE = 0.05;
export const DEFAULT_CONTRACT_TOLERANCE = 0.1;

export const HUNGERSTATION_TOLERANCES = {
  commission: 0.05,
  paymentFee: 0.1,
  otherFee: 0.1,
  collections: 0.05,
  creditSales: 0.05,
  rounding: 0.005,
} as const;

export const KEETA_TOLERANCES = {
  check: 0.05,
  branchMatch: 0.02,
  branchRounding: 0.06,
} as const;

export const JAHEZ_TOLERANCES = {
  check: 0.05,
  settlement: 0.01,
  compensation: 0.01,
} as const;
