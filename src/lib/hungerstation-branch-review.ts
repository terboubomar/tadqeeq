import type { BranchRow } from "./analysis/types";

export interface HungerStationMappingReviewBranch {
  branch: string;
  branchId: string;
  suggestedInvoiceBranchName?: string;
}

export interface HungerStationMappingReview {
  branches: HungerStationMappingReviewBranch[];
  invoiceBranchNames: string[];
}

function isResidualSuggestion(branch: BranchRow): boolean {
  return Boolean(
    branch.invoiceBranchName &&
      branch.branchId &&
      branch.branchAuditNote?.includes("الفرع المتبقي"),
  );
}

function isUnmatchedOperationalBranch(branch: BranchRow): boolean {
  return Boolean(
    branch.branchId && branch.branchAuditStatus === "unmatched",
  );
}

export function buildHungerStationMappingReview(
  branches: BranchRow[],
): HungerStationMappingReview | null {
  const reviewBranches = branches
    .filter(
      (branch) =>
        isResidualSuggestion(branch) || isUnmatchedOperationalBranch(branch),
    )
    .map((branch) => ({
      branch: branch.branch,
      branchId: branch.branchId,
      ...(isResidualSuggestion(branch) && branch.invoiceBranchName
        ? { suggestedInvoiceBranchName: branch.invoiceBranchName }
        : {}),
    }));

  if (!reviewBranches.length) return null;

  const invoiceBranchNames = [
    ...new Set(
      branches
        .filter(
          (branch) =>
            branch.invoiceBranchName &&
            (isResidualSuggestion(branch) ||
              (branch.branchAuditStatus === "invoice_only" &&
                (branch.orders ?? 0) > 0)),
        )
        .map((branch) => branch.invoiceBranchName!)
        .filter(Boolean),
    ),
  ];

  if (!invoiceBranchNames.length) return null;

  return {
    branches: reviewBranches,
    invoiceBranchNames,
  };
}
