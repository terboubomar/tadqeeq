import { z } from "zod";

/** What the server accepts when an analysis is saved. Must keep every field the readers produce. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const label = z.string().max(300);
const amount = z.number().finite().min(-1_000_000_000).max(1_000_000_000);
const count = z.number().finite().min(0).max(10_000_000);

export const reportSchema = z.object({
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

export const ordersSchema = z.object({
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
        paymentFees: amount.optional(),
        otherFees: amount.optional(),
      }),
    )
    .max(5_000),
  dateFrom: z.string().max(10),
  dateTo: z.string().max(10),
  cancelledOrders: count,
});

export const rate = z.number().finite().min(0).max(0.9999).nullable();
