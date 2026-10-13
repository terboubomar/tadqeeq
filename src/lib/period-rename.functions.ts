import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { listPeriodRenamesOnServer, renamePeriodOnServer } from "./period-rename.server";

export const renamePeriod = createServerFn({ method: "POST" })
  .validator(z.object({ periodId: z.string().uuid(), label: z.string().trim().min(1).max(120) }))
  .handler(({ data }) => renamePeriodOnServer(data.periodId, data.label));

export const listPeriodRenames = createServerFn({ method: "GET" })
  .validator(z.object({ periodId: z.string().uuid() }))
  .handler(({ data }) => listPeriodRenamesOnServer(data.periodId));
