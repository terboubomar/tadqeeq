import { z } from "zod";

import {
  CONTRACT_FUNDING_SOURCES,
  CONTRACT_RULE_TYPES,
  type ContractFundingSource,
  type ContractPlatform,
  type ContractRuleType,
  type ContractScopeType,
  type ContractValueKind,
} from "./contract-rulebook";

/**
 * Reading a platform contract into draft terms. Tadqeeq AI reads the document and reports each fee as written;
 * this module turns that report into draft rules on the basis Tadqeeq's contract check compares against (with or
 * without VAT), in plain code so the conversion is the same every time. Nothing is saved until the person
 * reviews the terms and adds them to a draft version, which they then approve as usual.
 */

export const CONTRACT_READING_PROMPT_VERSION = "contract-reading-v2";

/** One fee as the contract states it. */
export const contractTermSchema = z.object({
  ruleType: z.enum(CONTRACT_RULE_TYPES),
  /** Short English key, e.g. "commission_rate", "free_delivery_funding_35_plus". */
  ruleKey: z.string(),
  valueKind: z.enum(["percentage", "amount", "text"]),
  value: z.number().nullable(),
  textValue: z.string().nullable(),
  /** Whether the contract says the value includes VAT; null when it does not say. */
  vatIncluded: z.boolean().nullable(),
  fundingSource: z.enum(CONTRACT_FUNDING_SOURCES),
  scopeType: z.enum(["all", "branch"]),
  scopeKey: z.string().nullable(),
  /** Arabic, a few words. */
  label: z.string(),
  /** The contract's own words for this term (short excerpt). */
  quote: z.string(),
  /** Arabic: conditions, order-value range, dates. */
  notes: z.string(),
});

export const contractReadingSchema = z.object({
  platform: z.enum(["hungerstation", "keeta", "jahez", "unknown"]),
  /** Arabic, a short name for the contract, e.g. «اتفاقية تاجر كيتا». */
  contractTitle: z.string(),
  /** The agreement number printed on the contract. */
  reference: z.string().nullable(),
  /** The platform's legal name as printed. */
  counterparty: z.string().nullable(),
  effectiveFrom: z.string().nullable(),
  effectiveTo: z.string().nullable(),
  /** Arabic, two or three sentences. */
  summary: z.string(),
  /** Arabic: dates when a discounted rate ends, unclear or contradictory clauses. */
  warnings: z.array(z.string()),
  terms: z.array(contractTermSchema),
});

export type ContractReading = z.infer<typeof contractReadingSchema>;
export type ContractTerm = z.infer<typeof contractTermSchema>;

/** The JSON schema sent to the model (strict structured output). */
export const CONTRACT_READING_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["platform", "contractTitle", "reference", "counterparty", "effectiveFrom", "effectiveTo", "summary", "warnings", "terms"],
  properties: {
    platform: { type: "string", enum: ["hungerstation", "keeta", "jahez", "unknown"] },
    contractTitle: { type: "string" },
    reference: { type: ["string", "null"] },
    counterparty: { type: ["string", "null"] },
    effectiveFrom: { type: ["string", "null"], description: "YYYY-MM-DD" },
    effectiveTo: { type: ["string", "null"], description: "YYYY-MM-DD" },
    summary: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
    terms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ruleType", "ruleKey", "valueKind", "value", "textValue", "vatIncluded", "fundingSource", "scopeType", "scopeKey", "label", "quote", "notes"],
        properties: {
          ruleType: { type: "string", enum: [...CONTRACT_RULE_TYPES] },
          ruleKey: { type: "string" },
          valueKind: { type: "string", enum: ["percentage", "amount", "text"] },
          value: { type: ["number", "null"] },
          textValue: { type: ["string", "null"] },
          vatIncluded: { type: ["boolean", "null"] },
          fundingSource: { type: "string", enum: [...CONTRACT_FUNDING_SOURCES] },
          scopeType: { type: "string", enum: ["all", "branch"] },
          scopeKey: { type: ["string", "null"] },
          label: { type: "string" },
          quote: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
  },
};

