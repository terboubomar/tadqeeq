import type { StoredPeriod } from "./periods";

export type MarketplaceChargeCategory =
  | "commission"
  | "payment_fee"
  | "delivery_campaign"
  | "promotion"
  | "advertising"
  | "pos_fee"
  | "compensation"
  | "refund"
  | "tax"
  | "other_fee"
  | "unmapped";

export type MarketplaceChargeScope = "audit_total" | "outside_audit_total";
export type MarketplaceChargeFunding = "merchant" | "platform" | "shared" | "unknown";
export type MarketplaceChargeEvidence = "data" | "invoice" | "mixed";

export interface MarketplaceChargeLine {
  id: string;
  category: MarketplaceChargeCategory;
  label: string;
  amount: number;
  scope: MarketplaceChargeScope;
  source: string;
  evidence: MarketplaceChargeEvidence;
  fundingSource: MarketplaceChargeFunding;
  mapped: boolean;
  note?: string;
}

export interface MarketplaceChargeMap {
  periodId: string;
  platform: StoredPeriod["platform"];
  auditTotalCharges: number;
  mappedAuditAmount: number;
  unmappedAuditAmount: number;
  outsideAuditAmount: number;
  coveragePct: number;
  reconciliationVariance: number;
  mappedLineCount: number;
  unmappedLineCount: number;
  lines: MarketplaceChargeLine[];
}

export const MARKETPLACE_CHARGE_CATEGORY_LABELS: Record<
  MarketplaceChargeCategory,
  string
> = {
  commission: "العمولة",
  payment_fee: "رسوم الدفع",
  delivery_campaign: "التوصيل والحملات",
  promotion: "العروض الممولة",
  advertising: "الإعلانات",
  pos_fee: "رسوم نقاط البيع",
  compensation: "التعويضات والخصومات",
  refund: "المرتجعات والاستردادات",
  tax: "الضريبة",
  other_fee: "رسوم أخرى معروفة",
  unmapped: "غير مصنف",
};

const RECONCILIATION_TOLERANCE = 0.05;

