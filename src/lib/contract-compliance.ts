import { roundMoney } from "./analysis/parse";
import { HUNGERSTATION_TOLERANCES, JAHEZ_TOLERANCES, KEETA_TOLERANCES } from "./analysis/tolerances";
import type { ContractRuleRecord, ContractRuleType } from "./contract-rulebook";
import {
  normalizeContractScopeKey,
  resolveContractRulePrecedence,
} from "./contract-rulebook-resolver";
import type { StoredPeriod } from "./periods";

export type ContractComplianceStatus =
  | "matched"
  | "overcharged"
  | "undercharged"
  | "evidence_missing";

export interface ContractComplianceRow {
  branch: string;
  contractRatePct: number;
  observedRatePct: number | null;
  baseAmount: number;
  expectedAmount: number;
  observedAmount: number | null;
  varianceAmount: number | null;
  status: ContractComplianceStatus;
  ruleId: string;
  /** How the contract term reads when it is not a plain rate, e.g. "حد 9.00 ر.س لكل طلب". */
  contractLabel?: string;
}

export interface ContractComplianceSection {
  ruleType: "commission_rate" | "payment_fee" | "wallet_fee" | "free_delivery_funding";
  ruleKey: "commission_rate" | "payment_fee" | "wallet_fee" | "free_delivery_funding";
  /**
   * Whether an amount above the contract is a charge to claim. False when the contract also allows charges the
   * period data cannot separate (a minimum fee per order, a distance fee), so the difference is only an indicator.
   */
  claimable?: boolean;
  /** Why the section is an indicator rather than a claim. */
  indicatorNote?: string;
  evidence:
    | "contract_plus_order_data"
    | "contract_plus_invoice"
    | "contract_plus_invoice_derived_base"
    | "contract_plus_platform_data";
  evidenceNote: string;
  rows: ContractComplianceRow[];
  missingRuleBranches: string[];
  unsupportedRuleBranches: string[];
  missingEvidenceBranches: string[];
  totals: {
    baseAmount: number;
    expectedAmount: number;
    observedAmount: number | null;
    varianceAmount: number | null;
    overchargedAmount: number | null;
    underchargedAmount: number | null;
    complete: boolean;
  };
}

export interface HungerStationContractCompliance {
  platform: "hungerstation";
  versionId: string;
  versionNumber: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  periodId: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  commission: ContractComplianceSection;
  paymentFee: ContractComplianceSection;
  walletFee: ContractComplianceSection;
}

export interface KeetaContractCompliance {
  platform: "keeta";
  versionId: string;
  versionNumber: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  periodId: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  commission: ContractComplianceSection;
  bankFee: ContractComplianceSection;
  deliveryFunding: ContractComplianceSection;
}

export interface JahezContractCompliance {
  platform: "jahez";
  versionId: string;
  versionNumber: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  periodId: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  commission: ContractComplianceSection;
}

type PercentageRuleResolution =
  | { status: "resolved"; rule: ContractRuleRecord }
  | { status: "missing" }
  | { status: "unsupported"; rule: ContractRuleRecord };

function canonicalPercentageRuleForBranch(
  rules: ContractRuleRecord[],
  branch: string | null,
  ruleType: ContractRuleType,
  ruleKey: string,
): PercentageRuleResolution {
  const candidates = rules.filter(
    (rule) =>
      rule.ruleType === ruleType &&
      normalizeContractScopeKey(rule.ruleKey) ===
        normalizeContractScopeKey(ruleKey),
  );

  const selected = resolveContractRulePrecedence(candidates, branch)[0];
  if (!selected) return { status: "missing" };
  if (selected.valueKind !== "percentage" || selected.numericValue == null) {
    return { status: "unsupported", rule: selected };
  }
  return { status: "resolved", rule: selected };
}

function statusForVariance(
  value: number,
  tolerance: number,
): Exclude<ContractComplianceStatus, "evidence_missing"> {
  if (Math.abs(value) <= tolerance) return "matched";
  return value > 0 ? "overcharged" : "undercharged";
}