export const CONTRACT_READING_SYSTEM_PROMPT = [
  "You read restaurant contracts with delivery platforms (HungerStation, Keeta, Jahez) in Saudi Arabia for Tadqeeq, an invoice audit app.",
  "Report every fee and charge exactly as the contract states it. Never invent, estimate or average a value. If a value is unclear, leave it out of terms and add a warning.",
  "ruleType: commission_rate for the commission % on orders (if the contract splits it into parts that add up to a total commission, report the TOTAL commission as one commission_rate term and explain the parts in notes); payment_fee for card/bank/electronic payment fees; wallet_fee for wallet payment fees; minimum_fee for a minimum fee per order; delivery_fee for distance or delivery fees charged to the restaurant; free_delivery_funding for amounts the restaurant funds for delivery discounts or free delivery per order; promotion_funding for other merchant-funded promotions; advertising_fee; tax_rule for how VAT applies; other_fee for anything else (POS devices, photography, pickup commission).",
  "Use the commission that applies during the contract's effective dates. When a discounted or preferential rate ends on a date, report the discounted rate as the term and add a warning with the end date and the rate after it.",
  "Tiered amounts (for example by order value) are separate terms with keys that say the tier, e.g. free_delivery_funding_25_35 and free_delivery_funding_35_plus, with the range in notes.",
  "Pickup or drive-thru commission is other_fee with key pickup_commission_rate, not commission_rate.",
  "vatIncluded: true only if the contract says the value includes VAT (e.g. 'fees are inclusive of taxes'), false if it says it excludes VAT, otherwise null.",
  "fundingSource: who pays the term (merchant for fees the restaurant pays).",
  "Percentages as numbers like 16 for 16%. Amounts in SAR as numbers.",
  "Dates as YYYY-MM-DD. Flag in warnings any date that looks wrong (a period that starts and ends on the same day, an end before the start).",
  "contractTitle: a short Arabic name for the contract (for example «اتفاقية تاجر كيتا»). reference: the agreement number as printed, or null. counterparty: the platform company's legal name as printed, or null.",
  "summary, label, notes and warnings in Arabic. quote is a short excerpt of the contract's own words (any language).",
].join("\n");

/**
 * The VAT basis Tadqeeq's contract check compares each rate on: Keeta's checks use charges before VAT, Jahez's
 * commission is defined including VAT (commission incl. VAT ÷ order value). For HungerStation the rate is kept as
 * written, with a note to confirm its basis.
 */
export function comparisonVatBasis(platform: ContractPlatform, ruleType: ContractRuleType): "excluded" | "included" | "as_written" {
  if (platform === "keeta") return "excluded";
  if (platform === "jahez" && ruleType === "commission_rate") return "included";
  return "as_written";
}

/** Rates whose VAT basis matters for the check. Amount caps are compared as written (the smaller claim). */
const RATE_TYPES: ContractRuleType[] = ["commission_rate", "payment_fee", "wallet_fee"];

export interface DraftRule {
  ruleKey: string;
  ruleType: ContractRuleType;
  valueKind: ContractValueKind;
  numericValue: number | null;
  textValue: string | null;
  currency: string | null;
  fundingSource: ContractFundingSource;
  scopeType: ContractScopeType;
  scopeKey: string | null;
  notes: string;
  /** For the review list. */
  label: string;
  quote: string;
}

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
const fmt = (value: number) => String(round4(value));

function cleanKey(key: string, fallback: string): string {
  const cleaned = key
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
  return cleaned || fallback;
}

