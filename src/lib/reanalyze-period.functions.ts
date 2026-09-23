import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { reanalyzePeriodOnServer } from "./reanalyze-period.server";

const inputSchema = z.object({
  periodId: z.string().uuid(),
});

export const reanalyzePeriod = createServerFn({ method: "POST" })
  .validator((data) => inputSchema.parse(data))
  .handler(async ({ data }) => reanalyzePeriodOnServer(data.periodId));
