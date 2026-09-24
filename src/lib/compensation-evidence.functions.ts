import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  configureTelegramWebhookOnServer,
  createTelegramBranchConnectionOnServer,
  getBranchNameOptionsOnServer,
  getEvidenceMediaOnServer,
  getTelegramIntegrationStatusOnServer,
  listCompensationCasesOnServer,
  listTelegramBranchConnectionsOnServer,
  saveCompensationCaseOnServer,
  searchCompensationEvidenceOnServer,
  setTelegramBranchConnectionActiveOnServer,
} from "./compensation-evidence.server";

const platform = z.enum(["hungerstation", "keeta", "jahez"]);
const caseStatus = z.enum([
  "draft",
  "ready",
  "submitted",
  "accepted",
  "rejected",
  "recovered",
  "closed",
]);

export const getTelegramBranchConnections = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => listTelegramBranchConnectionsOnServer());

export const createTelegramBranchConnection = createServerFn({ method: "POST" })
  .validator(
    z.object({
      branchName: z.string().trim().min(1).max(160),
    }),
  )
  .handler(async ({ data }) =>
    createTelegramBranchConnectionOnServer(data.branchName),
  );

export const setTelegramBranchConnectionActive = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().uuid(),
      active: z.boolean(),
    }),
  )
  .handler(async ({ data }) =>
    setTelegramBranchConnectionActiveOnServer(data.id, data.active),
  );

export const getTelegramIntegrationStatus = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => getTelegramIntegrationStatusOnServer());

export const configureTelegramWebhook = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => configureTelegramWebhookOnServer());

export const searchCompensationEvidence = createServerFn({ method: "POST" })
  .validator(
    z.object({
      orderNumber: z.string().trim().min(3).max(120),
    }),
  )
  .handler(async ({ data }) =>
    searchCompensationEvidenceOnServer(data.orderNumber),
  );

export const saveCompensationCase = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().uuid().optional(),
      periodId: z.string().uuid().nullable().optional(),
      evidenceId: z.string().uuid().nullable().optional(),
      platform,
      orderNumber: z.string().trim().min(3).max(120),
      branchName: z.string().trim().max(160).nullable().optional(),
      compensationAmount: z.number().finite().nonnegative().max(1_000_000_000),
      compensationReason: z.string().trim().min(1).max(1000),
      employeeExplanation: z.string().trim().min(1).max(6000),
      status: caseStatus.optional(),
      aggregatorCaseReference: z.string().trim().max(160).nullable().optional(),
    }),
  )
  .handler(async ({ data }) => saveCompensationCaseOnServer(data));

export const getCompensationCases = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => listCompensationCasesOnServer());

export const getEvidenceMedia = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => getEvidenceMediaOnServer(data.id));
