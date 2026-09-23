export const CONTRACT_PLATFORMS = [
  "hungerstation",
  "keeta",
  "jahez",
] as const;

export const CONTRACT_RULE_TYPES = [
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
] as const;

export const CONTRACT_VALUE_KINDS = [
  "percentage",
  "amount",
  "boolean",
  "text",
] as const;

export const CONTRACT_FUNDING_SOURCES = [
  "platform",
  "merchant",
  "shared",
  "unknown",
] as const;

export const CONTRACT_SCOPE_TYPES = ["all", "branch"] as const;

export type ContractPlatform = (typeof CONTRACT_PLATFORMS)[number];
export type ContractRuleType = (typeof CONTRACT_RULE_TYPES)[number];
export type ContractValueKind = (typeof CONTRACT_VALUE_KINDS)[number];
export type ContractFundingSource =
  (typeof CONTRACT_FUNDING_SOURCES)[number];
export type ContractScopeType = (typeof CONTRACT_SCOPE_TYPES)[number];

export const PLATFORM_LABELS: Record<ContractPlatform, string> = {
  hungerstation: "هنقرستيشن",
  keeta: "كيتا",
  jahez: "جاهز",
};

export const RULE_TYPE_LABELS: Record<ContractRuleType, string> = {
  commission_rate: "نسبة العمولة",
  payment_fee: "رسوم الدفع",
  wallet_fee: "رسوم المحفظة",
  minimum_fee: "الحد الأدنى للرسوم",
  delivery_fee: "رسوم التوصيل",
  promotion_funding: "تمويل العروض",
  free_delivery_funding: "تمويل التوصيل المجاني",
  advertising_fee: "رسوم الإعلانات",
  refund_rule: "قاعدة الاسترداد",
  tax_rule: "قاعدة الضريبة",
  other_fee: "رسوم أخرى",
};

export const VALUE_KIND_LABELS: Record<ContractValueKind, string> = {
  percentage: "نسبة مئوية",
  amount: "مبلغ",
  boolean: "نعم / لا",
  text: "نص",
};

export const FUNDING_SOURCE_LABELS: Record<ContractFundingSource, string> = {
  platform: "المنصة",
  merchant: "المطعم",
  shared: "مشترك",
  unknown: "غير محدد",
};

export interface ContractRecord {
  id: string;
  platform: ContractPlatform;
  name: string;
  externalReference: string | null;
  counterparty: string | null;
  createdAt: string;
}

export interface ContractVersionRecord {
  id: string;
  contractId: string;
  versionNumber: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "draft" | "approved";
  sourceNote: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface ContractRuleRecord {
  id: string;
  contractId: string;
  versionId: string;
  ruleKey: string;
  ruleType: ContractRuleType;
  valueKind: ContractValueKind;
  numericValue: number | null;
  textValue: string | null;
  currency: string | null;
  fundingSource: ContractFundingSource | null;
  scopeType: ContractScopeType;
  scopeKey: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ContractDocumentRecord {
  id: string;
  contractId: string;
  versionId: string;
  originalName: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ContractRuleEventRecord {
  id: string;
  contractId: string;
  entityType: "contract" | "version" | "rule" | "document";
  entityId: string;
  eventType: "insert" | "update" | "delete" | "approve";
  createdAt: string;
}

export interface ContractRulebookSnapshot {
  contracts: ContractRecord[];
  versions: ContractVersionRecord[];
  rules: ContractRuleRecord[];
  documents: ContractDocumentRecord[];
  events: ContractRuleEventRecord[];
}


export type ContractTermsResolution =
  | {
      status: "resolved";
      contractId: string;
      onDate: string;
      branchKey: string | null;
      version: {
        id: string;
        versionNumber: number;
        effectiveFrom: string;
        effectiveTo: string | null;
      };
      rules: ContractRuleRecord[];
    }
  | {
      status: "not_found";
      contractId: string;
      onDate: string;
      branchKey: string | null;
    };
