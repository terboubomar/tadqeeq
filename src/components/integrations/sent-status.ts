import { useQuery } from "@tanstack/react-query";

import type { BranchJournal } from "@/components/journal/journal-export";
import { getSentJournals } from "@/lib/integrations/connections.functions";
import type { SentJournal } from "@/lib/integrations/sendable";

export type { SentJournal };

export const sentJournalsKey = (periodKey: string) => ["journal-sent", periodKey] as const;

/** Which of this period's entries were already sent, and where. */
export function useSentJournals(periodKey: string) {
  return useQuery({ queryKey: sentJournalsKey(periodKey), queryFn: () => getSentJournals({ data: { periodKey } }), retry: false, staleTime: 30_000 });
}

/** The key an entry is sent under: the branch's cost-center key, or its name. */
export function journalEntryKey(journal: BranchJournal): string {
  return journal.costCenterKey ?? journal.branch;
}

/** The sends of one entry, one per system (newest first, as the server returns them). */
export function sentForEntry(sent: SentJournal[], key: string): SentJournal[] {
  const seen = new Set<string>();
  return sent.filter((row) => row.entryKey === key && !seen.has(row.provider) && seen.add(row.provider));
}
