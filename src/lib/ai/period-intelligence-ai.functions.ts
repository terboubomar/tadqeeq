import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAiServerAuth } from "./auth.server";

import { requireAiEnabled } from "./config.server";
import { analyzePeriodIntelligenceOnServer } from "./period-intelligence-ai.server";

const requestSchema = z.object({
  currentPeriodId: z.string().min(1).max(100),
  previousPeriodId: z.string().min(1).max(100),
});

export const analyzePeriodIntelligenceWithAi = createServerFn({ method: "POST" })
  .validator(requestSchema)
  .handler(async ({ data }) => {
    requireAiEnabled();
    const auth = await requireAiServerAuth();
    return analyzePeriodIntelligenceOnServer(data, auth);
  });
