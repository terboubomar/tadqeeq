import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getJournalCostCentersOnServer, saveJournalCostCentersOnServer } from "./journal-cost-centers.server";

const platform = z.enum(["hungerstation", "keeta", "jahez"]);

export const getJournalCostCenters = createServerFn({ method: "POST" })
  .validator(z.object({ platform }))
  .handler(async ({ data }) => getJournalCostCentersOnServer(data.platform));

export const saveJournalCostCenters = createServerFn({ method: "POST" })
  .validator(
    z.object({
      platform,
      branches: z
        .array(z.object({ key: z.string().min(1).max(200), name: z.string().max(200), costCenter: z.string().max(60) }))
        .max(500),
    }),
  )
  .handler(async ({ data }) => saveJournalCostCentersOnServer(data.platform, data.branches));
