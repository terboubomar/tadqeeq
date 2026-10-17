import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { connectOnServer, disconnectOnServer, getIntegrationStatusOnServer, getSentJournalsOnServer, sendJournalsOnServer } from "./connections.server";
import { daftraSite } from "./daftra";
import { odooDatabase, odooSite } from "./odoo";
import { finishQuickBooksConnectOnServer, startQuickBooksConnectOnServer } from "./quickbooks-connect.server";
import { finishZohoConnectOnServer, startZohoConnectOnServer } from "./zoho-connect.server";

const provider = z.enum(["qoyod", "daftra", "zoho", "odoo", "quickbooks"]);
const keyProvider = z.enum(["qoyod", "daftra", "odoo"]);

export const getIntegrationStatus = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => getIntegrationStatusOnServer());

/** The entries this period has already sent to accounting systems. */
export const getSentJournals = createServerFn({ method: "POST" })
  .validator(z.object({ periodKey: z.string().min(1).max(64) }))
  .handler(async ({ data }) => getSentJournalsOnServer(data.periodKey));

export const connectAccounting = createServerFn({ method: "POST" })
  .validator(
    z.object({
      provider: keyProvider,
      apiKey: z.string().min(8).max(500),
      site: z.string().max(300).optional(),
      database: z.string().max(100).optional(),
      login: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const key = data.apiKey.trim();
    if (key.length < 8) throw new Error("ألصق مفتاح API كاملاً.");
    if (data.provider === "odoo") {
      const site = odooSite(data.site ?? "");
      const login = (data.login ?? "").trim();
      if (!login) throw new Error("اكتب اسم الدخول إلى Odoo (عادة بريدك).");
      const secret = JSON.stringify({ apiKey: key, database: odooDatabase(site, data.database), login });
      return connectOnServer("odoo", secret, key.slice(-4), site);
    }
    return connectOnServer(data.provider, key, key.slice(-4), data.provider === "daftra" ? daftraSite(data.site ?? "") : null);
  });

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
            costCenter: z.string().max(100).optional(),
            platform: z.enum(["hungerstation", "keeta", "jahez"]).optional(),
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

/**
 * Zoho Books and QuickBooks sign in instead of pasting a key: start returns the system's approval page, finish takes
 * the code it sends back to /integrations (the signed state says which system it was).
 */
export const startSignInConnect = createServerFn({ method: "POST" })
  .validator(z.object({ provider: z.enum(["zoho", "quickbooks"]) }))
  .handler(async ({ data }) => (data.provider === "quickbooks" ? startQuickBooksConnectOnServer() : startZohoConnectOnServer()));

export const finishSignInConnect = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z.string().min(10).max(1000),
      state: z.string().min(10).max(1000),
      accountsServer: z.string().max(100).optional(),
      realmId: z.string().max(40).optional(),
    }),
  )
  .handler(async ({ data }) => (data.realmId ? finishQuickBooksConnectOnServer(data) : finishZohoConnectOnServer(data)));
