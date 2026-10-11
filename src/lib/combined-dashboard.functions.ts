import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCombinedDashboardOnServer } from "./combined-dashboard.server";

export const getCombinedDashboard = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(() => getCombinedDashboardOnServer());
