import * as XLSX from "xlsx";

import { objectRows, resolveSheetName, rowKeys, workbookSheetSource } from "../sheets";
import type { SheetSource } from "../xlsx-stream";
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

export function detectHungerStationFormat(input: XLSX.WorkBook | SheetSource): string {
  const source = "matrix" in input ? input : workbookSheetSource(input);
  const sheetName = resolveSheetName(source.names, "Commissionable GMV", {
    platform: "hungerstation",
  });
  const matrix = sheetName ? source.matrix(sheetName) : undefined;

  if (!sheetName || !matrix) {
    throw new UnsupportedFormatError({
      platform: "hungerstation",
      source: HUNGERSTATION_ORDER_FORMAT.source,
      formatId: HUNGERSTATION_ORDER_FORMAT.id,
      missing: ["ورقة Commissionable GMV"],
    });
  }

  const first = objectRows(matrix, 1)[0];
  if (!first) {
    throw new UnsupportedFormatError({
      platform: "hungerstation",
      source: HUNGERSTATION_ORDER_FORMAT.source,
      formatId: HUNGERSTATION_ORDER_FORMAT.id,
      missing: ["صف العناوين والبيانات"],
    });
  }

  assertSupportedHeaders(HUNGERSTATION_ORDER_FORMAT, rowKeys(first));
  return HUNGERSTATION_ORDER_FORMAT.id;
}