function makeRow(input: {
  branch: string;
  rule: ContractRuleRecord;
  baseAmount: number;
  observedAmount: number | null;
  tolerance: number;
}): ContractComplianceRow {
  const rate = input.rule.numericValue ?? 0;
  const baseAmount = roundMoney(input.baseAmount);
  const expectedAmount = roundMoney(baseAmount * (rate / 100));
  const observedAmount =
    input.observedAmount == null ? null : roundMoney(input.observedAmount);
  const varianceAmount =
    observedAmount == null ? null : roundMoney(observedAmount - expectedAmount);
  const observedRatePct =
    observedAmount != null && baseAmount > 0
      ? roundMoney((observedAmount / baseAmount) * 100, 4)
      : null;

  return {
    branch: input.branch,
    contractRatePct: rate,
    observedRatePct,
    baseAmount,
    expectedAmount,
    observedAmount,
    varianceAmount,
    status:
      varianceAmount == null
        ? "evidence_missing"
        : statusForVariance(varianceAmount, input.tolerance),
    ruleId: input.rule.id,
  };
}

function makeTotals(input: {
  rows: ContractComplianceRow[];
  aggregateObservedAmount?: number | null;
  missingRuleBranches: string[];
  unsupportedRuleBranches: string[];
  tolerance: number;
  totalsBlocked?: boolean;
}): ContractComplianceSection["totals"] {
  const baseAmount = roundMoney(
    input.rows.reduce((sum, row) => sum + row.baseAmount, 0),
  );
  const expectedAmount = roundMoney(
    input.rows.reduce((sum, row) => sum + row.expectedAmount, 0),
  );

  const allRowsObserved =
    input.rows.length > 0 &&
    input.rows.every((row) => row.observedAmount != null);

  const observedAmount =
    input.aggregateObservedAmount != null
      ? roundMoney(input.aggregateObservedAmount)
      : allRowsObserved
        ? roundMoney(
            input.rows.reduce(
              (sum, row) => sum + (row.observedAmount ?? 0),
              0,
            ),
          )
        : null;

  const expectedComplete =
    input.missingRuleBranches.length === 0 &&
    input.unsupportedRuleBranches.length === 0;
  const complete =
    expectedComplete && observedAmount != null && !input.totalsBlocked;
  const varianceAmount = complete
    ? roundMoney(observedAmount - expectedAmount)
    : null;

  return {
    baseAmount,
    expectedAmount,
    observedAmount,
    varianceAmount,
    overchargedAmount:
      varianceAmount == null
        ? null
        : varianceAmount > input.tolerance
          ? varianceAmount
          : 0,
    underchargedAmount:
      varianceAmount == null
        ? null
        : varianceAmount < -input.tolerance
          ? Math.abs(varianceAmount)
          : 0,
    complete,
  };
}

function evaluateCommission(
  period: StoredPeriod,
  rules: ContractRuleRecord[],
): ContractComplianceSection {
  const rows: ContractComplianceRow[] = [];
  const missingRuleBranches: string[] = [];
  const unsupportedRuleBranches: string[] = [];

  for (const branch of period.branches ?? []) {
    if (branch.branchAuditStatus === "invoice_only" || branch.netSales <= 0) {
      continue;
    }

    const resolved = canonicalPercentageRuleForBranch(
      rules,
      branch.branch,
      "commission_rate",
      "commission_rate",
    );

    if (resolved.status === "missing") {
      missingRuleBranches.push(branch.branch);
      continue;
    }
    if (resolved.status === "unsupported") {
      unsupportedRuleBranches.push(branch.branch);
      continue;
    }

    rows.push(
      makeRow({
        branch: branch.branch,
        rule: resolved.rule,
        baseAmount: branch.netSales,
        observedAmount: branch.commission,
        tolerance: HUNGERSTATION_TOLERANCES.commission,
      }),
    );
  }

  return {
    ruleType: "commission_rate",
    ruleKey: "commission_rate",
    evidence: "contract_plus_order_data",
    evidenceNote:
      "المبلغ المرصود للعمولة مأخوذ من بيانات الطلبات، والمبلغ المتوقع يُحتسب من نسبة العقد المعتمدة.",
    rows,
    missingRuleBranches,
    unsupportedRuleBranches,
    missingEvidenceBranches: [],
    totals: makeTotals({
      rows,
      missingRuleBranches,
      unsupportedRuleBranches,
      tolerance: HUNGERSTATION_TOLERANCES.commission,
    }),
  };
}

