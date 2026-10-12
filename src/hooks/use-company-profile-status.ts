import { useQuery } from "@tanstack/react-query";

import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { getMyOnboarding } from "@/lib/onboarding.functions";
import { needsCompanyProfile } from "@/lib/onboarding";

/**
 * "required" while the owner of a new workspace has not filled in the company details yet, "ok" otherwise, and
 * "loading" while that is being checked. Only new workspaces fetch their onboarding record for this.
 */
export function useCompanyProfileStatus(): "loading" | "required" | "ok" {
  const { context } = useWorkspaceAccess();
  const mayNeed = needsCompanyProfile({
    status: context.onboardingStatus,
    role: context.role,
    isPlatformAdmin: context.isPlatformAdmin,
    legalName: null,
    crNumber: null,
  });
  const query = useQuery({
    queryKey: ["my-onboarding"],
    queryFn: () => getMyOnboarding({ data: {} }),
    enabled: mayNeed,
  });
  if (!mayNeed) return "ok";
  if (!query.data) return query.isError ? "ok" : "loading";
  return needsCompanyProfile({
    status: query.data.status,
    role: context.role,
    isPlatformAdmin: context.isPlatformAdmin,
    legalName: query.data.legalName,
    crNumber: query.data.crNumber,
  })
    ? "required"
    : "ok";
}
