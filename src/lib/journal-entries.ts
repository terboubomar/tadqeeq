import type { BranchRow } from "./analysis/types";
import type { StoredPeriod } from "./periods";

/**
 * Journal entries for a period's delivery-app sales, per branch and for the whole period.
 *
 * Treatment (IFRS 15, the platform is the restaurant's agent): revenue is net sales without VAT; the platform's
 * commission and fees are expenses, each on its own line; output VAT on sales and input VAT on the platform's charges
 * are separate; the net amount owed by the platform is the balancing debit. When the platform's own payout figure is
 * used (Keeta, Jahez) and differs from the computed balance, the gap gets its own visible line instead of being
 * folded into another account. HungerStation charges that only its invoices list (printers, the monthly subscription,
 * free-delivery campaign charges) and its CPC advertising invoice are expenses of the branch the invoice names, with
 * their VAT, and HungerStation deducts them from the same balance; what no branch section names stays in the period
 * entry only.
 *
 * Read-only: it only arranges figures the audit already stored on each branch. It never recalculates them.
 */

export type JournalAccountKey =
  | "platform_receivable"
  | "sales_revenue"
  | "output_vat"
  | "commission_expense"
  | "payment_fee_expense"
  | "marketing_expense"
  | "compensation_expense"
  | "other_platform_fee_expense"
  | "device_expense"
  | "subscription_expense"
  | "advertising_expense"
  | "input_vat"
  | "settlement_difference";

export interface JournalAccount {
  key: JournalAccountKey;
  code: string;
  name: string;
}

/** Defaults used until the workspace maps its own chart of accounts. Codes stay empty so nobody mistakes them for theirs. */
export const DEFAULT_JOURNAL_ACCOUNTS: Record<JournalAccountKey, JournalAccount> = {
  platform_receivable: { key: "platform_receivable", code: "", name: "ذمم مدينة – منصات التوصيل" },
  sales_revenue: { key: "sales_revenue", code: "", name: "إيرادات المبيعات – منصات التوصيل" },
  output_vat: { key: "output_vat", code: "", name: "ضريبة القيمة المضافة – مخرجات" },
  commission_expense: { key: "commission_expense", code: "", name: "مصروف عمولة منصات التوصيل" },
  payment_fee_expense: { key: "payment_fee_expense", code: "", name: "مصروف رسوم الدفع الإلكتروني" },
  marketing_expense: { key: "marketing_expense", code: "", name: "مصروف حملات وتسويق المنصات" },
  compensation_expense: { key: "compensation_expense", code: "", name: "مصروف تعويضات العملاء" },
  other_platform_fee_expense: { key: "other_platform_fee_expense", code: "", name: "رسوم منصات أخرى" },
  device_expense: { key: "device_expense", code: "", name: "مصروف أجهزة المنصات (الطابعات)" },
  subscription_expense: { key: "subscription_expense", code: "", name: "مصروف اشتراك المنصات الشهري" },
  advertising_expense: { key: "advertising_expense", code: "", name: "مصروف إعلانات المنصات (CPC)" },
  input_vat: { key: "input_vat", code: "", name: "ضريبة القيمة المضافة – مدخلات" },
  settlement_difference: { key: "settlement_difference", code: "", name: "فروقات تسوية منصات التوصيل" },
};

/** Account order in an entry: debits first, then credits, the way accountants read them. */
export const JOURNAL_ACCOUNT_ORDER: JournalAccountKey[] = [
  "platform_receivable",
  "commission_expense",
  "payment_fee_expense",
  "marketing_expense",
  "compensation_expense",
  "other_platform_fee_expense",
  "device_expense",
  "subscription_expense",
  "advertising_expense",
  "input_vat",
  "settlement_difference",
  "sales_revenue",
  "output_vat",
];

export type JournalAccounts = Record<JournalAccountKey, JournalAccount>;

export interface JournalLine {
  account: JournalAccount;
  debit: number;
  credit: number;
  /** What the amount is made of, e.g. the platform's fields behind it. */
  memo: string;
}

export interface JournalEntry {
  /** e.g. "هنقرستيشن · سبتمبر 2026 · فرع العليا" */
  description: string;
  date: string | null;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  /** Notes the reviewer should read, e.g. how the receivable was set. */
  notes: string[];
}

