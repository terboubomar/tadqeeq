import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { analyzePeriodIntelligenceOnServer } from "./period-intelligence-ai.server";

const requestSchema = z.object({
  currentPeriodId: z.string().min(1).max(100),
  previousPeriodId: z.string().min(1).max(100),
  accessToken: z.string().min(20).max(10_000),
});

export const analyzePeriodIntelligenceWithAi = createServerFn({ method: "POST" })
  .validator(requestSchema)
  .handler(async ({ data }) => analyzePeriodIntelligenceOnServer(data));
