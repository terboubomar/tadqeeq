import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { summarizePeriodOnServer } from "./period-summary-ai.server";

const requestSchema = z.object({
  periodId: z.string().min(1).max(100),
  accessToken: z.string().min(20).max(10_000),
});

export const summarizePeriodWithAi = createServerFn({ method: "POST" })
  .validator(requestSchema)
  .handler(async ({ data }) => summarizePeriodOnServer(data));
