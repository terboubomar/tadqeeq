import type { BranchRow } from "./analysis/types";

export type JournalPlatform = "hungerstation" | "keeta" | "jahez";

/** Branch cost center codes by branch key (migration 0055). */
export type SavedCostCenters = Record<string, string>;

/**
 * The key a branch's cost center is saved under: the platform's branch ID, or its name when the file gave no ID.
 * Use the branch row as the analysis stored it, not a copy renamed for display.
 */
export function costCenterKey(branch: Pick<BranchRow, "branchId" | "branch">): string {
  const id = String(branch.branchId ?? "").trim();
  return (id || "name:" + String(branch.branch ?? "").trim()).slice(0, 200);
}
