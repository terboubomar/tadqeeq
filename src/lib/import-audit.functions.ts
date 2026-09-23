import { createServerFn } from "@tanstack/react-start";

import { importAuditOnServer } from "./import-audit.server";

export const importAuditPeriod = createServerFn({ method: "POST" })
  .validator((data) => {
    if (!(data instanceof FormData)) {
      throw new Error("بيانات رفع فترة التدقيق غير صالحة.");
    }
    return data;
  })
  .handler(async ({ data }) => importAuditOnServer(data));
