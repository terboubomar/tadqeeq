import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const approveAssistantLink = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ authorizationId: z.string().trim().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { recordAssistantLinkApproval } = await import("./assistant-link.server");
    return recordAssistantLinkApproval(data.authorizationId);
  });
