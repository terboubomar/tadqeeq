import { useQuery } from "@tanstack/react-query";

import { getIntegrationStatus } from "@/lib/integrations/qoyod.functions";

export const INTEGRATION_STATUS_KEY = ["integration-status"];

/** Which accounting systems this workspace has connected (never the keys themselves). */
export function useIntegrationStatus() {
  return useQuery({ queryKey: INTEGRATION_STATUS_KEY, queryFn: () => getIntegrationStatus({ data: {} }), retry: false, staleTime: 60_000 });
}
