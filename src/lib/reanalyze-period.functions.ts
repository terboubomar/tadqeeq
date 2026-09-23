import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { reanalyzePeriodOnServer } from "./reanalyze-period.server";

const requestSchema = z.object({
  periodId: z.string().uuid(),
});

export const reanalyzeAuditPeriod = createServerFn({ method: "POST" })
  .validator(requestSchema)
  .handler(async ({ data }) => reanalyzePeriodOnServer(data.periodId));
