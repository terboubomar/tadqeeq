import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getOperationMonthOnServer, importOperationFileOnServer } from "./operations.server";

export const importOperationFile = createServerFn({ method: "POST" })
  .validator((data) => {
    if (!(data instanceof FormData)) throw new Error("بيانات رفع العمليات غير صالحة.");
    return data;
  })
  .handler(({ data }) => importOperationFileOnServer(data));

export const getOperationMonth = createServerFn({ method: "POST" })
  .validator(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
  .handler(({ data }) => getOperationMonthOnServer(data.month));
