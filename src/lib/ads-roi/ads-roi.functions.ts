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

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const label = z.string().max(300);
const amount = z.number().finite().min(-1_000_000_000).max(1_000_000_000);
const count = z.number().finite().min(0).max(10_000_000);

const reportSchema = z.object({
  campaigns: z
    .array(
      z.object({
        date: isoDate,
        restaurantId: label,
        outletName: label,
        campaignId: label,
        clicks: count,
        orders: count.nullable(),
        gmv: amount,
        spent: amount,
        platformRoas: z.number().finite().nullable(),
      }),
    )
    .min(1)
    .max(20_000),
  branchDays: z
    .array(z.object({ date: isoDate, restaurantId: label, outletName: label, orders: count }))
    .max(20_000),
  notes: z
    .array(
      z.object({
        kind: z.enum(["orders_not_split", "orders_missing"]),
        date: isoDate,
        restaurantId: label,
        outletName: label,
      }),
    )
    .max(20_000),
  dateFrom: isoDate,
  dateTo: isoDate,
  packedRows: count,
});

const ordersSchema = z.object({
  stores: z
    .array(
      z.object({
        storeId: label,
        outletName: label,
        orders: count,
        subtotal: amount,
        commission: amount,
        operationalCharges: amount,
        restaurantDiscounts: amount,
      }),
    )
    .max(5_000),
  dateFrom: z.string().max(10),
  dateTo: z.string().max(10),
  cancelledOrders: count,
});

const rate = z.number().finite().min(0).max(0.9999).nullable();

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
