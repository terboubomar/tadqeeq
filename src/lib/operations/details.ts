import type { OperationOrderDetail, OperationPlatform } from "./types";

type RawValue = string | number | boolean | null;
type RawData = Record<string, RawValue>;

export interface StoredOperationOrder {
  order_id: string;
  business_date: string;
  branch_id: string | null;
  branch_name: string | null;
  status: string | null;
  delivery_mode: string | null;
  gross_sales: number | string;
  delivery_amount: number | string;
  complaint: boolean;
  complaint_reason: string | null;
  refund_amount: number | string | null;
  charges_total: number | string;
  settlement_amount: number | string;
  raw_data: RawData;
}

function numeric(value: RawValue | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number(
    value
      .replace(/\u00a0/g, " ")
      .replace(/SAR/gi, "")
      .replace(/,/g, "")
      .replace(/[^0-9.+-]/g, ""),
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

const abs = (value: number) => Math.abs(value);
const sum = (...values: number[]) => values.reduce((total, value) => total + value, 0);

function value(raw: RawData, ...keys: string[]): number {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") return numeric(raw[key]);
  }
  return 0;
}

export function operationCostRatio(charges: number, sales: number): number | null {
  return sales > 0 ? Math.abs(charges) / sales : null;
}

export function operationCommissionRatio(commission: number, sales: number): number | null {
  return sales > 0 ? commission / sales : null;
}

export function mapStoredOperationOrder(
  platform: OperationPlatform,
  row: StoredOperationOrder,
): OperationOrderDetail {
  const raw = row.raw_data ?? {};
  const storedGrossSales = numeric(row.gross_sales);
  const storedDelivery = numeric(row.delivery_amount);
  const storedCharges = numeric(row.charges_total);
  const storedSettlement = numeric(row.settlement_amount);
  const storedRefund = numeric(row.refund_amount ?? 0);

  if (platform === "hungerstation") {
    const discount = abs(value(raw, "Discount Funded by you"));
    const voucher = abs(value(raw, "Voucher Funded by you"));
    const commission = abs(value(raw, "Commission"));
    const paymentFee = abs(value(raw, "Online payment fee"));
    const otherFee = abs(
      sum(
        value(raw, "Operational charges"),
        value(raw, "Ads fee"),
        value(raw, "Wait time fee"),
        value(raw, "Marketing fees total"),
        value(raw, "Avoidable cancellation fee"),
      ),
    );
    return {
      orderId: row.order_id,
      businessDate: row.business_date,
      branchId: row.branch_id,
      branchName: row.branch_name,
      status: row.status,
      deliveryMode: row.delivery_mode,
      subtotalAmount: value(raw, "Subtotal"),
      packagingAmount: value(raw, "Packaging charges"),
      grossSales: storedGrossSales,
      deliveryAmount: abs(
        value(
          raw,
          "Delivery Funded by you",
          "Delivery offer funded by you",
          "Delivery discount funded by you",
          "Delivery fee funded by you",
        ),
      ),
      discountAmount: discount + voucher,
      merchantFundedDiscountAmount: discount,
      merchantFundedVoucherAmount: voucher,
      commissionAmount: commission,
      paymentFeeAmount: paymentFee,
      otherFeeAmount: otherFee,
      refundAmount: abs(storedRefund || value(raw, "Vendor refunds")),
      chargesTotal: abs(storedCharges),
      estimatedEarningsAmount: value(raw, "Estimated earnings"),
      settlementAmount: storedSettlement,
      complaint: row.complaint,
      complaintReason: row.complaint_reason,
    };
  }

  if (platform === "keeta") {
    const current = raw["Sales"] !== undefined;
    const discount = abs(
      current ? value(raw, "Promotion expense") : value(raw, "Promotion funded by merchant"),
    );
    const commission = abs(current ? value(raw, "Commission") : value(raw, "Basic commission"));
    const paymentFee = abs(current ? 0 : value(raw, "Online payment fee"));
    const otherFee = abs(current ? value(raw, "Other expenses") : 0);
    return {
      orderId: row.order_id,
      businessDate: row.business_date,
      branchId: row.branch_id,
      branchName: row.branch_name,
      status: row.status,
      deliveryMode: row.delivery_mode,
      subtotalAmount: current ? value(raw, "Sales") : value(raw, "Original price", "Customer paid"),
      packagingAmount: 0,
      grossSales: storedGrossSales,
      deliveryAmount: storedDelivery,
      discountAmount: discount,
      merchantFundedDiscountAmount: discount,
      merchantFundedVoucherAmount: 0,
      commissionAmount: commission,
      paymentFeeAmount: paymentFee,
      otherFeeAmount: otherFee,
      refundAmount: abs(storedRefund),
      chargesTotal: abs(storedCharges),
      estimatedEarningsAmount: value(raw, "Earnings"),
      settlementAmount: storedSettlement,
      complaint: row.complaint,
      complaintReason: row.complaint_reason,
    };
  }

  const commission = abs(value(raw, "Jahez Commision"));
  const paymentFee = abs(sum(value(raw, "Payment Fees"), value(raw, "Payment Fees Vat")));
  const restaurantDiscount = abs(value(raw, "Offer Amount"));
  const deliveryCoupon = abs(value(raw, "Delivery Coupon"));
  return {
    orderId: row.order_id,
    businessDate: row.business_date,
    branchId: row.branch_id,
    branchName: row.branch_name,
    status: row.status,
    deliveryMode: row.delivery_mode,
    subtotalAmount: value(raw, "Order Amount"),
    packagingAmount: 0,
    grossSales: storedGrossSales,
    deliveryAmount: storedDelivery,
    discountAmount: restaurantDiscount + deliveryCoupon,
    merchantFundedDiscountAmount: restaurantDiscount,
    merchantFundedVoucherAmount: deliveryCoupon,
    commissionAmount: commission,
    paymentFeeAmount: paymentFee,
    otherFeeAmount: 0,
    refundAmount: abs(storedRefund),
    chargesTotal: abs(storedCharges),
    estimatedEarningsAmount: value(raw, "Restaurant Amount"),
    settlementAmount: storedSettlement,
    complaint: row.complaint,
    complaintReason: row.complaint_reason,
  };
}
