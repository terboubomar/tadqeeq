import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isValidCr, isValidNationalId, isValidVat, normalizeSaudiMobile } from "./onboarding";
import * as S from "./ops.server";

const empty = z.object({}).optional();
const cycle = z.enum(["monthly", "yearly"]);
const role = z.enum(["owner", "finance", "sales", "support"]);
const subStatus = z.enum(["trial", "active", "overdue", "cancelled", "suspended"]);
const onbStatus = z.enum(["pending_details", "meeting_booked", "awaiting_payment", "onboarding", "active", "suspended"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getRequestHost = createServerFn({ method: "GET" }).handler(() => S.getRequestHostOnServer());

export const getOpsMe = createServerFn({ method: "POST" }).validator(empty).handler(() => S.getOpsMeOnServer());
export const getOpsOverview = createServerFn({ method: "POST" }).validator(empty).handler(() => S.getOpsOverviewOnServer());
export const getOpsRevenue = createServerFn({ method: "POST" }).validator(empty).handler(() => S.getOpsRevenueOnServer());
export const getOpsClientProfile = createServerFn({ method: "POST" })
  .validator(z.object({ workspaceId: z.string().uuid() }))
  .handler(({ data }) => S.getOpsClientProfileOnServer(data.workspaceId));
export const resetMemberTwoFactor = createServerFn({ method: "POST" })
  .validator(z.object({ workspaceId: z.string().uuid(), membershipId: z.string().uuid() }))
  .handler(({ data }) => S.resetMemberTwoFactorOnServer(data));
export const listContactMessages = createServerFn({ method: "POST" }).validator(empty).handler(() => S.listContactMessagesOnServer());
export const setContactMessageHandled = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), handled: z.boolean() }))
  .handler(({ data }) => S.setContactMessageHandledOnServer(data));
export const getOpsTasks =createServerFn({ method: "POST" }).validator(empty).handler(() => S.getOpsTasksOnServer());
export const listOpsClients =createServerFn({ method: "POST" }).validator(empty).handler(() => S.listOpsClientsOnServer());
export const setOpsClientStatus = createServerFn({ method: "POST" })
  .validator(
    z.object({
      workspaceId: z.string().uuid(),
      status: onbStatus,
      adminNote: z.string().max(2000).optional(),
      reason: z.enum(["payment", "request", "other"]).optional(),
      clientMessage: z.string().max(500).optional(),
    }),
  )
  .handler(({ data }) => S.setOpsClientStatusOnServer(data));
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));
const checked = (max: number, valid: (v: string) => boolean, message: string) =>
  optionalText(max).refine((v) => v === null || valid(v), { message });

export const updateOpsClient = createServerFn({ method: "POST" })
  .validator(
    z.object({
      workspaceId: z.string().uuid(),
      name: z.string().trim().min(1, "اسم الشركة مطلوب").max(120),
      legalName: optionalText(200),
      brandName: optionalText(120),
      crNumber: checked(20, isValidCr, "رقم السجل التجاري غير صحيح (10 أرقام)."),
      vatNumber: checked(20, isValidVat, "الرقم الضريبي غير صحيح (15 رقماً)."),
      contactName: optionalText(120),
      contactMobile: optionalText(20)
        .refine((v) => v === null || normalizeSaudiMobile(v) !== null, { message: "رقم الجوال غير صحيح." })
        .transform((v) => (v === null ? null : normalizeSaudiMobile(v))),
      contactEmail: checked(200, (v) => z.string().email().safeParse(v).success, "البريد الإلكتروني غير صحيح."),
      contactNationalId: checked(20, isValidNationalId, "رقم الهوية غير صحيح."),
      branchCount: z.number().int().min(0).max(100_000).nullable(),
      adminNote: optionalText(2000),
    }),
  )
  .handler(({ data }) => S.updateOpsClientOnServer(data));
export const setOpsClientArchived = createServerFn({ method: "POST" })
  .validator(z.object({ workspaceId: z.string().uuid(), archived: z.boolean() }))
  .handler(({ data }) => S.setOpsClientArchivedOnServer(data));
export const deleteOpsClient = createServerFn({ method: "POST" })
  .validator(z.object({ workspaceId: z.string().uuid(), confirmName: z.string().max(200) }))
  .handler(({ data }) => S.deleteOpsClientOnServer(data));
