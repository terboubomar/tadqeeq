import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAiServerAuth } from "./auth.server";

import { requireAiEnabled } from "./config.server";
import { askTadqeeqOnServer } from "./analyst-ai.server";
import { analystHistoryMessageSchema } from "./analyst-ai";

const requestSchema = z.object({
  periodId: z.string().min(1).max(100),
  question: z.string().trim().min(2).max(1200),
  currentRoute: z.string().trim().min(1).max(200).default("/dashboard"),
  history: z.array(analystHistoryMessageSchema).max(8).default([]),
});

export const askTadqeeq = createServerFn({ method: "POST" })
  .validator(requestSchema)
  .handler(async ({ data }) => {
    requireAiEnabled();
    const auth = await requireAiServerAuth();
    return askTadqeeqOnServer(data, auth);
  });
