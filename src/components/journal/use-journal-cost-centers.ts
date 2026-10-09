import { useQuery } from "@tanstack/react-query";

import { getJournalCostCenters } from "@/lib/journal-cost-centers.functions";
import type { JournalPlatform, SavedCostCenters } from "@/lib/journal-cost-centers";

export const journalCostCentersKey = (platform: JournalPlatform | undefined) => ["journal-cost-centers", platform];

/** The workspace's branch cost centers for one platform; empty while loading or before migration 0055. */
export function useJournalCostCenters(platform: JournalPlatform | undefined): SavedCostCenters {
  const { data } = useQuery({
    queryKey: journalCostCentersKey(platform),
    queryFn: () => getJournalCostCenters({ data: { platform: platform! } }),
    enabled: Boolean(platform),
    retry: false,
  });
  return data ?? {};
}