const VAT_RATE = 0.15;
const PLATFORM_NAMES: Record<StoredPeriod["platform"], string> = {
  hungerstation: "هنقرستيشن",
  keeta: "كيتا",
  jahez: "جاهز",
};

/** The period label, prefixed with the platform name unless the label already carries it. */
function withPlatform(period: StoredPeriod): string {
  const platform = PLATFORM_NAMES[period.platform];
  return period.label.includes(platform) ? period.label : platform + " · " + period.label;
}

function round(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

interface Amounts {
  revenue: number;
  outputVat: number;
  commission: number;
  paymentFees: number;
  marketing: number;
  compensation: number;
  otherFees: number;
  devices?: number;
  subscription?: number;
  advertising?: number;
  inputVat: number;
  /** The platform's own net payout when the file states it; otherwise the balancing figure is used. */
  reportedReceivable?: number;
  memos: Partial<Record<JournalAccountKey, string>>;
  notes: string[];
}

const DEVICE_LABEL = "الطابعات";
const SUBSCRIPTION_LABEL = "الاشتراك الشهري";
const FREE_DELIVERY_LABEL = "رسوم حملات التوصيل المجاني";

/** Charges only HungerStation's invoices list, split by account, with the VAT they carry. */
interface InvoiceExtras {
  devices: number;
  subscription: number;
  marketing: number;
  other: number;
  advertising: number;
  advertisingVat: number;
}

const NO_EXTRAS: InvoiceExtras = { devices: 0, subscription: 0, marketing: 0, other: 0, advertising: 0, advertisingVat: 0 };

function addItems(extras: InvoiceExtras, items: Array<{ label: string; amount: number }>): InvoiceExtras {
  const next = { ...extras };
  for (const item of items) {
    if (item.label === DEVICE_LABEL) next.devices += item.amount;
    else if (item.label === SUBSCRIPTION_LABEL) next.subscription += item.amount;
    else if (item.label === FREE_DELIVERY_LABEL) next.marketing += item.amount;
    else next.other += item.amount;
  }
  return next;
}

const nameKey = (name: string | undefined) => (name ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();

/** The branch row as the analysis stored it: pages may pass a copy renamed for display. */
function storedBranch(period: StoredPeriod, b: BranchRow): BranchRow {
  return period.branches.find((row) => row.branchId === b.branchId && row.invoiceBranchName === b.invoiceBranchName) ?? b;
}

/** Whether a CPC invoice line names this branch (as the orders file or the commission invoice spells it). */
function cpcNamesBranch(charge: { branch: string }, b: BranchRow): boolean {
  const key = nameKey(charge.branch);
  return key !== "" && (key === nameKey(b.branch) || key === nameKey(b.invoiceBranchName));
}

function hungerStationExtras(period: StoredPeriod, shown: BranchRow): InvoiceExtras {
  const b = storedBranch(period, shown);
  let extras = NO_EXTRAS;
  const invoiceBranch = b.invoiceBranchName ? period.invoice?.branches?.find((row) => row.branch === b.invoiceBranchName) : undefined;
  if (invoiceBranch?.invoiceOnlyItems) {
    extras = addItems(extras, invoiceBranch.invoiceOnlyItems);
  } else if ((b.invoiceOnlyBranchCharges ?? 0) !== 0) {
    // Saved before the invoice's items were kept apart: only their total is known.
    extras = { ...extras, other: b.invoiceOnlyBranchCharges ?? 0 };
  }
  for (const charge of period.invoice?.cpcBranches ?? []) {
    if (!cpcNamesBranch(charge, b)) continue;
    extras = { ...extras, advertising: extras.advertising + charge.amountExVat, advertisingVat: extras.advertisingVat + charge.vat };
  }
  return extras;
}

function hungerStationAmounts(period: StoredPeriod, b: BranchRow): Amounts {
  const extras = hungerStationExtras(period, b);
  const cardFees = (b.bankFeeSuccess ?? 0) + (b.bankFeeRefunded ?? 0) + (b.walletFee ?? 0);
  const marketing = (b.rdfCampaigns ?? 0) + (b.jokerFees ?? 0) + extras.marketing;
  const other = (b.waitingTimeFees ?? 0) + extras.other;
  const charges = (b.commission ?? 0) + cardFees + marketing + (b.compensation ?? 0) + other + extras.devices + extras.subscription;
  return {
    revenue: b.netSales,
    outputVat: b.grossSales - b.netSales,
    commission: b.commission,
    paymentFees: cardFees,
    marketing,
    compensation: b.compensation,
    otherFees: other,
    devices: extras.devices,
    subscription: extras.subscription,
    advertising: extras.advertising,
    // The CPC invoice prints the VAT of each branch line; the other charges carry 15%.
    inputVat: charges * VAT_RATE + extras.advertisingVat,
    memos: {
      sales_revenue: "Commissionable GMV بدون الضريبة",
      output_vat: "15% على المبيعات",
      commission_expense: "عمود Commission",
      payment_fee_expense: "رسوم البطاقات + المحافظ",
      marketing_expense:
        extras.marketing !== 0
          ? "خصم التوصيل الممول من المطعم + Flash Deals + رسوم حملات التوصيل المجاني من الفاتورة"
          : "خصم التوصيل الممول من المطعم + Flash Deals",
      compensation_expense: "ورقة Compensated Orders",
      other_platform_fee_expense: extras.other !== 0 ? "رسوم وقت الانتظار + بنود الفاتورة فقط" : "رسوم وقت الانتظار",
      device_expense: "الطابعات حسب فاتورة هنقرستيشن",
      subscription_expense: "الاشتراك الشهري حسب فاتورة هنقرستيشن",
      advertising_expense: "فاتورة الإعلانات CPC: سطر الفرع بدون الضريبة",
      input_vat: extras.advertisingVat !== 0 ? "15% على رسوم المنصة + ضريبة فاتورة CPC" : "15% على رسوم المنصة",
      platform_receivable: "المبيعات شامل الضريبة − رسوم المنصة شامل الضريبة",
    },
    notes: [
      "المستحق من هنقرستيشن محسوب: المبيعات شامل الضريبة ناقص رسوم المنصة شامل الضريبة. إن كان جزء من الطلبات مدفوعاً نقداً للمطعم مباشرة فاخصمه من الذمة عند المطابقة مع كشف التحويل.",
      ...(extras.advertising !== 0 || extras.devices !== 0 || extras.subscription !== 0 || extras.marketing !== 0 || extras.other !== 0
        ? ["بنود الفاتورة فقط وفاتورة الإعلانات CPC تخصمها هنقرستيشن من نفس الرصيد، لذلك تُنقص المستحق منها."]
        : []),
    ],
  };
}

function keetaAmounts(b: BranchRow): Amounts {
  const marketing = (b.keetaDeliveryCampaignExVat ?? 0) + (b.keetaProductCampaignExVat ?? 0) + (b.keetaMerchantAdExVat ?? 0);
  return {
    revenue: b.keetaSalesExVat ?? b.grossSales / (1 + VAT_RATE),
    outputVat: b.keetaSalesVat ?? b.grossSales - b.grossSales / (1 + VAT_RATE),
    commission: b.keetaCommissionExVat ?? b.commission,
    paymentFees: b.keetaBankFeesExVat ?? 0,
    marketing,
    compensation: b.keetaCompensationExVat ?? 0,
    otherFees: b.keetaOtherExpensesExVat ?? 0,
    inputVat: b.keetaInputVat ?? 0,
    reportedReceivable: b.netSales,
    memos: {
      sales_revenue: "المبيعات بدون الضريبة من Order Summary",
      output_vat: "ضريبة المبيعات",
      commission_expense: "Subtotal of commission fee",
      payment_fee_expense: "Bank fee",
      marketing_expense: "دعم التوصيل + Product campaign + Merchant ad spend",
      compensation_expense: "Platform Deductions (Merchant's Liability)",
      other_platform_fee_expense: "POS والمصروفات الأخرى",
      input_vat: "ضريبة المدخلات على تكلفة المنصة",
      platform_receivable: "صافي المستحق المحتسب من Order Summary",
    },
    notes: [],
  };
}

function jahezAmounts(b: BranchRow): Amounts {
  const commissionIncl = b.jahezCommissionInclVat ?? b.commission * (1 + VAT_RATE);
  const commission = commissionIncl / (1 + VAT_RATE);
  const deliveryIncl = b.jahezDeliveryOfferInclVat ?? 0;
  const deliveryEx = b.jahezDeliveryOfferInvoiceExVat ?? deliveryIncl / (1 + VAT_RATE);
  return {
    revenue: b.grossSales / (1 + VAT_RATE),
    outputVat: b.grossSales - b.grossSales / (1 + VAT_RATE),
    commission,
    paymentFees: b.jahezPaymentFeesExVat ?? 0,
    marketing: deliveryEx + (b.jahezOfferAmount ?? 0) + (b.jahezDeliveryCoupon ?? 0),
    compensation: 0,
    otherFees: 0,
    inputVat: commissionIncl - commission + (b.jahezPaymentFeesVat ?? 0) + (deliveryIncl - deliveryEx),
    reportedReceivable: b.netSales,
    memos: {
      sales_revenue: "Order Amount بدون الضريبة",
      output_vat: "15% على المبيعات",
      commission_expense: "Jahez Commision بدون الضريبة",
      payment_fee_expense: "Payment Fees",
      marketing_expense: "Delivery Offer + Offer Amount + Delivery Coupon",
      input_vat: "ضريبة العمولة + Payment Fees Vat + ضريبة عروض التوصيل",
      platform_receivable: "Restaurant Amount حسب تقرير جاهز",
    },
    notes: [
      "رسوم التوصيل التي تضيفها جاهز للمطعم والتعويضات لا تظهر كبنود منفصلة في نتيجة الفرع؛ أي أثر لها يظهر في سطر فروقات التسوية.",
    ],
  };
}

function amountsFor(period: StoredPeriod, branch: BranchRow): Amounts {
  if (period.platform === "hungerstation") return hungerStationAmounts(period, branch);
  if (period.platform === "keeta") return keetaAmounts(branch);
  return jahezAmounts(branch);
}

/**
 * HungerStation charges no branch carries: invoice-only items printed only in the invoice summary, and CPC lines
 * whose branch is not in the period. They belong to the period entry only.
 */
function hungerStationUnallocated(period: StoredPeriod): Amounts | null {
  if (period.platform !== "hungerstation") return null;
  let extras = addItems(NO_EXTRAS, period.invoice?.unallocatedCharges ?? []);
  for (const charge of period.invoice?.cpcBranches ?? []) {
    if (period.branches.some((branch) => cpcNamesBranch(charge, branch))) continue;
    extras = { ...extras, advertising: extras.advertising + charge.amountExVat, advertisingVat: extras.advertisingVat + charge.vat };
  }
  const charges = extras.marketing + extras.other + extras.devices + extras.subscription;
  if (charges === 0 && extras.advertising === 0) return null;
  return {
    revenue: 0,
    outputVat: 0,
    commission: 0,
    paymentFees: 0,
    marketing: extras.marketing,
    compensation: 0,
    otherFees: extras.other,
    devices: extras.devices,
    subscription: extras.subscription,
    advertising: extras.advertising,
    inputVat: charges * VAT_RATE + extras.advertisingVat,
    memos: {
      marketing_expense: "رسوم حملات التوصيل المجاني في ملخص الفاتورة",
      other_platform_fee_expense: "بنود الفاتورة فقط في ملخص الفاتورة",
      device_expense: "الطابعات في ملخص الفاتورة",
      subscription_expense: "الاشتراك الشهري في ملخص الفاتورة",
      advertising_expense: "سطور فاتورة CPC لفروع خارج الفترة",
      input_vat: "15% على البنود + ضريبة فاتورة CPC",
      platform_receivable: "تخصمها هنقرستيشن من الرصيد",
    },
    notes: ["بنود في ملخص فاتورة هنقرستيشن لا يذكرها قسم أي فرع تظهر في قيد الفترة فقط، لا في قيود الفروع."],
  };
}

function buildEntry(
  description: string,
  date: string | null,
  amounts: Amounts,
  accounts: JournalAccounts,
): JournalEntry {
  const debits: Array<[JournalAccountKey, number]> = [
    ["commission_expense", amounts.commission],
    ["payment_fee_expense", amounts.paymentFees],
    ["marketing_expense", amounts.marketing],
    ["compensation_expense", amounts.compensation],
    ["other_platform_fee_expense", amounts.otherFees],
    ["device_expense", amounts.devices ?? 0],
    ["subscription_expense", amounts.subscription ?? 0],
    ["advertising_expense", amounts.advertising ?? 0],
    ["input_vat", amounts.inputVat],
  ];
  const credits: Array<[JournalAccountKey, number]> = [
    ["sales_revenue", amounts.revenue],
    ["output_vat", amounts.outputVat],
  ];
  const creditTotal = round(credits.reduce((sum, [, value]) => sum + round(value), 0));
  const chargesTotal = round(debits.reduce((sum, [, value]) => sum + round(value), 0));
  const balancing = round(creditTotal - chargesTotal);
  const receivable = amounts.reportedReceivable !== undefined ? round(amounts.reportedReceivable) : balancing;
  const difference = round(balancing - receivable);

  const values = new Map<JournalAccountKey, number>([
    ...debits.map(([key, value]) => [key, round(value)] as [JournalAccountKey, number]),
    ...credits.map(([key, value]) => [key, -round(value)] as [JournalAccountKey, number]),
    ["platform_receivable", receivable],
    ["settlement_difference", difference],
  ]);

  const lines: JournalLine[] = [];
  for (const key of JOURNAL_ACCOUNT_ORDER) {
    const value = values.get(key) ?? 0;
    if (Math.abs(value) < 0.005) continue;
    lines.push({
      account: accounts[key],
      debit: value > 0 ? value : 0,
      credit: value < 0 ? -value : 0,
      memo:
        key === "settlement_difference"
          ? "الفرق بين صافي المستحق حسب المنصة والمحتسب من البنود"
          : amounts.memos[key] ?? "",
    });
  }
  const totalDebit = round(lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = round(lines.reduce((sum, line) => sum + line.credit, 0));
  return { description, date, lines, totalDebit, totalCredit, notes: amounts.notes };
}

/** Merge workspace settings over the defaults so every account key always has a name. */
export function resolveJournalAccounts(saved: Partial<Record<JournalAccountKey, { code?: string; name?: string }>>): JournalAccounts {
  const accounts = { ...DEFAULT_JOURNAL_ACCOUNTS };
  for (const key of JOURNAL_ACCOUNT_ORDER) {
    const custom = saved[key];
    if (!custom) continue;
    accounts[key] = {
      key,
      code: custom.code?.trim() ?? "",
      name: custom.name?.trim() || DEFAULT_JOURNAL_ACCOUNTS[key].name,
    };
  }
  return accounts;
}

/** Journal entry for one branch of the period. */
export function branchJournalEntry(period: StoredPeriod, branch: BranchRow, accounts: JournalAccounts = DEFAULT_JOURNAL_ACCOUNTS): JournalEntry {
  return buildEntry(
    withPlatform(period) + " · " + branch.branch,
    period.period_end,
    amountsFor(period, branch),
    accounts,
  );
}

/**
 * Journal entry for the whole period: the sum of its branch entries, line by line, plus the HungerStation invoice
 * charges no branch carries.
 */
export function periodJournalEntry(period: StoredPeriod, accounts: JournalAccounts = DEFAULT_JOURNAL_ACCOUNTS): JournalEntry {
  const totals = new Map<JournalAccountKey, { debit: number; credit: number; memo: string }>();
  const notes = new Set<string>();
  const unallocated = hungerStationUnallocated(period);
  const entries = [
    ...period.branches.map((branch) => branchJournalEntry(period, branch, accounts)),
    ...(unallocated ? [buildEntry("", period.period_end, unallocated, accounts)] : []),
  ];
  for (const entry of entries) {
    entry.notes.forEach((note) => notes.add(note));
    for (const line of entry.lines) {
      const current = totals.get(line.account.key) ?? { debit: 0, credit: 0, memo: line.memo };
      current.debit += line.debit;
      current.credit += line.credit;
      totals.set(line.account.key, current);
    }
  }
  const lines: JournalLine[] = [];
  for (const key of JOURNAL_ACCOUNT_ORDER) {
    const total = totals.get(key);
    if (!total) continue;
    const net = round(total.debit - total.credit);
    if (Math.abs(net) < 0.005) continue;
    lines.push({ account: accounts[key], debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, memo: total.memo });
  }
  return {
    description: withPlatform(period) + " · كل الفروع",
    date: period.period_end,
    lines,
    totalDebit: round(lines.reduce((sum, line) => sum + line.debit, 0)),
    totalCredit: round(lines.reduce((sum, line) => sum + line.credit, 0)),
    notes: [...notes],
  };
}
