import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { listBranchRegistry, resolveBranchName } from "./branch-registry";
import { displayBranchName } from "./reporting-metrics";

const REGISTRY_PLATFORMS = ["hungerstation", "keeta", "jahez"] as const;
type RegistryPlatform = (typeof REGISTRY_PLATFORMS)[number];

/**
 * The name to show for a platform branch: its unified name from the branch registry (so the same branch reads the
 * same on every platform), else the platform name without emoji and promo text. People without branch access, or a
 * registry that fails to load, get the cleaned platform name.
 */
export function useBranchLabel() {
  const { data: registry = [] } = useQuery({ queryKey: ["branch-registry"], queryFn: listBranchRegistry, retry: false, staleTime: 60_000 });
  return useCallback(
    (platform: string, branchId: unknown, raw: string | null | undefined) => {
      const unified = (REGISTRY_PLATFORMS as readonly string[]).includes(platform)
        ? resolveBranchName(registry, platform as RegistryPlatform, branchId, raw)
        : null;
      return unified ?? displayBranchName(raw);
    },
    [registry],
  );
}
