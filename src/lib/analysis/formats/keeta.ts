import * as XLSX from "xlsx";

import { resolveSheetName } from "../sheets";
import {
  UnsupportedFormatError,
  assertSupportedHeaders,
  missingHeaderGroups,
  type FormatFingerprint,
} from "./types";

export const KEETA_ORDER_FORMAT: FormatFingerprint = {
  id: "keeta-order-summary-v1",
  platform: "keeta",
  source: "Order Summary",
  requiredHeaderGroups: [
    ["Brand Name"],
    ["Store name", "Restaurant Name"],
    ["Transaction date"],
    ["Transaction type"],
    ["Original item price (VAT included)"],
    ["Subtotal of commission fee (VAT included)"],
    ["Bank fee (VAT included)"],
    ["Payable to merchant", "Payable to Restaurant"],
  ],
  optionalSources: ["Invoice Details", "Billing data summary"],
};

export function detectKeetaFormat(wb: XLSX.WorkBook): string {
  const sheetName = resolveSheetName(wb.SheetNames, "Order Summary", {
    platform: "keeta",
  });
  if (!sheetName || !wb.Sheets[sheetName]) {
    throw new UnsupportedFormatError({
      platform: "keeta",
      source: KEETA_ORDER_FORMAT.source,
      formatId: KEETA_ORDER_FORMAT.id,
      missing: ["ورقة Order Summary"],
    });
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName]!, {
    header: 1,
    defval: null,
    raw: true,
  });

  const headerRow = matrix.find(
    (row) =>
      missingHeaderGroups(row, KEETA_ORDER_FORMAT.requiredHeaderGroups)
        .length === 0,
  );

  if (!headerRow) {
    const candidate =
      matrix.find((row) =>
        row.some((value) => String(value ?? "").trim().length > 0),
      ) ?? [];
    const missing = missingHeaderGroups(
      candidate,
      KEETA_ORDER_FORMAT.requiredHeaderGroups,
    );
    throw new UnsupportedFormatError({
      platform: "keeta",
      source: KEETA_ORDER_FORMAT.source,
      formatId: KEETA_ORDER_FORMAT.id,
      missing: missing.length ? missing : ["صف عناوين Order Summary"],
    });
  }

  assertSupportedHeaders(KEETA_ORDER_FORMAT, headerRow);
  return KEETA_ORDER_FORMAT.id;
}
