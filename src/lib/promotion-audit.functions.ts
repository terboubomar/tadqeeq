import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  deletePromotionAuditOnServer,
  listPromotionAuditsOnServer,
  savePromotionAuditOnServer,
} from "./promotion-audit.server";
import { requireWorkspacePermission } from "./server-auth.server";

const money = z.number().finite().nonnegative().max(1_000_000_000);
const optionalRoas = z.number().finite().nonnegative().max(100_000).nullable().optional();

export const getPromotionAudits = createServerFn({ method: "POST" })
  .validator(
    z.object({
      periodId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    await requireWorkspacePermission("financials.read");
    return listPromotionAuditsOnServer(data.periodId);
  });

export const savePromotionAudit = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().uuid().optional(),
      periodId: z.string().uuid(),
      name: z.string().trim().min(1).max(160),
      campaignRevenue: money,
      organicBaseline: money,
      restaurantFundedDiscount: money,
      platformFundedDiscount: money,
      unknownFundedDiscount: money,
      advertisingSpend: money,
      commissionFees: money,
      paymentFees: money,
      deliveryCampaignFees: money,
      otherMarketplaceFees: money,
      cogsAmount: money,
      platformRoas: optionalRoas,
      notes: z.string().max(4000).nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireWorkspacePermission("imports.create");
    return savePromotionAuditOnServer(data);
  });

export const deletePromotionAudit = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().uuid(),
      periodId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    await requireWorkspacePermission("imports.create");
    return deletePromotionAuditOnServer(data);
  });