function money(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function hasAmount(value: number): boolean {
  return Math.abs(value) > RECONCILIATION_TOLERANCE;
}

function sum(lines: MarketplaceChargeLine[]): number {
  return money(lines.reduce((total, line) => total + line.amount, 0));
}

function addLine(
  lines: MarketplaceChargeLine[],
  input: Omit<MarketplaceChargeLine, "amount"> & { amount: number | null | undefined },
): void {
  const amount = money(input.amount);
  if (!hasAmount(amount)) return;
  lines.push({ ...input, amount });
}

function hungerStationLines(period: StoredPeriod): MarketplaceChargeLine[] {
  const s = period.summary;
  const lines: MarketplaceChargeLine[] = [];

  addLine(lines, {
    id: "hs-commission",
    category: "commission",
    label: "عمولة هنقرستيشن",
    amount: s.commission,
    scope: "audit_total",
    source: "ملف الطلبات",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
  });

  addLine(lines, {
    id: "hs-card-payment-fees",
    category: "payment_fee",
    label: "رسوم الدفع بالبطاقات",
    amount: (s.bankFeeSuccess ?? 0) + (s.bankFeeRefunded ?? 0),
    scope: "audit_total",
    source:
      s.bankRateSource === "manual"
        ? "ملف الطلبات + نسبة العقد"
        : "ملف الطلبات + نسبة مستنتجة من الفاتورة",
    evidence: "mixed",
    fundingSource: "merchant",
    mapped: true,
    note:
      s.bankRateSource === "invoice"
        ? "النسبة مستنتجة من الفاتورة وتبقى أقل استقلالية من نسبة عقد معتمدة."
        : undefined,
  });

  addLine(lines, {
    id: "hs-wallet-fee",
    category: "payment_fee",
    label: "رسوم مدفوعات المحافظ",
    amount: s.walletFee,
    scope: "audit_total",
    source: "فاتورة هنقرستيشن",
    evidence: "invoice",
    fundingSource: "merchant",
    mapped: true,
    note: "أساس رسوم المحافظ لا يُعاد بناؤه من Wallet Amount؛ القيمة مأخوذة من الفاتورة.",
  });

  addLine(lines, {
    id: "hs-rdf",
    category: "delivery_campaign",
    label: "دعم / خصم التوصيل الممول من المطعم",
    amount: s.rdfCampaigns,
    scope: "audit_total",
    source: "ملف الطلبات",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
  });

  addLine(lines, {
    id: "hs-compensation",
    category: "compensation",
    label: "تعويضات ورسوم مرتبطة بالطلبات",
    amount: s.compensation,
    scope: "audit_total",
    source: "ملف الطلبات",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
  });

  addLine(lines, {
    id: "hs-flash-deals",
    category: "promotion",
    label: "رسوم Flash Deals / Joker",
    amount: s.jokerFees,
    scope: "audit_total",
    source: "ملف الطلبات",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
  });

  addLine(lines, {
    id: "hs-waiting-time",
    category: "other_fee",
    label: "رسوم وقت الانتظار",
    amount: s.waitingTimeFees,
    scope: "audit_total",
    source: "ملف الطلبات",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
  });

  const invoiceOnlyExtras = (period.invoice?.extras ?? []).filter(
    (extra) => !extra.label.includes("محفظة"),
  );
  const visibleInvoiceOnlyTotal = money(
    invoiceOnlyExtras.reduce((total, extra) => total + extra.amount, 0),
  );

  for (const [index, extra] of invoiceOnlyExtras.entries()) {
    addLine(lines, {
      id: "hs-unmapped-invoice-extra-" + String(index + 1),
      category: "unmapped",
      label: extra.label || "بند فاتورة غير مصنف",
      amount: extra.amount,
      scope: "audit_total",
      source: "فاتورة هنقرستيشن",
      evidence: "invoice",
      fundingSource: "unknown",
      mapped: false,
      note:
        "البند موجود في الفاتورة فقط ولا توجد في snapshot الحالية بيانات مستقلة تكفي لتصنيفه بأمان.",
    });
  }

  const invoiceOnlySnapshotResidual = money(
    (s.invoiceOnlyExtras ?? 0) - visibleInvoiceOnlyTotal,
  );
  addLine(lines, {
    id: "hs-unmapped-invoice-extra-residual",
    category: "unmapped",
    label: "بنود فاتورة فقط غير مفصلة في snapshot",
    amount: invoiceOnlySnapshotResidual,
    scope: "audit_total",
    source: "نتيجة التدقيق المحفوظة",
    evidence: "invoice",
    fundingSource: "unknown",
    mapped: false,
    note:
      "يظهر هذا الرصيد عندما تحتوي نتيجة محفوظة على إجمالي بنود فاتورة فقط بدون تفاصيل كافية لتوزيعها.",
  });

  addLine(lines, {
    id: "hs-cpc",
    category: "advertising",
    label: "إعلانات CPC",
    amount: period.invoice?.cpc,
    scope: "outside_audit_total",
    source: "فاتورة CPC",
    evidence: "invoice",
    fundingSource: "merchant",
    mapped: true,
    note: "يعرض منفصلاً لأنه ليس جزءاً من summary.totalCharges الحالي.",
  });

  addLine(lines, {
    id: "hs-restaurant-food-discount",
    category: "promotion",
    label: "خصم الطعام الممول من المطعم",
    amount: s.restaurantFoodDiscount,
    scope: "outside_audit_total",
    source: "ملف الطلبات",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
    note: "تكلفة عرض تجارية وليست جزءاً من إجمالي رسوم المنصة الحالي.",
  });

  addLine(lines, {
    id: "hs-platform-food-discount",
    category: "promotion",
    label: "خصومات الطعام والمكافآت الممولة من المنصة",
    amount: (s.hsFoodDiscount ?? 0) + (s.rewardsDiscount ?? 0),
    scope: "outside_audit_total",
    source: "ملف الطلبات",
    evidence: "data",
    fundingSource: "platform",
    mapped: true,
    note:
      "تمويل منصة ظاهر في بيانات هنقرستيشن؛ يعرض منفصلاً عن تكلفة المطعم ولا يخصم من مساهمة المطعم.",
  });

  addLine(lines, {
    id: "hs-partial-refunds",
    category: "refund",
    label: "مرتجعات جزئية للعملاء",
    amount: s.partialRefund,
    scope: "outside_audit_total",
    source: "ملف الطلبات",
    evidence: "data",
    fundingSource: "unknown",
    mapped: true,
    note: "تعرض خارج إجمالي رسوم المنصة حتى لا تتغير معادلات المحرك الحالية.",
  });

  return lines;
}

function keetaLines(period: StoredPeriod): MarketplaceChargeLine[] {
  const s = period.summary;
  const lines: MarketplaceChargeLine[] = [];

  addLine(lines, {
    id: "keeta-commission",
    category: "commission",
    label: "عمولة كيتا",
    amount: s.keetaCommissionExVat ?? s.commission,
    scope: "audit_total",
    source: "Order Summary",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
  });
  addLine(lines, {
    id: "keeta-bank-fees",
    category: "payment_fee",
    label: "رسوم البنك",
    amount: s.keetaBankFeesExVat,
    scope: "audit_total",
    source: "Order Summary",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
  });
  addLine(lines, {
    id: "keeta-delivery",
    category: "delivery_campaign",
    label: "دعم التوصيل الممول من المطعم",
    amount: s.keetaDeliveryCampaignExVat,
    scope: "audit_total",
    source: "Order Summary",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
  });
  addLine(lines, {
    id: "keeta-product-campaign",
    category: "promotion",
    label: "Product Campaign",
    amount: s.keetaProductCampaignExVat,
    scope: "audit_total",
    source: "Order Summary",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
  });
  addLine(lines, {
    id: "keeta-merchant-ads",
    category: "advertising",
    label: "Merchant Ad Spend",
    amount: s.keetaMerchantAdExVat,
    scope: "audit_total",
    source: "Order Summary",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
  });
  addLine(lines, {
    id: "keeta-compensation",
    category: "compensation",
    label: "Platform Deductions / Merchant Liability",
    amount: s.keetaCompensationExVat,
    scope: "audit_total",
    source: "Order Summary",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
  });
  addLine(lines, {
    id: "keeta-pos",
    category: "pos_fee",
    label: "رسوم جهاز POS",
    amount: s.keetaPosFeesExVat,
    scope: "audit_total",
    source: "Order Summary",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
  });

  const otherExVat = money(
    (s.keetaOtherExpensesExVat ?? 0) - (s.keetaPosFeesExVat ?? 0),
  );
  addLine(lines, {
    id: "keeta-unmapped-other",
    category: "unmapped",
    label: "مصروفات كيتا الأخرى غير المفصلة",
    amount: otherExVat,
    scope: "audit_total",
    source: "Order Summary",
    evidence: "data",
    fundingSource: "unknown",
    mapped: false,
    note:
      "الـ snapshot الحالية تجمع عدة أعمدة في Other Expenses. لا يفترض Tadqeeq نوعها أو جهة تمويلها بدون تفصيل مستقل.",
  });

  addLine(lines, {
    id: "keeta-input-vat",
    category: "tax",
    label: "ضريبة المدخلات على تكلفة المنصة",
    amount: s.keetaInputVat,
    scope: "outside_audit_total",
    source: "Order Summary",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
    note: "تعرض منفصلة لأن summary.totalCharges في كيتا محفوظ بدون الضريبة.",
  });

  return lines;
}

function jahezLines(period: StoredPeriod): MarketplaceChargeLine[] {
  const s = period.summary;
  const lines: MarketplaceChargeLine[] = [];

  addLine(lines, {
    id: "jahez-commission",
    category: "commission",
    label: "عمولة جاهز بدون الضريبة",
    amount: s.jahezCommissionInvoiceExVat ?? s.commission,
    scope: "audit_total",
    source: "Restaurant Financial Report",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
  });
  addLine(lines, {
    id: "jahez-payment-fees",
    category: "payment_fee",
    label: "رسوم المدفوعات",
    amount: s.jahezPaymentFeesExVat,
    scope: "audit_total",
    source: "Restaurant Financial Report",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
  });
  addLine(lines, {
    id: "jahez-delivery-offer",
    category: "delivery_campaign",
    label: "عروض التوصيل بدون الضريبة",
    amount: s.jahezDeliveryOfferInvoiceExVat,
    scope: "audit_total",
    source: "Restaurant Financial Report",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
  });

  addLine(lines, {
    id: "jahez-offer-amount",
    category: "promotion",
    label: "Offer Amount",
    amount: s.jahezOfferAmount,
    scope: "outside_audit_total",
    source: "Restaurant Financial Report",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
    note: "يؤثر على صافي المطعم لكنه ليس جزءاً من summary.totalCharges الحالي.",
  });
  addLine(lines, {
    id: "jahez-delivery-coupon",
    category: "promotion",
    label: "Delivery Coupon",
    amount: s.jahezDeliveryCoupon,
    scope: "outside_audit_total",
    source: "Restaurant Financial Report",
    evidence: "data",
    fundingSource: "unknown",
    mapped: true,
    note: "جهة التمويل لا تُفترض من اسم العمود وحده.",
  });

  const commissionVat = money(
    (s.jahezCommissionInclVat ?? 0) -
      (s.jahezCommissionInvoiceExVat ?? s.commission ?? 0),
  );
  const deliveryVat = money(
    (s.jahezDeliveryOfferInclVat ?? 0) -
      (s.jahezDeliveryOfferInvoiceExVat ?? 0),
  );
  addLine(lines, {
    id: "jahez-tax",
    category: "tax",
    label: "ضريبة الرسوم والعمولات",
    amount: commissionVat + (s.jahezPaymentFeesVat ?? 0) + deliveryVat,
    scope: "outside_audit_total",
    source: "Restaurant Financial Report",
    evidence: "data",
    fundingSource: "merchant",
    mapped: true,
    note: "تعرض منفصلة لأن summary.totalCharges في جاهز محفوظ بدون الضريبة.",
  });

  addLine(lines, {
    id: "jahez-compensation-net",
    category: "compensation",
    label: "صافي أثر التعويضات",
    amount: s.jahezCompensationNetImpact,
    scope: "outside_audit_total",
    source: "ملف التعويضات",
    evidence: "data",
    fundingSource: "unknown",
    mapped: true,
    note:
      "القيمة موجبة عندما يكون صافي الأثر خصماً، وسالبة عندما يكون صافي الأثر إضافة.",
  });

  return lines;
}

export function buildMarketplaceChargeMap(
  period: StoredPeriod,
): MarketplaceChargeMap {
  const lines =
    period.platform === "hungerstation"
      ? hungerStationLines(period)
      : period.platform === "keeta"
        ? keetaLines(period)
        : jahezLines(period);

  const auditTotalCharges = money(period.summary.totalCharges ?? 0);
  const auditLines = lines.filter((line) => line.scope === "audit_total");
  const firstPassVariance = money(auditTotalCharges - sum(auditLines));

  if (hasAmount(firstPassVariance)) {
    addLine(lines, {
      id: period.platform + "-unmapped-reconciliation-residual",
      category: "unmapped",
      label: "فرق غير مصنف لإقفال إجمالي الرسوم",
      amount: firstPassVariance,
      scope: "audit_total",
      source: "مقارنة خريطة الرسوم مع summary.totalCharges",
      evidence: "mixed",
      fundingSource: "unknown",
      mapped: false,
      note:
        "Tadqeeq لم يخمّن تصنيف هذا الرصيد. قد ينتج من snapshot قديمة أو حقل لم تتم إضافته بعد إلى خريطة الرسوم.",
    });
  }

  const finalAuditLines = lines.filter((line) => line.scope === "audit_total");
  const unmappedAuditLines = finalAuditLines.filter((line) => !line.mapped);
  const unmappedAuditAmount = money(
    unmappedAuditLines.reduce(
      (total, line) => total + Math.abs(line.amount),
      0,
    ),
  );
  const totalMagnitude = Math.abs(auditTotalCharges);
  const coveragePct =
    totalMagnitude <= RECONCILIATION_TOLERANCE
      ? 1
      : Math.max(
          0,
          Math.min(1, (totalMagnitude - unmappedAuditAmount) / totalMagnitude),
        );

  return {
    periodId: period.id,
    platform: period.platform,
    auditTotalCharges,
    mappedAuditAmount: money(Math.max(0, totalMagnitude - unmappedAuditAmount)),
    unmappedAuditAmount,
    outsideAuditAmount: money(
      lines
        .filter((line) => line.scope === "outside_audit_total")
        .reduce((total, line) => total + line.amount, 0),
    ),
    coveragePct,
    reconciliationVariance: money(auditTotalCharges - sum(finalAuditLines)),
    mappedLineCount: finalAuditLines.filter((line) => line.mapped).length,
    unmappedLineCount: unmappedAuditLines.length,
    lines,
  };
}

export function buildAllMarketplaceChargeMaps(
  periods: StoredPeriod[],
): MarketplaceChargeMap[] {
  return periods.map(buildMarketplaceChargeMap);
}
