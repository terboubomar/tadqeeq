import {
  UnsupportedFormatError,
  assertSupportedHeaders,
  type FormatFingerprint,
} from "./types";

export const JAHEZ_SUMMARY_FORMAT: FormatFingerprint = {
  id: "jahez-financial-report-v1",
  platform: "jahez",
  source: "Jahez Summary",
  requiredHeaderGroups: [
    ["Date"],
    ["Orders Amount"],
    ["Jahez Commision"],
    ["Restaurant Amount"],
    ["Payment Fees"],
    ["Payment Fees Vat"],
    ["Offer Amount"],
    ["Delivery Offer"],
    ["Delivery Coupon"],
  ],
};

export const JAHEZ_DETAIL_FORMAT: FormatFingerprint = {
  id: "jahez-financial-report-v1",
  platform: "jahez",
  source: "Jahez Order Details",
  requiredHeaderGroups: [
    ["#"],
    ["Branch Name"],
    ["Order #"],
    ["Date"],
    ["Order Amount"],
    ["Jahez Commision"],
    ["Delivery Charge"],
    ["Restaurant Amount"],
    ["Payment Fees"],
    ["Payment Fees Vat"],
    ["Offer Amount"],
    ["Delivery Offer"],
    ["Delivery Coupon"],
  ],
};

export function detectJahezFormat(matrix: string[][]): string {
  const summaryHeaders = matrix[0];
  if (!summaryHeaders) {
    throw new UnsupportedFormatError({
      platform: "jahez",
      source: JAHEZ_SUMMARY_FORMAT.source,
      formatId: JAHEZ_SUMMARY_FORMAT.id,
      missing: ["صف ملخص التاجر"],
    });
  }
  assertSupportedHeaders(JAHEZ_SUMMARY_FORMAT, summaryHeaders);

  const detailHeaders = matrix.find((row) => row[0]?.trim() === "#");
  if (!detailHeaders) {
    throw new UnsupportedFormatError({
      platform: "jahez",
      source: JAHEZ_DETAIL_FORMAT.source,
      formatId: JAHEZ_DETAIL_FORMAT.id,
      missing: ["جدول الطلبات التفصيلي"],
    });
  }
  assertSupportedHeaders(JAHEZ_DETAIL_FORMAT, detailHeaders);

  return JAHEZ_SUMMARY_FORMAT.id;
}
