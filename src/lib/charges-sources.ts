import type { BranchRow } from "./analysis/types";
import type { MarketplaceChargeLine } from "./charges-mapper";
import type { StoredPeriod } from "./periods";

/**
 * Where each «كاشِف» line comes from: the file, the sheet, the exact column names the engine reads, and how the
 * amount is derived. Descriptive only: it mirrors the parsers in src/lib/analysis and never changes a figure.
 * When a parser changes a column or formula, update the matching entry here (charges-sources.test.ts checks
 * that every line the mapper can produce has an entry).
 */

export interface ChargeLineSource {
  file: string;
  sheet?: string;
  /** Column headers exactly as they appear in the platform file. */
  columns: string[];
  /** How the amount is computed from those columns, in plain Arabic. */
  formula: string;
  /** Per-branch value, when the stored branch rows hold the same figure. */
  branchValue?: (branch: BranchRow) => number;
}

const VAT_NOTE = "÷ 1.15 لإزالة ضريبة القيمة المضافة";

const HS_ORDERS = "ملف طلبات هنقرستيشن (Excel من بوابة التاجر)";
const HS_INVOICE = "فاتورة هنقرستيشن (PDF)";
const KEETA_FILE = "ملف كيتا (Excel)";
const JAHEZ_FILE = "تقرير جاهز المالي (Restaurant Financial Report)";

const KEETA_SIGN = "تُعكس الإشارة لأن الملف يسجّل الخصومات بالسالب، ثم " + VAT_NOTE + ".";

