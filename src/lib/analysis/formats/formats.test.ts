import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";

import { detectHungerStationFormat } from "./hungerstation";
import { detectJahezFormat } from "./jahez";
import { detectKeetaFormat } from "./keeta";
import { UnsupportedFormatError } from "./types";

function workbook(sheetName: string, rows: unknown[][]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  return wb;
}

describe("platform format fingerprints", () => {
  test("detects the supported HungerStation order export", () => {
    const wb = workbook("Commissionable GMV", [
      [
        "Status",
        "Branch Name",
        "HS Branch ID",
        "Payment Type",
        "Commissionable GMV (VAT Excluded)",
        "Commission",
        "CC Amount",
        "Operation Day",
      ],
      ["Successful", "Branch A", 100, "Online", 100, 10, 50, "2026-08-01"],
    ]);

    expect(detectHungerStationFormat(wb)).toBe("hungerstation-orders-v1");
  });

  test("accepts HungerStation's Creation Time date alias", () => {
    const wb = workbook("001 Commissionable GMV", [
      [
        "Status",
        "Branch Name",
        "HS Branch ID",
        "Payment Type",
        "Commissionable GMV (VAT Excluded)",
        "Commission",
        "CC Amount",
        "Creation Time",
      ],
      ["Successful", "Branch A", 100, "Online", 100, 10, 50, "2026-08-01"],
    ]);

    expect(detectHungerStationFormat(wb)).toBe("hungerstation-orders-v1");
  });

  test("detects Keeta headers after preamble rows and aliases", () => {
    const wb = workbook("Order Summary", [
      ["Monthly report"],
      [],
      [
        "Brand Name",
        "Restaurant Name",
        "Transaction date",
        "Transaction type",
        "Original item price (VAT included)",
        "Subtotal of commission fee (VAT included)",
        "Bank fee (VAT included)",
        "Payable to Restaurant",
      ],
      ["Past", "Branch A", "01/08/2026", "Delivery order", 100, -10, -1, 89],
    ]);

    expect(detectKeetaFormat(wb)).toBe("keeta-order-summary-v1");
  });

  test("detects Jahez summary and detail sections", () => {
    const matrix = [
      [
        "Date",
        "Orders Amount",
        "Jahez Commision",
        "Restaurant Amount",
        "Payment Fees",
        "Payment Fees Vat",
        "Offer Amount",
        "Delivery Offer",
        "Delivery Coupon",
      ],
      ["01/08/2026 - 31/08/2026"],
      [],
      [
        "#",
        "Branch Name",
        "Order #",
        "Date",
        "Order Amount",
        "Jahez Commision",
        "Delivery Charge",
        "Restaurant Amount",
        "Payment Fees",
        "Payment Fees Vat",
        "Offer Amount",
        "Delivery Offer",
        "Delivery Coupon",
      ],
    ];

    expect(detectJahezFormat(matrix)).toBe("jahez-financial-report-v1");
  });

  test("rejects a changed platform format before accounting analysis", () => {
    const wb = workbook("Commissionable GMV", [
      [
        "Status",
        "Branch Name",
        "HS Branch ID",
        "Payment Type",
        "Commissionable GMV (VAT Excluded)",
        "Commission",
        "Operation Day",
      ],
      ["Successful", "Branch A", 100, "Online", 100, 10, "2026-08-01"],
    ]);

    try {
      detectHungerStationFormat(wb);
      throw new Error("expected UnsupportedFormatError");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedFormatError);
      expect((error as UnsupportedFormatError).missing).toContain("CC Amount");
      expect((error as Error).message).toContain("تم إيقاف التحليل");
    }
  });
});
