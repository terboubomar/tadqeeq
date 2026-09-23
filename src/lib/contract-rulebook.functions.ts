import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  approveContractVersionOnServer,
  createContractOnServer,
  createContractVersionOnServer,
  deleteContractRuleOnServer,
  listContractRulebookOnServer,
  saveContractRuleOnServer,
  uploadContractDocumentOnServer,
} from "./contract-rulebook.server";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const contractSchema = z.object({
  platform: z.enum(["hungerstation", "keeta", "jahez"]),
  name: z.string().trim().min(1).max(160),
  externalReference: z.string().max(160).nullish(),
  counterparty: z.string().max(160).nullish(),
});

const versionSchema = z.object({
  contractId: uuid,
  effectiveFrom: isoDate,
  effectiveTo: isoDate.nullish(),
  sourceNote: z.string().max(1000).nullish(),
});

const ruleSchema = z.object({
  id: uuid.optional(),
  contractId: uuid,
  versionId: uuid,
  ruleKey: z.string().trim().min(1).max(120),
  ruleType: z.enum([
    "commission_rate",
    "payment_fee",
    "wallet_fee",
    "minimum_fee",
    "delivery_fee",
    "promotion_funding",
    "free_delivery_funding",
    "advertising_fee",
    "refund_rule",
    "tax_rule",
    "other_fee",
  ]),
  valueKind: z.enum(["percentage", "amount", "boolean", "text"]),
  numericValue: z.number().finite().nullish(),
  textValue: z.string().max(1000).nullish(),
  currency: z.string().max(3).nullish(),
  fundingSource: z
    .enum(["platform", "merchant", "shared", "unknown"])
    .nullish(),
  scopeType: z.enum(["all", "branch"]),
  scopeKey: z.string().max(160).nullish(),
  notes: z.string().max(1000).nullish(),
});

const ruleIdentitySchema = z.object({
  contractId: uuid,
  versionId: uuid,
  ruleId: uuid,
});

const versionIdentitySchema = z.object({
  contractId: uuid,
  versionId: uuid,
});

export const getContractRulebook = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => listContractRulebookOnServer());

export const createContract = createServerFn({ method: "POST" })
  .validator(contractSchema)
  .handler(async ({ data }) => createContractOnServer(data));

export const createContractVersion = createServerFn({ method: "POST" })
  .validator(versionSchema)
  .handler(async ({ data }) => createContractVersionOnServer(data));

export const saveContractRule = createServerFn({ method: "POST" })
  .validator(ruleSchema)
  .handler(async ({ data }) => saveContractRuleOnServer(data));

export const deleteContractRule = createServerFn({ method: "POST" })
  .validator(ruleIdentitySchema)
  .handler(async ({ data }) => deleteContractRuleOnServer(data));

export const approveContractVersion = createServerFn({ method: "POST" })
  .validator(versionIdentitySchema)
  .handler(async ({ data }) => approveContractVersionOnServer(data));


export const uploadContractDocument = createServerFn({ method: "POST" })
  .validator((data) => {
    if (!(data instanceof FormData)) {
      throw new Error("بيانات مستند العقد غير صالحة.");
    }
    return data;
  })
  .handler(async ({ data }) => uploadContractDocumentOnServer(data));
