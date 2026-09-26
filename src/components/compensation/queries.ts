import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { getCompensationCases, getTelegramBranchConnections } from "@/lib/compensation-evidence.functions";

export const COMPENSATION_CASES_KEY = ["compensation-cases"] as const;
export const TELEGRAM_CONNECTIONS_KEY = ["telegram-branch-connections"] as const;

/** All cases for the workspace (capped server-side) — shared by overview and cases pages. */
export function useCompensationCases(enabled = true) {
  return useQuery({
    queryKey: COMPENSATION_CASES_KEY,
    queryFn: () => getCompensationCases({ data: { limit: 5000 } }),
    enabled,
  });
}

export function useTelegramConnections(enabled = true) {
  return useQuery({
    queryKey: TELEGRAM_CONNECTIONS_KEY,
    queryFn: () => getTelegramBranchConnections({ data: {} }),
    enabled,
  });
}

export async function copyText(value: string, label = "تم النسخ") {
  await navigator.clipboard.writeText(value);
  toast.success(label);
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