function evaluatePaymentFee(
  period: StoredPeriod,
  rules: ContractRuleRecord[],
): ContractComplianceSection {
  const rows: ContractComplianceRow[] = [];
  const missingRuleBranches: string[] = [];
  const unsupportedRuleBranches: string[] = [];
  const missingEvidenceBranches: string[] = [];

  for (const branch of period.branches ?? []) {
    if (branch.branchAuditStatus === "invoice_only") continue;

    const baseAmount = branch.ccSuccess + branch.ccRejected;
    if (baseAmount <= 0) continue;

    const resolved = canonicalPercentageRuleForBranch(
      rules,
      branch.branch,
      "payment_fee",
      "payment_fee",
    );

    if (resolved.status === "missing") {
      missingRuleBranches.push(branch.branch);
      continue;
    }
    if (resolved.status === "unsupported") {
      unsupportedRuleBranches.push(branch.branch);
      continue;
    }

    const observedAmount = branch.invoiceCardPaymentFees ?? null;
    if (observedAmount == null) {
      missingEvidenceBranches.push(branch.branch);
    }

    rows.push(
      makeRow({
        branch: branch.branch,
        rule: resolved.rule,
        baseAmount,
        observedAmount,
        tolerance: HUNGERSTATION_TOLERANCES.paymentFee,
      }),
    );
  }

  const invoicePaymentFees = period.invoice?.paymentFees;
  const invoiceWalletFee = period.invoice?.walletFee ?? 0;
  const aggregateObservedAmount =
    invoicePaymentFees == null
      ? null
      : Math.max(0, invoicePaymentFees - invoiceWalletFee);

  return {
    ruleType: "payment_fee",
    ruleKey: "payment_fee",
    evidence: "contract_plus_invoice",
    evidenceNote:
      "أساس رسوم البطاقات مأخوذ من بيانات الطلبات، بينما الرسوم المرصودة مأخوذة من فاتورة هنقرستيشن بعد استبعاد Wallet Payments Fee.",
    rows,
    missingRuleBranches,
    unsupportedRuleBranches,
    missingEvidenceBranches,
    totals: makeTotals({
      rows,
      aggregateObservedAmount,
      missingRuleBranches,
      unsupportedRuleBranches,
      tolerance: HUNGERSTATION_TOLERANCES.paymentFee,
    }),
  };
}

