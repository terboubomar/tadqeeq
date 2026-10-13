import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  deleteOperationImportOnServer,
  getOperationHourlyOnServer,
  getOperationImportDetailOnServer,
  getOperationMonthOnServer,
  importOperationFileOnServer,
} from "./operations.server";

export const importOperationFile = createServerFn({ method: "POST" })
  .validator((data) => {
    if (!(data instanceof FormData)) throw new Error("بيانات رفع العمليات غير صالحة.");
    return data;
  })
  .handler(({ data }) => importOperationFileOnServer(data));

export const getOperationMonth = createServerFn({ method: "POST" })
  .validator(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
  .handler(({ data }) => getOperationMonthOnServer(data.month));

export const deleteOperationImport = createServerFn({ method: "POST" })
  .validator(z.object({ importId: z.string().uuid() }))
  .handler(({ data }) => deleteOperationImportOnServer(data.importId));

export const getOperationImportDetail = createServerFn({ method: "POST" })
  .validator(
    z.object({
      importId: z.string().uuid(),
      platform: z.enum(["hungerstation", "keeta", "jahez"]),
      page: z.number().int().min(1).max(10_000),
      pageSize: z.number().int().min(10).max(100),
      search: z.string().max(120).optional(),
      filter: z.enum(["all", "cancelled", "complaints", "refunds"]).optional(),
      branchId: z.string().max(200).optional(),
      branchName: z.string().max(200).optional(),
    }),
  )
  .handler(({ data }) => getOperationImportDetailOnServer(data));

export const getOperationHourly = createServerFn({ method: "POST" })
  .validator(
    z.object({
      platform: z.enum(["hungerstation", "keeta", "jahez"]),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      branchId: z.string().max(200).optional(),
      branchName: z.string().max(200).optional(),
    }),
  )
  .handler(({ data }) => getOperationHourlyOnServer(data));
