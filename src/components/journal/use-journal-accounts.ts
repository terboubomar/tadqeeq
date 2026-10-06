import { useQuery } from "@tanstack/react-query";

import { getJournalAccounts } from "@/lib/journal-accounts.functions";
import { resolveJournalAccounts, type JournalAccounts } from "@/lib/journal-entries";

export const JOURNAL_ACCOUNTS_KEY = ["journal-accounts"];

/** The workspace's chart of accounts merged over the defaults; defaults while loading or before migration 0047. */
export function useJournalAccounts(): JournalAccounts {
  const { data } = useQuery({ queryKey: JOURNAL_ACCOUNTS_KEY, queryFn: () => getJournalAccounts({ data: {} }), retry: false });
  return resolveJournalAccounts(data ?? {});
}
