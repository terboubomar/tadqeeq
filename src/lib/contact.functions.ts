import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { submitContactMessageOnServer } from "./contact.server";

/** Public: no sign-in. Validation and limits run on the server (src/lib/contact.server.ts). */
export const submitContactMessage = createServerFn({ method: "POST" })
  .validator(
    z.object({
      topic: z.string().max(20),
      name: z.string().max(200),
      company: z.string().max(300),
      email: z.string().max(300),
      mobile: z.string().max(40),
      message: z.string().max(4000),
      website: z.string().max(200).optional(),
    }),
  )
  .handler(({ data }) => submitContactMessageOnServer(data));
