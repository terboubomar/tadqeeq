import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import * as S from "./ops.server";

const empty = z.object({}).optional();
const cycle = z.enum(["monthly", "yearly"]);
const role = z.enum(["owner", "finance", "sales", "support"]);
const subStatus = z.enum(["trial", "active", "overdue", "cancelled", "suspended"]);
const onbStatus = z.enum(["pending_details", "meeting_booked", "awaiting_payment", "onboarding", "active", "suspended"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getRequestHost = createServerFn({ method: "GET" }).handler(async () => getRequestHeader("host") ?? "");

export const getOpsMe = createServerFn({ method: "POST" }).inputValidator(empty).handler(() => S.getOpsMeOnServer());
export const getOpsOverview = createServerFn({ method: "POST" }).inputValidator(empty).handler(() => S.getOpsOverviewOnServer());
export const listOpsClients = createServerFn({ method: "POST" }).inputValidator(empty).handler(() => S.listOpsClientsOnServer());
export const setOpsClientStatus = createServerFn({ method: "POST" })
  .inputValidator(z.object({ workspaceId: z.string().uuid(), status: onbStatus, adminNote: z.string().max(2000).optional() }))
  .handler(({ data }) => S.setOpsClientStatusOnServer(data));
export const listClientNotes = createServerFn({ method: "POST" })
  .inputValidator(z.object({ workspaceId: z.string().uuid() }))
  .handler(({ data }) => S.listClientNotesOnServer(data.workspaceId));
export const addClientNote = createServerFn({ method: "POST" })
  .inputValidator(z.object({ workspaceId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }))
  .handler(({ data }) => S.addClientNoteOnServer(data));

export const listPlans = createServerFn({ method: "POST" }).inputValidator(empty).handler(() => S.listPlansOnServer());
export const savePlan = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120), pricing: z.enum(["fixed", "per_branch"]), price: z.number().min(0).max(10_000_000), cycle, active: z.boolean() }))
  .handler(({ data }) => S.savePlanOnServer(data));
export const listSubscriptions = createServerFn({ method: "POST" }).inputValidator(empty).handler(() => S.listSubscriptionsOnServer());
export const saveSubscription = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    id: z.string().uuid().optional(), workspaceId: z.string().uuid(), planId: z.string().uuid().nullable(), price: z.number().min(0).max(100_000_000),
    branchCount: z.number().int().min(1).max(5000), cycle, status: subStatus, startsOn: date, endsOn: date.nullable(), notes: z.string().max(2000).optional(),
  }))
  .handler(({ data }) => S.saveSubscriptionOnServer(data));

export const listPayments = createServerFn({ method: "POST" }).inputValidator(empty).handler(() => S.listPaymentsOnServer());
export const recordPayment = createServerFn({ method: "POST" })
  .inputValidator(z.object({ workspaceId: z.string().uuid(), amount: z.number().positive().max(100_000_000), paidOn: date, reference: z.string().max(200).optional(), notes: z.string().max(2000).optional(), receiptDataUrl: z.string().max(7_500_000).optional() }))
  .handler(({ data }) => S.recordPaymentOnServer(data));
export const deletePayment = createServerFn({ method: "POST" }).inputValidator(z.object({ id: z.string().uuid() })).handler(({ data }) => S.deletePaymentOnServer(data.id));
export const getReceiptUrl = createServerFn({ method: "POST" }).inputValidator(z.object({ id: z.string().uuid() })).handler(({ data }) => S.getReceiptUrlOnServer(data.id));

export const getOpsUsage = createServerFn({ method: "POST" }).inputValidator(empty).handler(() => S.getOpsUsageOnServer());
export const getOpsLogs = createServerFn({ method: "POST" }).inputValidator(empty).handler(() => S.getOpsLogsOnServer());

export const listOpsStaff = createServerFn({ method: "POST" }).inputValidator(empty).handler(() => S.listOpsStaffOnServer());
export const addOpsStaff = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().trim().email().max(320), fullName: z.string().max(160).optional(), role, password: z.string().max(128).optional() }))
  .handler(({ data }) => S.addOpsStaffOnServer(data));
export const removeOpsStaff = createServerFn({ method: "POST" }).inputValidator(z.object({ userId: z.string().uuid() })).handler(({ data }) => S.removeOpsStaffOnServer(data.userId));
