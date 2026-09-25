import { createServerFn } from "@tanstack/react-start";

import { importAuditOnServer } from "./import-audit.server";
import { requireWorkspacePermission } from "./server-auth.server";

export const importAuditPeriod = createServerFn({ method: "POST" })
  .validator((data) => {
    if (!(data instanceof FormData)) {
      throw new Error("بيانات رفع فترة التدقيق غير صالحة.");
    }
    return data;
  })
  .handler(async ({ data }) => {
    await requireWorkspacePermission("imports.create");
    return importAuditOnServer(data);
  });
