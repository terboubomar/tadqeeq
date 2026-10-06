import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getJournalAccountsOnServer, saveJournalAccountsOnServer } from "./journal-accounts.server";
import { JOURNAL_ACCOUNT_ORDER } from "./journal-entries";

const accountKey = z.enum(JOURNAL_ACCOUNT_ORDER as [string, ...string[]]);

export const getJournalAccounts = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => getJournalAccountsOnServer());

export const saveJournalAccounts = createServerFn({ method: "POST" })
  .validator(
    z.object({
      accounts: z
        .array(z.object({ key: accountKey, code: z.string().max(40), name: z.string().max(160) }))
        .max(JOURNAL_ACCOUNT_ORDER.length),
    }),
  )
  .handler(async ({ data }) =>
    saveJournalAccountsOnServer(data.accounts as Parameters<typeof saveJournalAccountsOnServer>[0]),
  );
