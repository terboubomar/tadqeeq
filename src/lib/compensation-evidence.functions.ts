import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  configureTelegramWebhookOnServer,
  createTelegramBranchConnectionOnServer,
  listBranchNameOptionsOnServer,
  getEvidenceMediaOnServer,
  getTelegramIntegrationStatusOnServer,
  listCompensationCasesOnServer,
  listTelegramBranchConnectionsOnServer,
  saveCompensationCaseOnServer,
  searchCompensationEvidenceOnServer,
  setTelegramBranchConnectionActiveOnServer,
} from "./compensation-evidence.server";
import { requireWorkspacePermission } from "./server-auth.server";

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

export const getBranchNameOptions = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => {
    await requireWorkspacePermission("branches.read");
    return listBranchNameOptionsOnServer();
  });

export const getTelegramBranchConnections = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => {
    await requireWorkspacePermission("telegram.read");
    return listTelegramBranchConnectionsOnServer();
  });

export const createTelegramBranchConnection = createServerFn({ method: "POST" })
  .validator(
    z.object({
      branchId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) =>
    createTelegramBranchConnectionOnServer(data.branchId),
  );

export const setTelegramBranchConnectionActive = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().uuid(),
      active: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    await requireWorkspacePermission("telegram.manage");
    return setTelegramBranchConnectionActiveOnServer(data.id, data.active);
  });

export const getTelegramIntegrationStatus = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => {
    await requireWorkspacePermission("telegram.read");
    return getTelegramIntegrationStatusOnServer();
  });

export const configureTelegramWebhook = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => {
    await requireWorkspacePermission("telegram.manage");
    return configureTelegramWebhookOnServer();
  });

export const searchCompensationEvidence = createServerFn({ method: "POST" })
  .validator(
    z.object({
      orderNumber: z.string().trim().min(3).max(120),
    }),
  )
  .handler(async ({ data }) => {
    await requireWorkspacePermission("compensation.read");
    return searchCompensationEvidenceOnServer(data.orderNumber);
  });

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
  .handler(async ({ data }) => {
    await requireWorkspacePermission("compensation.manage");
    return saveCompensationCaseOnServer(data);
  });

export const getCompensationCases = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => {
    await requireWorkspacePermission("compensation.read");
    return listCompensationCasesOnServer();
  });

export const getEvidenceMedia = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireWorkspacePermission("telegram.read");
    return getEvidenceMediaOnServer(data.id);
  });