function evaluateWalletFee(
  period: StoredPeriod,
  rules: ContractRuleRecord[],
): ContractComplianceSection {
  const rows: ContractComplianceRow[] = [];
  const missingRuleBranches: string[] = [];
  const unsupportedRuleBranches: string[] = [];
  const missingEvidenceBranches: string[] = [];

  const operationalBranches = (period.branches ?? []).filter(
    (branch) => branch.branchAuditStatus !== "invoice_only",
  );
  const branchesWithWalletBase = operationalBranches.filter(
    (branch) => (branch.walletFeeBase ?? 0) > 0,
  );

  for (const branch of branchesWithWalletBase) {
    const resolved = canonicalPercentageRuleForBranch(
      rules,
      branch.branch,
      "wallet_fee",
      "wallet_fee",
    );

    if (resolved.status === "missing") {
      missingRuleBranches.push(branch.branch);
      continue;
    }
    if (resolved.status === "unsupported") {
      unsupportedRuleBranches.push(branch.branch);
      continue;
    }

    const observedAmount = branch.invoiceWalletFee ?? null;
    if (observedAmount == null) {
      missingEvidenceBranches.push(branch.branch);
    }

    rows.push(
      makeRow({
        branch: branch.branch,
        rule: resolved.rule,
        baseAmount: branch.walletFeeBase ?? 0,
        observedAmount,
        tolerance: HUNGERSTATION_TOLERANCES.paymentFee,
      }),
    );
  }

  const canonicalWalletRules = rules.filter(
    (rule) =>
      rule.ruleType === "wallet_fee" &&
      normalizeContractScopeKey(rule.ruleKey) === "wallet_fee",
  );
  const hasBranchOverride = canonicalWalletRules.some(
    (rule) => rule.scopeType === "branch",
  );
  const aggregateBaseAmount = period.invoice?.walletFeeBase ?? 0;
  const branchBaseAmount = roundMoney(
    branchesWithWalletBase.reduce(
      (sum, branch) => sum + (branch.walletFeeBase ?? 0),
      0,
    ),
  );
  const residualBaseAmount = roundMoney(
    aggregateBaseAmount - branchBaseAmount,
  );
  let totalsBlocked = false;

  if (
    Math.abs(residualBaseAmount) > HUNGERSTATION_TOLERANCES.paymentFee
  ) {
    if (residualBaseAmount > 0 && !hasBranchOverride) {
      const resolved = canonicalPercentageRuleForBranch(
        rules,
        null,
        "wallet_fee",
        "wallet_fee",
      );

      if (resolved.status === "missing") {
        missingRuleBranches.push("الجزء غير الموزع من أساس المحافظ");
      } else if (resolved.status === "unsupported") {
        unsupportedRuleBranches.push("الجزء غير الموزع من أساس المحافظ");
      } else {
        rows.push(
          makeRow({
            branch: "أساس محافظ غير موزع على الفروع",
            rule: resolved.rule,
            baseAmount: residualBaseAmount,
            observedAmount: null,
            tolerance: HUNGERSTATION_TOLERANCES.paymentFee,
          }),
        );
        missingEvidenceBranches.push(
          "تفاصيل توزيع جزء من أساس رسوم المحافظ على الفروع",
        );
      }
    } else {
      totalsBlocked = true;
      missingEvidenceBranches.push(
        "تفاصيل توزيع أساس رسوم المحافظ على الفروع",
      );
    }
  }

  const aggregateObservedAmount = period.invoice?.walletFee ?? null;

  return {
    ruleType: "wallet_fee",
    ruleKey: "wallet_fee",
    evidence: "contract_plus_invoice_derived_base",
    evidenceNote:
      "أساس Wallet Payments Fee والمبلغ المرصود كلاهما من فاتورة هنقرستيشن. هذا فحص التزام تعاقدي للحساب، وليس تحققاً مستقلاً من صحة أساس الرسوم.",
    rows,
    missingRuleBranches,
    unsupportedRuleBranches,
    missingEvidenceBranches,
    totals: makeTotals({
      rows,
      aggregateObservedAmount,
      missingRuleBranches,
      unsupportedRuleBranches,
      tolerance: HUNGERSTATION_TOLERANCES.paymentFee,
      totalsBlocked,
    }),
  };
}

function evaluateKeetaCommission(
  period: StoredPeriod,
  rules: ContractRuleRecord[],
): ContractComplianceSection {
  const rows: ContractComplianceRow[] = [];
  const missingRuleBranches: string[] = [];
  const unsupportedRuleBranches: string[] = [];

  for (const branch of period.branches ?? []) {
    if (branch.branchAuditStatus === "invoice_only") continue;

    const baseAmount = branch.keetaSalesExVat ?? 0;
    if (baseAmount <= 0) continue;

    const resolved = canonicalPercentageRuleForBranch(
      rules,
      branch.branch,
      "commission_rate",
      "commission_rate",
    );

    if (resolved.status === "missing") {
      missingRuleBranches.push(branch.branch);
      continue;
    }
    if (resolved.status === "unsupported") {
      unsupportedRuleBranches.push(branch.branch);
      continue;
    }

    rows.push(
      makeRow({
        branch: branch.branch,
        rule: resolved.rule,
        baseAmount,
        observedAmount: branch.keetaCommissionExVat ?? null,
        tolerance: KEETA_TOLERANCES.check,
      }),
    );
  }

  return {
    ruleType: "commission_rate",
    ruleKey: "commission_rate",
    evidence: "contract_plus_platform_data",
    evidenceNote:
      "أساس العمولة والعمولة المرصودة مأخوذان من Order Summary في ملف كيتا، ويُقارن المبلغ المرصود بما تسمح به نسبة العمولة المعتمدة في العقد.",
    ...keetaCommissionClaimability(rules),
    rows,
    missingRuleBranches,
    unsupportedRuleBranches,
    missingEvidenceBranches: [],
    totals: makeTotals({
      rows,
      missingRuleBranches,
      unsupportedRuleBranches,
      tolerance: KEETA_TOLERANCES.check,
    }),
  };
}

