import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { askTadqeeqOnServer } from "./analyst-ai.server";
import { analystHistoryMessageSchema } from "./analyst-ai";

const requestSchema = z.object({
  periodId: z.string().min(1).max(100),
  question: z.string().trim().min(2).max(1200),
  history: z.array(analystHistoryMessageSchema).max(8).default([]),
  accessToken: z.string().min(20).max(10_000),
});

export const askTadqeeq = createServerFn({ method: "POST" })
  .validator(requestSchema)
  .handler(async ({ data }) => askTadqeeqOnServer(data));