const SOURCES: Record<string, (period: StoredPeriod) => ChargeLineSource> = {
  "hs-commission": () => ({
    file: HS_ORDERS,
    sheet: "Commissionable GMV",
    columns: ["Commission"],
    formula: "مجموع عمود Commission لكل الطلبات المحتسبة في الفترة، وهو بدون الضريبة في الملف.",
    branchValue: (b) => b.commission,
  }),
  "hs-card-payment-fees": (period) => ({
    file: HS_ORDERS,
    sheet: "Commissionable GMV",
    columns: ["CC Amount", "Payment Type", "Status"],
    formula:
      "(مبالغ CC Amount للطلبات المدفوعة إلكترونياً + مبالغها للطلبات المرفوضة أو الفاشلة قبل الاستلام) × نسبة رسوم الدفع " +
      (period.summary.bankRate > 0 ? "(" + (period.summary.bankRate * 100).toFixed(2) + "%) " : "") +
      (period.summary.bankRateSource === "manual" ? "من العقد الذي أدخلته." : "المستنتجة من الفاتورة."),
    branchValue: (b) => (b.bankFeeSuccess ?? 0) + (b.bankFeeRefunded ?? 0),
  }),
  "hs-wallet-fee": () => ({
    file: HS_INVOICE,
    columns: [],
    formula: "بند رسوم مدفوعات المحافظ كما ورد في الفاتورة. لا يُعاد بناؤه من عمود Wallet Amount لأنه مبلغ تحصيل وليس أساس الرسوم.",
  }),
  "hs-rdf": () => ({
    file: HS_ORDERS,
    sheet: "Commissionable GMV",
    columns: ["Restaurant delivery Discount"],
    formula: "مجموع العمود للطلبات المحتسبة، " + VAT_NOTE + ".",
    branchValue: (b) => b.rdfCampaigns,
  }),
  "hs-compensation": () => ({
    file: HS_ORDERS,
    sheet: "Compensated Orders",
    columns: ["Compensation"],
    formula: "مجموع التعويضات في ورقة الطلبات المعوّضة، " + VAT_NOTE + ".",
    branchValue: (b) => b.compensation,
  }),
  "hs-flash-deals": () => ({
    file: HS_ORDERS,
    sheet: "Commissionable GMV",
    columns: ["Flash Deals Fee Excluding Vat"],
    formula: "مجموع العمود للطلبات المحتسبة، وهو بدون الضريبة في الملف.",
    branchValue: (b) => b.jokerFees,
  }),
  "hs-waiting-time": () => ({
    file: HS_ORDERS,
    sheet: "Waiting Time",
    columns: ["Avoidable Waiting Time Fee"],
    formula: "مجموع رسوم وقت الانتظار القابل للتجنب، " + VAT_NOTE + ".",
    branchValue: (b) => b.waitingTimeFees,
  }),
  "hs-cpc": () => ({
    file: "فاتورة إعلانات هنقرستيشن CPC (PDF)",
    columns: [],
    formula: "إجمالي فاتورة الإعلانات كما ورد فيها، شامل الضريبة.",
  }),
  "hs-restaurant-food-discount": () => ({
    file: HS_ORDERS,
    sheet: "Commissionable GMV",
    columns: ["Restaurant Food discount"],
    formula: "مجموع خصم الطعام الذي يموّله المطعم للطلبات المحتسبة.",
    branchValue: (b) => b.restaurantFoodDiscount,
  }),
  "hs-platform-food-discount": () => ({
    file: HS_ORDERS,
    sheet: "Commissionable GMV",
    columns: ["HS Food Discount", "Rewards Discounts"],
    formula: "مجموع خصومات الطعام والمكافآت التي تموّلها هنقرستيشن.",
    branchValue: (b) => b.hsFoodDiscount + b.rewardsDiscount,
  }),
  "hs-partial-refunds": () => ({
    file: HS_ORDERS,
    sheet: "Commissionable GMV",
    columns: ["CC Refund Amount", "Wallet Refund"],
    formula: "مجموع المبالغ المستردة للعملاء بالبطاقة والمحفظة.",
    branchValue: (b) => b.partialRefund,
  }),
  "hs-unmapped-invoice-extra-residual": () => ({
    file: "نتيجة التدقيق المحفوظة",
    columns: [],
    formula: "الفرق بين إجمالي بنود «من الفاتورة فقط» المحفوظ وتفصيلها؛ نتيجة قديمة لم تحفظ كل البنود مفصلة.",
  }),

  "keeta-commission": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: ["Subtotal of commission fee (VAT included)"],
    formula: "مجموع العمود لكل الطلبات. " + KEETA_SIGN,
    branchValue: (b) => b.keetaCommissionExVat ?? 0,
  }),
  "keeta-bank-fees": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: ["Bank fee (VAT included)"],
    formula: "مجموع العمود لكل الطلبات. " + KEETA_SIGN,
    branchValue: (b) => b.keetaBankFeesExVat ?? 0,
  }),
  "keeta-delivery": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: ["Delivery subsidies (Keeta delivery) covered by merchant"],
    formula: "مجموع العمود لكل الطلبات. " + KEETA_SIGN,
    branchValue: (b) => b.keetaDeliveryCampaignExVat ?? 0,
  }),
  "keeta-product-campaign": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: ["Product campaign expenses by merchant (VAT included)"],
    formula: "مجموع العمود لكل الطلبات. " + KEETA_SIGN,
    branchValue: (b) => b.keetaProductCampaignExVat ?? 0,
  }),
  "keeta-merchant-ads": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: ["Merchant ad spend (including VAT)", "Advertising costs"],
    formula: "مجموع العمود الموجود منهما في الملف. " + KEETA_SIGN,
    branchValue: (b) => b.keetaMerchantAdExVat ?? 0,
  }),
  "keeta-compensation": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: ["Total Platform Deductions from Merchant (Merchant's Liability, VAT included)"],
    formula: "مجموع العمود لكل الطلبات. " + KEETA_SIGN,
    branchValue: (b) => b.keetaCompensationExVat ?? 0,
  }),
  "keeta-pos": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: ["POS Machine Fee(VAT included)"],
    formula: "مجموع العمود لكل الطلبات. " + KEETA_SIGN,
    branchValue: (b) => b.keetaPosFeesExVat ?? 0,
  }),
  "keeta-unmapped-other": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: [
      "Photography Service Fee(VAT included)",
      "Monthly service fee (including VAT)",
      "Subscription fee (including VAT)",
      "Adjustment (including invoice)",
      "Delivery promotion subsidy (merchant delivery, including VAT) covered by merchant",
      "VAT withholding",
      "Adjustment decreases (not included in invoices)",
    ],
    formula:
      "مجموع هذه الأعمدة معاً (بدون رسوم جهاز POS المعروضة وحدها). " +
      KEETA_SIGN +
      " النتيجة المحفوظة تجمعها في رقم واحد، لذلك لا يُفترض نوعها.",
  }),
  "keeta-input-vat": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: [],
    formula: "إجمالي تكلفة المنصة شامل الضريبة − نفس التكلفة بدون الضريبة.",
    branchValue: (b) => b.keetaInputVat ?? 0,
  }),

  "jahez-commission": () => ({
    file: JAHEZ_FILE,
    sheet: "Jahez Order Details",
    columns: ["Jahez Commision"],
    formula: "مجموع عمولة جاهز لكل الطلبات (شامل الضريبة في الملف)، " + VAT_NOTE + ".",
  }),
  "jahez-payment-fees": () => ({
    file: JAHEZ_FILE,
    sheet: "Jahez Order Details",
    columns: ["Payment Fees"],
    formula: "مجموع رسوم المدفوعات لكل الطلبات، وهي بدون الضريبة في الملف.",
    branchValue: (b) => b.jahezPaymentFeesExVat ?? 0,
  }),
  "jahez-delivery-offer": () => ({
    file: JAHEZ_FILE,
    sheet: "Jahez Order Details",
    columns: ["Delivery Offer"],
    formula: "كل قيمة عرض توصيل تُحوَّل إلى مبلغها في الفاتورة بدون الضريبة حسب فئة العرض، ثم تُجمع.",
    branchValue: (b) => b.jahezDeliveryOfferInvoiceExVat ?? 0,
  }),
  "jahez-offer-amount": () => ({
    file: JAHEZ_FILE,
    sheet: "Jahez Order Details",
    columns: ["Offer Amount"],
    formula: "مجموع العمود لكل الطلبات.",
    branchValue: (b) => b.jahezOfferAmount ?? 0,
  }),
  "jahez-delivery-coupon": () => ({
    file: JAHEZ_FILE,
    sheet: "Jahez Order Details",
    columns: ["Delivery Coupon"],
    formula: "مجموع العمود لكل الطلبات.",
    branchValue: (b) => b.jahezDeliveryCoupon ?? 0,
  }),
  "jahez-tax": () => ({
    file: JAHEZ_FILE,
    sheet: "Jahez Order Details",
    columns: ["Jahez Commision", "Payment Fees Vat", "Delivery Offer"],
    formula:
      "ضريبة العمولة (العمولة شامل الضريبة − بدونها) + مجموع Payment Fees Vat + ضريبة عروض التوصيل (المخصوم − مبلغ الفاتورة بدون الضريبة).",
  }),
  "jahez-compensation-net": () => ({
    file: "تقرير تعويضات جاهز",
    sheet: "Jahez Compensation Details",
    columns: ["Restaurant_Total_Debit_Amount", "Restaurant_Total_Credit_Amount"],
    formula: "مجموع الخصومات (Debit) − مجموع الإضافات (Credit) على المطعم في الفترة.",
  }),
};

/** Source of one «كاشِف» line; falls back to the line's own short source for lines built at run time. */
export function chargeLineSource(line: MarketplaceChargeLine, period: StoredPeriod): ChargeLineSource {
  const known = SOURCES[line.id];
  if (known) return known(period);
  if (line.id.startsWith("hs-unmapped-invoice-extra-")) {
    return {
      file: HS_INVOICE,
      columns: [],
      formula: "بند ورد في الفاتورة باسمه «" + line.label + "» ولا يقابله عمود في ملف الطلبات، لذلك يبقى غير مصنف.",
    };
  }
  if (line.id.endsWith("-unmapped-reconciliation-residual")) {
    return {
      file: "مقارنة داخلية في تدقيق",
      columns: [],
      formula: "إجمالي رسوم التدقيق المحفوظ − مجموع كل البنود المصنفة أعلاه. أي فرق يظهر هنا بدلاً من أن يختفي.",
    };
  }
  return { file: line.source, columns: [], formula: "" };
}

/** Ids `chargeLineSource` documents explicitly; used by the coverage test. */
export const DOCUMENTED_CHARGE_LINE_IDS = Object.keys(SOURCES);