function evaluateJahezCommission(
  period: StoredPeriod,
  rules: ContractRuleRecord[],
): ContractComplianceSection {
  const rows: ContractComplianceRow[] = [];
  const missingRuleBranches: string[] = [];
  const unsupportedRuleBranches: string[] = [];
  const missingEvidenceBranches: string[] = [];

  for (const branch of period.branches ?? []) {
    if (branch.branchAuditStatus === "invoice_only") continue;

    const baseAmount = branch.grossSales;
    if (baseAmount <= 0) continue;

    const resolved = canonicalPercentageRuleForBranch(
      rules,
      branch.branch,
      "commission_rate",
      "commission_rate",
    );

    if (resolved.status === "missing") {
      missingRuleBranches.push(branch.branch);
      continue;
    }
    if (resolved.status === "unsupported") {
      unsupportedRuleBranches.push(branch.branch);
      continue;
    }

    const observedAmount = branch.jahezCommissionInclVat ?? null;
    if (observedAmount == null) {
      missingEvidenceBranches.push(branch.branch);
    }

    rows.push(
      makeRow({
        branch: branch.branch,
        rule: resolved.rule,
        baseAmount,
        observedAmount,
        tolerance: JAHEZ_TOLERANCES.check,
      }),
    );
  }

  return {
    ruleType: "commission_rate",
    ruleKey: "commission_rate",
    evidence: "contract_plus_platform_data",
    evidenceNote:
      "تعريف نسبة عمولة جاهز الحالي في محرك تدقيق هو العمولة شامل الضريبة ÷ إجمالي قيمة الطلبات. تتم مقارنة العمولة المرصودة من تفاصيل الطلبات بما تسمح به نسبة العقد المعتمدة.",
    rows,
    missingRuleBranches,
    unsupportedRuleBranches,
    missingEvidenceBranches,
    totals: makeTotals({
      rows,
      missingRuleBranches,
      unsupportedRuleBranches,
      tolerance: JAHEZ_TOLERANCES.check,
      totalsBlocked: missingEvidenceBranches.length > 0,
    }),
  };
}

export function evaluateJahezContractCompliance(input: {
  period: StoredPeriod;
  rules: ContractRuleRecord[];
  version: {
    id: string;
    versionNumber: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  };
}): JahezContractCompliance {
  const { period, rules, version } = input;
  if (period.platform !== "jahez") {
    throw new Error("Jahez contract compliance requires a Jahez audit period.");
  }
  if (!period.period_start || !period.period_end) {
    throw new Error("Audit period dates are required for contract compliance.");
  }

  return {
    platform: "jahez",
    versionId: version.id,
    versionNumber: version.versionNumber,
    effectiveFrom: version.effectiveFrom,
    effectiveTo: version.effectiveTo,
    periodId: period.id,
    periodLabel: period.label,
    periodStart: period.period_start,
    periodEnd: period.period_end,
    commission: evaluateJahezCommission(period, rules),
  };
}

/**
 * Keeta's contract can add a minimum fee per order and a distance fee on top of the commission rate. The period
 * keeps one commission amount per branch, so with either term an amount above the rate is not proof of an
 * overcharge: the section stays on the page as an indicator and raises no exception.
 */
function keetaCommissionClaimability(rules: ContractRuleRecord[]): Pick<ContractComplianceSection, "claimable" | "indicatorNote"> {
  const allowsMore = rules.some((rule) => rule.ruleType === "minimum_fee" || rule.ruleType === "delivery_fee");
  return allowsMore
    ? {
        claimable: false,
        indicatorNote:
          "العقد يضيف حداً أدنى للرسوم لكل طلب و/أو رسوم مسافة فوق النسبة، ولا تفصلها بيانات الفترة لكل طلب؛ لذلك الزيادة هنا مؤشر للمراجعة وليست مبلغاً للمطالبة.",
      }
    : { claimable: true };
}

