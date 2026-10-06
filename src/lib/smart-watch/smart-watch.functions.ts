import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { WatchMetric } from "./detect";
import {
  acceptSmartWatchAlertOnServer,
  listSmartWatchAcceptancesOnServer,
  undoSmartWatchAcceptanceOnServer,
} from "./smart-watch.server";

const platform = z.enum(["hungerstation", "keeta", "jahez", "ninja"]);
const metric = z.enum(["commission", "payment_fees", "delivery", "compensation", "total_cost"]) satisfies z.ZodType<WatchMetric>;
const branchKey = z.string().trim().min(1).max(300);
const rate = z.number().finite().min(0).max(10);

export const listSmartWatchAcceptances = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => listSmartWatchAcceptancesOnServer());

export const acceptSmartWatchAlert = createServerFn({ method: "POST" })
  .validator(
    z.object({
      platform,
      branchKey,
      branchName: z.string().max(300),
      metric,
      acceptedRate: rate,
      typicalRate: rate,
      periodId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => acceptSmartWatchAlertOnServer(data));

export const undoSmartWatchAcceptance = createServerFn({ method: "POST" })
  .validator(z.object({ platform, branchKey, metric }))
  .handler(async ({ data }) => undoSmartWatchAcceptanceOnServer(data));