/** The AI's terms as draft rules on the check's basis, with unique keys per scope. */
export function draftRulesFromReading(reading: ContractReading, platform: ContractPlatform): DraftRule[] {
  const used = new Set<string>();
  const rules: DraftRule[] = [];
  for (const term of reading.terms) {
    if (term.valueKind !== "text" && (term.value == null || !Number.isFinite(term.value) || term.value < 0)) continue;
    if (term.valueKind === "percentage" && (term.value ?? 0) > 100) continue;
    if (term.scopeType === "branch" && !term.scopeKey?.trim()) continue;

    // The check reads one rule per key: the rates it compares keep their canonical key.
    let ruleKey = RATE_TYPES.includes(term.ruleType) ? term.ruleType : cleanKey(term.ruleKey, term.ruleType);
    const scope = term.scopeType === "branch" ? term.scopeKey!.trim().toLowerCase() : "*";
    let suffix = 2;
    while (used.has(`${ruleKey}|${scope}`)) ruleKey = `${RATE_TYPES.includes(term.ruleType) ? term.ruleType : cleanKey(term.ruleKey, term.ruleType)}_${suffix++}`;
    used.add(`${ruleKey}|${scope}`);

    let numericValue = term.valueKind === "text" ? null : term.value;
    const notes: string[] = [];
    const basis = comparisonVatBasis(platform, term.ruleType);
    if (term.valueKind === "percentage" && numericValue != null && RATE_TYPES.includes(term.ruleType) && basis === "as_written") {
      notes.push(
        term.vatIncluded === null
          ? "لم يحدد العقد إن كانت النسبة شاملة الضريبة؛ تحقق قبل الاعتماد."
          : `النسبة كما في العقد (${term.vatIncluded ? "شاملة" : "بدون"} الضريبة)؛ تأكد أنها على أساس مقارنة تدقيق قبل الاعتماد.`,
      );
    } else if (term.valueKind === "percentage" && numericValue != null && RATE_TYPES.includes(term.ruleType) && term.vatIncluded !== null) {
      const wantsVat = basis === "included";
      if (term.vatIncluded && !wantsVat) {
        const converted = round4(numericValue / 1.15);
        notes.push(`في العقد ${fmt(numericValue)}% شامل الضريبة = ${fmt(converted)}% بدون الضريبة (أساس المقارنة في تدقيق).`);
        numericValue = converted;
      } else if (!term.vatIncluded && wantsVat) {
        const converted = round4(numericValue * 1.15);
        notes.push(`في العقد ${fmt(numericValue)}% بدون الضريبة = ${fmt(converted)}% شامل الضريبة (أساس المقارنة في تدقيق).`);
        numericValue = converted;
      }
    } else if (term.valueKind === "percentage" && RATE_TYPES.includes(term.ruleType) && term.vatIncluded === null) {
      notes.push("لم يحدد العقد إن كانت النسبة شاملة الضريبة؛ تحقق قبل الاعتماد.");
    }
    if (term.notes.trim()) notes.push(term.notes.trim());

    rules.push({
      ruleKey,
      ruleType: term.ruleType,
      valueKind: term.valueKind,
      numericValue,
      textValue: term.valueKind === "text" ? (term.textValue ?? term.notes).slice(0, 1000) : null,
      currency: term.valueKind === "amount" ? "SAR" : null,
      fundingSource: term.fundingSource,
      scopeType: term.scopeType,
      scopeKey: term.scopeType === "branch" ? term.scopeKey!.trim().slice(0, 160) : null,
      notes: `قُرئ من مستند العقد. ${notes.join(" ")}`.trim().slice(0, 1000),
      label: term.label,
      quote: term.quote.slice(0, 400),
    });
  }
  return rules;
}

/** What the review dialog shows: the AI's reading, with its terms as draft rules. */
export interface ContractReadingResult {
  platform: ContractReading["platform"];
  contractPlatform: ContractPlatform;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  summary: string;
  warnings: string[];
  rules: DraftRule[];
  model: string;
}

/** What the one-step upload set up: a draft version with the document and terms, waiting for one approval. */
export interface ContractImportResult {
  contractId: string;
  contractName: string;
  createdContract: boolean;
  versionId: string;
  platform: ContractPlatform;
  effectiveFrom: string;
  effectiveTo: string | null;
  summary: string;
  warnings: string[];
  rules: DraftRule[];
  /** An approved version of the same contract whose dates overlap; approval is blocked until the dates change. */
  overlapsVersion: number | null;
  model: string;
}

/** PDF text often carries Arabic presentation forms; NFKC turns them back into plain letters for the model. */
export function contractTextForModel(text: string, maxChars = 120_000): string {
  return text.normalize("NFKC").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxChars);
}