/** Keeta's bank fee: the contract rate (before VAT) on the electronic payments of each branch. */
function evaluateKeetaBankFee(period: StoredPeriod, rules: ContractRuleRecord[]): ContractComplianceSection {
  const rows: ContractComplianceRow[] = [];
  const missingRuleBranches: string[] = [];
  const unsupportedRuleBranches: string[] = [];
  const missingEvidenceBranches: string[] = [];

  for (const branch of period.branches ?? []) {
    if (branch.branchAuditStatus === "invoice_only") continue;
    const baseAmount = branch.keetaCreditSales ?? 0;
    if (baseAmount <= 0) continue;

    const resolved = canonicalPercentageRuleForBranch(rules, branch.branch, "payment_fee", "payment_fee");
    if (resolved.status === "missing") {
      missingRuleBranches.push(branch.branch);
      continue;
    }
    if (resolved.status === "unsupported") {
      unsupportedRuleBranches.push(branch.branch);
      continue;
    }

    const observedAmount = branch.keetaBankFeesExVat ?? null;
    if (observedAmount == null) missingEvidenceBranches.push(branch.branch);
    rows.push(
      makeRow({
        branch: branch.branch,
        rule: resolved.rule,
        baseAmount,
        observedAmount,
        tolerance: KEETA_TOLERANCES.check,
      }),
    );
  }

  return {
    ruleType: "payment_fee",
    ruleKey: "payment_fee",
    evidence: "contract_plus_platform_data",
    evidenceNote:
      "الأساس هو المبيعات المدفوعة إلكترونياً (البيع الآجل) لكل فرع، والمرصود هو الرسوم المصرفية بدون الضريبة من ملف كيتا. نسبة العقد بدون الضريبة.",
    claimable: true,
    rows,
    missingRuleBranches,
    unsupportedRuleBranches,
    missingEvidenceBranches,
    totals: makeTotals({
      rows,
      missingRuleBranches,
      unsupportedRuleBranches,
      tolerance: KEETA_TOLERANCES.check,
      totalsBlocked: missingEvidenceBranches.length > 0,
    }),
  };
}

/**
 * Keeta's merchant-funded delivery subsidy: the contract sets an amount per order (by order value). The period
 * keeps the order count per branch, not each order's value, so the check uses the highest amount for every order:
 * a ceiling. Anything charged above the ceiling cannot come from the contract. The contract amount is compared
 * as written against the charge before VAT, the smaller of the two possible readings.
 */
function evaluateKeetaDeliveryFunding(period: StoredPeriod, rules: ContractRuleRecord[]): ContractComplianceSection {
  const rows: ContractComplianceRow[] = [];
  const missingRuleBranches: string[] = [];
  const unsupportedRuleBranches: string[] = [];
  const missingEvidenceBranches: string[] = [];
  const candidates = rules.filter((rule) => rule.ruleType === "free_delivery_funding");

  for (const branch of period.branches ?? []) {
    if (branch.branchAuditStatus === "invoice_only") continue;
    const observedAmount = branch.keetaDeliveryCampaignExVat ?? null;
    if (!branch.orders || (observedAmount ?? 0) <= 0) continue;

    const applicable = resolveContractRulePrecedence(candidates, branch.branch);
    if (!applicable.length) {
      missingRuleBranches.push(branch.branch);
      continue;
    }
    const amounts = applicable.filter((rule) => rule.valueKind === "amount" && rule.numericValue != null);
    if (!amounts.length) {
      unsupportedRuleBranches.push(branch.branch);
      continue;
    }
    const rule = amounts.reduce((top, item) => ((item.numericValue ?? 0) > (top.numericValue ?? 0) ? item : top));
    const cap = rule.numericValue ?? 0;
    const expectedAmount = roundMoney(branch.orders * cap);
    const observed = observedAmount == null ? null : roundMoney(observedAmount);
    const above = observed == null ? null : roundMoney(observed - expectedAmount);
    if (observed == null) missingEvidenceBranches.push(branch.branch);

    rows.push({
      branch: branch.branch,
      contractRatePct: 0,
      contractLabel: `حد ${cap.toFixed(2)} ر.س لكل طلب`,
      observedRatePct: null,
      baseAmount: branch.orders,
      expectedAmount,
      observedAmount: observed,
      // Below the ceiling is within the contract, not an undercharge.
      varianceAmount: above == null ? null : Math.max(0, above),
      status: above == null ? "evidence_missing" : above > KEETA_TOLERANCES.check ? "overcharged" : "matched",
      ruleId: rule.id,
    });
  }

  return {
    ruleType: "free_delivery_funding",
    ruleKey: "free_delivery_funding",
    evidence: "contract_plus_platform_data",
    evidenceNote:
      "الحد الأعلى = عدد الطلبات × أعلى مبلغ دعم في العقد لكل طلب (لا تحفظ الفترة قيمة كل طلب). المرصود هو «دعم توصيل كيتا» بدون الضريبة من ملف كيتا. أي مبلغ فوق الحد لا يأتي من العقد إلا إذا اشتركت في حملة إضافية.",
    claimable: true,
    rows,
    missingRuleBranches,
    unsupportedRuleBranches,
    missingEvidenceBranches,
    totals: ceilingTotals(
      makeTotals({
        rows,
        missingRuleBranches,
        unsupportedRuleBranches,
        tolerance: KEETA_TOLERANCES.check,
        totalsBlocked: missingEvidenceBranches.length > 0,
      }),
      rows,
    ),
  };
}

