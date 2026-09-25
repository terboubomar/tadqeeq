import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { reanalyzePeriodOnServer } from "./reanalyze-period.server";
import { requireWorkspacePermission } from "./server-auth.server";

const requestSchema = z.object({
  periodId: z.string().uuid(),
});

export const reanalyzeAuditPeriod = createServerFn({ method: "POST" })
  .validator(requestSchema)
  .handler(async ({ data }) => {
    await requireWorkspacePermission("periods.reanalyze");
    return reanalyzePeriodOnServer(data.periodId);
  });