export const listDeletedOpsClients = createServerFn({ method: "POST" }).validator(empty).handler(() => S.listDeletedOpsClientsOnServer());
export const listClientNotes = createServerFn({ method: "POST" })
  .validator(z.object({ workspaceId: z.string().uuid() }))
  .handler(({ data }) => S.listClientNotesOnServer(data.workspaceId));
export const addClientNote = createServerFn({ method: "POST" })
  .validator(z.object({ workspaceId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }))
  .handler(({ data }) => S.addClientNoteOnServer(data));

export const listPlans = createServerFn({ method: "POST" }).validator(empty).handler(() => S.listPlansOnServer());
export const savePlan = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120), price: z.number().min(0).max(10_000_000), cycle, active: z.boolean(), features: z.array(z.enum(["invoice_audit", "exceptions", "compensation", "contracts", "ai"])), uploadLimit: z.number().int().min(0).max(100_000).nullable(), description: z.string().trim().max(300).optional(), highlighted: z.boolean().optional(), sortOrder: z.number().int().min(0).max(1000).optional(), orderLimit: z.number().int().min(0).max(100_000_000).nullable().optional(), priceYearly: z.number().min(0).max(100_000_000).nullable().optional(), customPrice: z.boolean().optional(), workspaceLimit: z.number().int().min(1).max(10_000).nullable().optional() }))
  .handler(({ data }) => S.savePlanOnServer(data));
export const listSubscriptions = createServerFn({ method: "POST" }).validator(empty).handler(() => S.listSubscriptionsOnServer());
export const saveSubscription = createServerFn({ method: "POST" })
  .validator(z.object({
    id: z.string().uuid().optional(), workspaceId: z.string().uuid(), planId: z.string().uuid().nullable(), price: z.number().min(0).max(100_000_000),
    branchCount: z.number().int().min(1).max(5000), cycle, status: subStatus, startsOn: date, endsOn: date.nullable(), notes: z.string().max(2000).optional(),
    addons: z.array(z.enum(["compensation_ai"])).optional(),
  }))
  .handler(({ data }) => S.saveSubscriptionOnServer(data));

export const workspaceOrderUsage = createServerFn({ method: "POST" }).validator(empty).handler(() => S.workspaceOrderUsageOnServer());
export const listPlanRequests = createServerFn({ method: "POST" }).validator(empty).handler(() => S.listPlanRequestsOnServer());

export const listPayments = createServerFn({ method: "POST" }).validator(empty).handler(() => S.listPaymentsOnServer());
export const recordPayment = createServerFn({ method: "POST" })
  .validator(z.object({ workspaceId: z.string().uuid(), amount: z.number().positive().max(100_000_000), paidOn: date, reference: z.string().max(200).optional(), notes: z.string().max(2000).optional(), receiptDataUrl: z.string().max(7_500_000).optional() }))
  .handler(({ data }) => S.recordPaymentOnServer(data));
export const deletePayment = createServerFn({ method: "POST" }).validator(z.object({ id: z.string().uuid() })).handler(({ data }) => S.deletePaymentOnServer(data.id));
export const getReceiptUrl = createServerFn({ method: "POST" }).validator(z.object({ id: z.string().uuid() })).handler(({ data }) => S.getReceiptUrlOnServer(data.id));

export const getOpsUsage = createServerFn({ method: "POST" }).validator(empty).handler(() => S.getOpsUsageOnServer());
export const getOpsLogs = createServerFn({ method: "POST" }).validator(empty).handler(() => S.getOpsLogsOnServer());

export const listOpsStaff = createServerFn({ method: "POST" }).validator(empty).handler(() => S.listOpsStaffOnServer());
export const addOpsStaff = createServerFn({ method: "POST" })
  .validator(z.object({ email: z.string().trim().email().max(320), fullName: z.string().max(160).optional(), role, password: z.string().max(128).optional() }))
  .handler(({ data }) => S.addOpsStaffOnServer(data));
export const removeOpsStaff = createServerFn({ method: "POST" }).validator(z.object({ userId: z.string().uuid() })).handler(({ data }) => S.removeOpsStaffOnServer(data.userId));
