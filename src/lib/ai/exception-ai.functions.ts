import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAiEnabled } from "./config.server";
import { explainExceptionOnServer } from "./exception-ai.server";

const requestSchema = z.object({
  periodId: z.string().min(1).max(100),
  exceptionId: z.string().min(1).max(120),
  accessToken: z.string().min(20).max(10_000),
});

export const explainExceptionWithAi = createServerFn({ method: "POST" })
  .validator(requestSchema)
  .handler(async ({ data }) => {
    requireAiEnabled();
    return explainExceptionOnServer(data);
  });
