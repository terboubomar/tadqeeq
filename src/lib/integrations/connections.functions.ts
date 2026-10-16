import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { connectOnServer, disconnectOnServer, getIntegrationStatusOnServer, sendJournalsOnServer } from "./connections.server";
import { daftraSite } from "./daftra";

const provider = z.enum(["qoyod", "daftra"]);

export const getIntegrationStatus = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => getIntegrationStatusOnServer());

export const connectAccounting = createServerFn({ method: "POST" })
  .validator(z.object({ provider, apiKey: z.string().min(8).max(500), site: z.string().max(300).optional() }))
  .handler(async ({ data }) =>
    connectOnServer(data.provider, data.apiKey, data.provider === "daftra" ? daftraSite(data.site ?? "") : null),
  );

export const disconnectAccounting = createServerFn({ method: "POST" })
  .validator(z.object({ provider }))
  .handler(async ({ data }) => disconnectOnServer(data.provider));

const amount = z.number().finite().min(0).max(1e10);

export const sendJournals = createServerFn({ method: "POST" })
  .validator(
    z.object({
      provider,
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
  .handler(async ({ data }) => sendJournalsOnServer(data.provider, data.periodKey, data.entries));