/** For a ceiling, branches under it do not offset branches over it: the excess is the sum of each branch's excess. */
function ceilingTotals(totals: ContractComplianceSection["totals"], rows: ContractComplianceRow[]): ContractComplianceSection["totals"] {
  if (totals.observedAmount == null) return totals;
  const excess = roundMoney(rows.reduce((sum, row) => sum + (row.varianceAmount ?? 0), 0));
  return {
    ...totals,
    varianceAmount: totals.complete ? excess : null,
    overchargedAmount: totals.complete ? excess : null,
    underchargedAmount: totals.complete ? 0 : null,
  };
}

export function evaluateKeetaContractCompliance(input: {
  period: StoredPeriod;
  rules: ContractRuleRecord[];
  version: {
    id: string;
    versionNumber: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  };
}): KeetaContractCompliance {
  const { period, rules, version } = input;
  if (period.platform !== "keeta") {
    throw new Error("Keeta contract compliance requires a Keeta audit period.");
  }
  if (!period.period_start || !period.period_end) {
    throw new Error("Audit period dates are required for contract compliance.");
  }

  return {
    platform: "keeta",
    versionId: version.id,
    versionNumber: version.versionNumber,
    effectiveFrom: version.effectiveFrom,
    effectiveTo: version.effectiveTo,
    periodId: period.id,
    periodLabel: period.label,
    periodStart: period.period_start,
    periodEnd: period.period_end,
    commission: evaluateKeetaCommission(period, rules),
    bankFee: evaluateKeetaBankFee(period, rules),
    deliveryFunding: evaluateKeetaDeliveryFunding(period, rules),
  };
}

export function evaluateHungerStationContractCompliance(input: {
  period: StoredPeriod;
  rules: ContractRuleRecord[];
  version: {
    id: string;
    versionNumber: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  };
}): HungerStationContractCompliance {
  const { period, rules, version } = input;
  if (period.platform !== "hungerstation") {
    throw new Error(
      "HungerStation contract compliance requires a HungerStation audit period.",
    );
  }
  if (!period.period_start || !period.period_end) {
    throw new Error("Audit period dates are required for contract compliance.");
  }

  return {
    platform: "hungerstation",
    versionId: version.id,
    versionNumber: version.versionNumber,
    effectiveFrom: version.effectiveFrom,
    effectiveTo: version.effectiveTo,
    periodId: period.id,
    periodLabel: period.label,
    periodStart: period.period_start,
    periodEnd: period.period_end,
    commission: evaluateCommission(period, rules),
    paymentFee: evaluatePaymentFee(period, rules),
    walletFee: evaluateWalletFee(period, rules),
  };
}

/** Every checked term of a contract check, in page order. */
export function complianceSections(
  compliance: HungerStationContractCompliance | KeetaContractCompliance | JahezContractCompliance,
): ContractComplianceSection[] {
  if (compliance.platform === "hungerstation") return [compliance.commission, compliance.paymentFee, compliance.walletFee];
  if (compliance.platform === "keeta") return [compliance.commission, compliance.deliveryFunding, compliance.bankFee];
  return [compliance.commission];
}
