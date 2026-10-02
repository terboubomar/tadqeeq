import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  deleteAdsRoiAnalysisOnServer,
  getAdsRoiAnalysisOnServer,
  getAdsRoiSettingsOnServer,
  listAdsRoiAnalysesOnServer,
  saveAdsRoiAnalysisOnServer,
  saveAdsRoiSettingsOnServer,
} from "./ads-roi.server";
import { ordersSchema, rate, reportSchema } from "./schemas";

export const listAdsRoiAnalyses = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => listAdsRoiAnalysesOnServer());

export const getAdsRoiAnalysis = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => getAdsRoiAnalysisOnServer(data.id));

export const saveAdsRoiAnalysis = createServerFn({ method: "POST" })
  .validator(
    z.object({
      report: reportSchema,
      orders: ordersSchema.nullable(),
      sourceFileName: z.string().max(255).nullable(),
      ordersFileName: z.string().max(255).nullable(),
    }),
  )
  .handler(async ({ data }) => saveAdsRoiAnalysisOnServer(data));

export const deleteAdsRoiAnalysis = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => deleteAdsRoiAnalysisOnServer(data.id));

export const getAdsRoiSettings = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => getAdsRoiSettingsOnServer());

export const saveAdsRoiSettings = createServerFn({ method: "POST" })
  .validator(
    z.object({
      brands: z
        .array(z.object({ brandKey: z.string().trim().min(1).max(120), commissionRate: rate, foodCostRate: rate }))
        .max(200),
    }),
  )
  .handler(async ({ data }) => saveAdsRoiSettingsOnServer(data.brands));
