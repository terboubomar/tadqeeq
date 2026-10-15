import type { AuditException, ExceptionItemDecision, ExceptionItemStatus, ExceptionStatus, ExceptionWorkflowEntry } from "./exceptions";
import { displayBranchName } from "./reporting-metrics";
import type { StoredPeriod } from "./periods";

/**
 * Turning رادار exceptions into claims (gap analysis, Gap 3): what evidence each exception needs, the workspace's
 * classification rules, and a dispute letter per platform built from the claimable items. Display and drafting
 * only: no audit figure changes.
 */

export interface RequiredEvidence {
  /** The document that settles the exception. */
  document: string;
  /** The amount the document has to explain. */
  expectedAmount: number;
  /** The branch it concerns, or null at period level. */
  branch: string | null;
}

const DOCUMENT_BY_CATEGORY: Partial<Record<AuditException["category"], string>> = {
  commission: "عقد المنصة أو ملحق نسبة العمولة الساري للفترة",
  payment_fee: "شروط رسوم الدفع الإلكتروني في عقد المنصة",
  other_fee: "فاتورة أو اتفاقية البند (جهاز، اشتراك، رسم خدمة) من المنصة",
  delivery_campaign: "موافقة المطعم على حملة التوصيل المجاني وشروطها",
  campaign: "موافقة المطعم على العرض وحصته من تكلفته",
  advertising: "فاتورة الإعلانات (CPC) أو تقرير الحملة الإعلانية",
  pos_fee: "اتفاقية جهاز نقاط البيع وجدول أقساطه",
  compensation: "صورة أو فيديو الطلب عند التسليم، أو سجل الطلب في بوابة التاجر",
  sales: "ملف الطلبات من بوابة التاجر للفترة نفسها",
  collections: "كشف التحويلات البنكية من المنصة للفترة",
  settlement: "كشف حساب المنصة (Statement of Account) للفترة",
  branch_match: "قائمة فروع المطعم ومعرّفاتها على المنصة",
  data_missing: "الملف الناقص من بوابة التاجر للفترة",
};

export function requiredEvidence(item: AuditException): RequiredEvidence {
  const invoiceOnly = item.evidence === "invoice_only";
  const document =
    (invoiceOnly ? "مستند من المنصة يثبت البند: فاتورة الجهاز أو الاشتراك أو الاتفاقية التي تفرضه" : null) ??
    DOCUMENT_BY_CATEGORY[item.category] ??
    "مستند من المنصة يفسّر الفرق";
  const amount = item.reviewAmount > 0 ? item.reviewAmount : Math.abs(item.difference ?? 0);
  return { document, expectedAmount: Math.round(amount * 100) / 100, branch: item.branch ? displayBranchName(item.branch) : null };
}

export interface ClassificationRule {
  id: string;
  platform: StoredPeriod["platform"] | null;
  match_text: string;
  classification: string;
  commissionable: boolean;
  claimable: boolean;
  note: string | null;
}

/** The first rule whose text appears in the text (case-insensitive) on the same platform, if any. */
export function ruleFor(text: string, platform: string, rules: ClassificationRule[]): ClassificationRule | undefined {
  const label = text.toLocaleLowerCase();
  return rules.find((rule) => (!rule.platform || rule.platform === platform) && label.includes(rule.match_text.trim().toLocaleLowerCase()));
}

export function matchingRule(item: AuditException, rules: ClassificationRule[]): ClassificationRule | undefined {
  return ruleFor(item.label, item.platform, rules);
}

export interface ClassifiedLine {
  label: string;
  amount: number;
  rule: ClassificationRule | null;
}

