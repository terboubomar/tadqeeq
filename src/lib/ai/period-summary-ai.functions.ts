import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAiServerAuth } from "./auth.server";

import { requireAiEnabled } from "./config.server";
import { summarizePeriodOnServer } from "./period-summary-ai.server";

const requestSchema = z.object({
  periodId: z.string().min(1).max(100),
});

export const summarizePeriodWithAi = createServerFn({ method: "POST" })
  .validator(requestSchema)
  .handler(async ({ data }) => {
    requireAiEnabled();
    const auth = await requireAiServerAuth();
    return summarizePeriodOnServer(data, auth);
  });
