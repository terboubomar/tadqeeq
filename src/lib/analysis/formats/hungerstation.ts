import * as XLSX from "xlsx";

import { resolveSheetName } from "../sheets";
import {
  UnsupportedFormatError,
  assertSupportedHeaders,
  type FormatFingerprint,
} from "./types";

export const HUNGERSTATION_ORDER_FORMAT: FormatFingerprint = {
  id: "hungerstation-orders-v1",
  platform: "hungerstation",
  source: "Commissionable GMV",
  requiredHeaderGroups: [
    ["Status"],
    ["Branch Name"],
    ["HS Branch ID"],
    ["Payment Type"],
    ["Commissionable GMV (VAT Excluded)"],
    ["Commission"],
    ["CC Amount"],
    ["Operation Day", "Creation Time"],
  ],
  optionalSources: [
    "Free Delivery",
    "Compensation",
    "Fulfilment Modification",
    "Partial Refund",
    "Waiting Time",
  ],
};

export function detectHungerStationFormat(wb: XLSX.WorkBook): string {
  const sheetName = resolveSheetName(wb.SheetNames, "Commissionable GMV", {
    platform: "hungerstation",
  });

  if (!sheetName || !wb.Sheets[sheetName]) {
    throw new UnsupportedFormatError({
      platform: "hungerstation",
      source: HUNGERSTATION_ORDER_FORMAT.source,
      formatId: HUNGERSTATION_ORDER_FORMAT.id,
      missing: ["ورقة Commissionable GMV"],
    });
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets[sheetName]!,
    { defval: null },
  );
  const first = rows[0];
  if (!first) {
    throw new UnsupportedFormatError({
      platform: "hungerstation",
      source: HUNGERSTATION_ORDER_FORMAT.source,
      formatId: HUNGERSTATION_ORDER_FORMAT.id,
      missing: ["صف العناوين والبيانات"],
    });
  }

  assertSupportedHeaders(HUNGERSTATION_ORDER_FORMAT, Object.keys(first));
  return HUNGERSTATION_ORDER_FORMAT.id;
}