/** Each line of a combined exception with the rule that classifies it, if any. */
export function classifyLines(item: AuditException, rules: ClassificationRule[]): ClassifiedLine[] {
  return (item.lines ?? []).map((line) => ({ ...line, rule: ruleFor(line.label, item.platform, rules) ?? null }));
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const ruleText = (rule: ClassificationRule) => rule.classification + (rule.commissionable ? "" : "، غير خاضع للعمولة");

/**
 * Applies the workspace's rules to past and future periods alike. An exception still «new» whose line (or, for a
 * combined exception, every line) matches a rule takes the rules' classification and becomes «claimable» when some
 * covered amount is owed back, else «classified» (a legitimate charge); its claimable amount is the part covered by
 * claimable rules. A partly covered combined exception stays «new» with the covered lines noted. A status or
 * classification a person set wins over the rules.
 */
export function applyClassificationRules(items: AuditException[], rules: ClassificationRule[]): AuditException[] {
  if (!rules.length) return items;
  return items.map((item) => {
    // A person's decision on the charges inside the exception wins over the rules.
    if (item.items.some((decision) => decision.status !== "pending")) return item;
    if (item.lines?.length) {
      const lines = classifyLines(item, rules);
      const covered = lines.filter((line) => line.rule);
      if (!covered.length) return item;
      const all = covered.length === lines.length;
      const owed = round2(covered.filter((line) => line.rule!.claimable).reduce((sum, line) => sum + line.amount, 0));
      const status: ExceptionStatus = item.status === "new" && all ? (owed > 0 ? "claimable" : "classified") : item.status;
      const note = covered.map((line) => `${line.label}: ${ruleText(line.rule!)}`).join(" · ");
      return {
        ...item,
        status,
        classification: item.classification ?? (all ? note : `${note} · ${lines.length - covered.length} بند بلا قاعدة`),
        claimableAmount: status === "claimable" && item.claimableAmount === 0 ? owed : item.claimableAmount,
        claimLines: covered.filter((line) => line.rule!.claimable).map(({ label, amount }) => ({ label, amount })),
      };
    }
    const rule = matchingRule(item, rules);
    if (!rule) return item;
    const status: ExceptionStatus = item.status === "new" ? (rule.claimable ? "claimable" : "classified") : item.status;
    const claimable =
      status === "claimable" && item.claimableAmount === 0
        ? item.potentialRecovery > 0
          ? item.potentialRecovery
          : item.reviewAmount
        : item.claimableAmount;
    return { ...item, status, classification: item.classification ?? ruleText(rule), claimableAmount: claimable };
  });
}

export const ITEM_STATUS_LABELS: Record<ExceptionItemStatus, string> = {
  pending: "بانتظار المستند",
  accepted: "رسم صحيح",
  claimable: "قابل للمطالبة",
};

/** Statuses a person moved the exception on to (a claim sent, or settled); per-charge decisions no longer reset them. */
const SETTLED_OR_CLAIMED: ReadonlySet<ExceptionStatus> = new Set(["contacted", "disputed", "recovered", "rejected"]);

/**
 * The workflow patch for a set of per-charge decisions. Once every charge of the exception is decided, the exception
 * follows them: claimable for the sum of the charges marked claimable, else closed (every charge is a valid fee).
 * Until then, or once a claim was sent or settled, only the decisions are saved.
 */
export function itemDecisionsPatch(item: AuditException, decisions: ExceptionItemDecision[]): Partial<ExceptionWorkflowEntry> {
  const patch: Partial<ExceptionWorkflowEntry> = { items: decisions };
  const lines = item.lines ?? [];
  const decisionOf = (label: string) => decisions.find((decision) => decision.line === label);
  const allDecided = lines.length > 0 && lines.every((line) => (decisionOf(line.label)?.status ?? "pending") !== "pending");
  if (!allDecided || SETTLED_OR_CLAIMED.has(item.status)) return patch;
  const owed = round2(lines.filter((line) => decisionOf(line.label)?.status === "claimable").reduce((sum, line) => sum + line.amount, 0));
  return owed > 0 ? { ...patch, status: "claimable", claimableAmount: owed } : { ...patch, status: "closed", claimableAmount: null };
}

const PLATFORM_NAMES: Record<string, { ar: string; en: string }> = {
  hungerstation: { ar: "هنقرستيشن", en: "HungerStation" },
  keeta: { ar: "كيتا", en: "Keeta" },
  jahez: { ar: "جاهز", en: "Jahez" },
};

const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface DisputeLetter {
  platform: string;
  items: AuditException[];
  total: number;
  arabic: string;
  english: string;
}

/**
 * A dispute letter to one platform from the period's claimable items (status claimable, contacted or disputed),
 * in Arabic and English, listing each item with its branch, amount and the evidence held. Null when nothing is
 * claimable. The restaurant name is left for the sender to fill in.
 */
export function disputeLetter(period: StoredPeriod, items: AuditException[]): DisputeLetter | null {
  const claims = items.filter((item) => item.claimableAmount > 0);
  if (!claims.length) return null;
  const name = PLATFORM_NAMES[period.platform] ?? { ar: period.platform, en: period.platform };
  const total = Math.round(claims.reduce((sum, item) => sum + item.claimableAmount, 0) * 100) / 100;
  const range = [period.period_start, period.period_end].filter(Boolean).join(" – ");

  const arLines = claims.map((item, index) => {
    const where = item.branch ? ` · ${displayBranchName(item.branch)}` : "";
    const docs = item.attachments.length ? ` · مرفق: ${item.attachments.map((a) => a.name).join("، ")}` : "";
    const what = item.claimLines?.length ? item.claimLines.map((line) => line.label).join("، ") : item.label;
    return `${index + 1}. ${what}${where}: ${money(item.claimableAmount)} ر.س${docs}`;
  });
  const enLines = claims.map((item, index) => {
    const where = item.branch ? ` · ${displayBranchName(item.branch)}` : "";
    const docs = item.attachments.length ? ` · attached: ${item.attachments.map((a) => a.name).join(", ")}` : "";
    const what = item.claimLines?.length ? item.claimLines.map((line) => line.label).join(", ") : `${item.categoryLabel} (${item.label})`;
    return `${index + 1}. ${what}${where}: SAR ${money(item.claimableAmount)}${docs}`;
  });

  const arabic = [
    `إلى فريق دعم التجار في ${name.ar}،`,
    "",
    `نطلب مراجعة البنود التالية في فاتورة الفترة «${period.label}»${range ? ` (${range})` : ""}، إذ لا تطابق بيانات طلباتنا أو الشروط المتفق عليها:`,
    "",
    ...arLines,
    "",
    `الإجمالي المطلوب مراجعته واسترداده: ${money(total)} ر.س`,
    "",
    "نرفق المستندات المذكورة أعلاه، ونرجو تزويدنا برقم مرجع الطلب وتأكيد التصحيح في الفاتورة أو التحويل القادم.",
    "",
    "مع الشكر،",
    "[اسم المطعم]",
  ].join("\n");

  const english = [
    `Dear ${name.en} Merchant Support,`,
    "",
    `Please review the following items on the invoice for the period "${period.label}"${range ? ` (${range})` : ""}. They do not match our order data or the agreed terms:`,
    "",
    ...enLines,
    "",
    `Total to review and refund: SAR ${money(total)}`,
    "",
    "The documents listed above are attached. Please share a ticket reference and confirm the correction on the next invoice or payout.",
    "",
    "Kind regards,",
    "[Restaurant name]",
  ].join("\n");

  return { platform: period.platform, items: claims, total, arabic, english };
}
