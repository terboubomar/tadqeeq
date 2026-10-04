import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  getMyOnboardingOnServer,
  getMyPlanRequestOnServer,
  requestPlanOnServer,
  listTenantsOnServer,
  requestReactivationOnServer,
  setTenantStatusOnServer,
  submitOnboardingOnServer,
} from "./onboarding.server";

export const getMyOnboarding = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => getMyOnboardingOnServer());

export const submitOnboarding = createServerFn({ method: "POST" })
  .validator(
    z.object({
      legalName: z.string().trim().min(1).max(200),
      brandName: z.string().trim().min(1).max(160),
      crNumber: z.string().max(20),
      vatNumber: z.string().max(20),
      contactName: z.string().trim().min(1).max(160),
      contactMobile: z.string().max(20),
      contactNationalId: z.string().max(20),
      contactEmail: z.string().trim().email().max(320),
      branchCount: z.number().int().min(1).max(5000),
      meetingAt: z.string().max(40),
      meetingNote: z.string().max(1000).optional(),
      logoDataUrl: z.string().max(3_000_000).optional(),
    }),
  )
  .handler(async ({ data }) => submitOnboardingOnServer(data));

export const requestReactivation = createServerFn({ method: "POST" })
  .validator(z.object({ note: z.string().max(1000).optional() }))
  .handler(async ({ data }) => requestReactivationOnServer(data));

export const getMyPlanRequest = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => getMyPlanRequestOnServer());

export const requestPlan = createServerFn({ method: "POST" })
  .validator(
    z.object({
      planId: z.string().uuid(),
      cycle: z.enum(["monthly", "yearly"]),
      addons: z.array(z.enum(["compensation_ai"])).max(1),
    }),
  )
  .handler(async ({ data }) => requestPlanOnServer(data));

export const listTenants =createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => listTenantsOnServer());

export const setTenantStatus = createServerFn({ method: "POST" })
  .validator(
    z.object({
      workspaceId: z.string().uuid(),
      status: z.enum(["pending_details", "meeting_booked", "awaiting_payment", "onboarding", "active", "suspended"]),
      adminNote: z.string().max(2000).optional(),
    }),
  )
  .handler(async ({ data }) => setTenantStatusOnServer(data));
