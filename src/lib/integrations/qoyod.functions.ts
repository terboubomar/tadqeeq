import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { connectQoyodOnServer, disconnectQoyodOnServer, getIntegrationStatusOnServer, sendJournalsToQoyodOnServer } from "./qoyod.server";

export const getIntegrationStatus = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => getIntegrationStatusOnServer());

export const connectQoyod = createServerFn({ method: "POST" })
  .validator(z.object({ apiKey: z.string().min(8).max(500) }))
  .handler(async ({ data }) => connectQoyodOnServer(data.apiKey));

export const disconnectQoyod = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => disconnectQoyodOnServer());

const amount = z.number().finite().min(0).max(1e10);

export const sendJournalsToQoyod = createServerFn({ method: "POST" })
  .validator(
    z.object({
      periodKey: z.string().min(1).max(64),
      entries: z
        .array(
          z.object({
            key: z.string().min(1).max(200),
            reference: z.string().min(1).max(80),
            description: z.string().min(1).max(300),
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
            lines: z
              .array(z.object({ code: z.string().max(40), name: z.string().max(160), debit: amount, credit: amount, memo: z.string().max(500) }))
              .min(2)
              .max(60),
          }),
        )
        .min(1)
        .max(200),
    }),
  )
  .handler(async ({ data }) => sendJournalsToQoyodOnServer(data.periodKey, data.entries));
