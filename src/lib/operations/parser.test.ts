import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";

import { parseOperationFile } from "./parser";

function workbookFile(name: string, rows: unknown[][]): File {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([bytes], name);
}

describe("daily Operations parsers", () => {
  test("reads HungerStation delivery and complaint fields", async () => {
    const file = workbookFile("hunger.xlsx", [
      ["Order metadata", "Operations"],
      [
        "Order ID",
        "Order received at",
        "Order status",
        "Delivery type",
        "Has complaint?",
        "Complaint reason",
        "Store ID",
        "Restaurant name",
        "Subtotal",
        "Commission",
        "Payout amount",
        "Vendor refunds",
        "Discount Funded by you",
        "Voucher Funded by you",
        "Commission",
        "Online payment fee",
      ],
      [
        "H-1",
        "2026-10-06 10:00",
        "Delivered",
        "Platform delivery",
        "Y",
        "Missing item",
        "10",
        "Branch",
        100,
        20,
        75,
        5,
        10,
        2,
        20,
        3,
      ],
    ]);
    const result = await parseOperationFile(file, "hungerstation_orders");
    expect(result.businessDate).toBe("2026-10-06");
    expect(result.summary).toMatchObject({
      orderCount: 1,
      complaintCount: 1,
      refundCount: 1,
      refundAmount: 5,
      discountAmount: 12,
      commissionAmount: 20,
      paymentFeeAmount: 3,
    });
    expect(result.orders[0]?.deliveryMode).toBe("Platform delivery");
  });

  test("uses Keeta's long order number and keeps full refund state", async () => {
    const file = workbookFile("keeta.xlsx", [
      [
        "Order no.",
        "Order time",
        "Order status",
        "Earnings",
        "Store ID",
        "Store name",
        "Original price",
        "Refund type",
        "Campaign type",
        "Promotion funded by merchant",
        "Basic commission",
        "Online payment fee",
      ],
      [
        "5456824293009583",
        "6 Oct 2026 at 23:43",
        "Completed",
        "SAR 70",
        "20",
        "Branch",
        "SAR 100",
        "Full refund",
        "Delivery fee discounts",
        "-SAR 10",
        "-SAR 20",
        "-SAR 2",
      ],
    ]);
    const result = await parseOperationFile(file, "keeta_orders");
    expect(result.orders[0]?.orderId).toBe("5456824293009583");
    expect(result.summary).toMatchObject({
      refundCount: 1,
      deliveryAmount: 0,
      discountAmount: 10,
      commissionAmount: 20,
      paymentFeeAmount: 2,
      chargesTotal: 32,
    });
  });

  test("reads Jahez delivery amounts from its daily financial report", async () => {
    const file = new File(
      [
        [
          "Restaurant,Date,Orders Amount,Jahez Commision,Restaurant Amount,Payment Fees,Payment Fees Vat,Offer Amount,Delivery Offer,Delivery Coupon",
          "Past,06/10/2026 12:00:00 AM - 06/10/2026 11:59:59 PM,100,20,65,2,1,0,12,0",
          "",
          "#,Branch Name,Order #,Date,Order Amount,Jahez Commision,Delivery Charge,Restaurant Amount,Payment Fees,Payment Fees Vat,Offer Amount,Delivery Offer,Offer Type,Delivery Coupon",
          "1,Branch,J-1,06/10/2026 11:57:25 PM,100,20,0,65,2,1,0,12,-,0",
        ].join("\n"),
      ],
      "jahez.csv",
      { type: "text/csv" },
    );
    const result = await parseOperationFile(file, "jahez_orders");
    expect(result.summary).toMatchObject({
      orderCount: 1,
      deliveryAmount: 12,
      discountAmount: 0,
      commissionAmount: 20,
      paymentFeeAmount: 3,
      chargesTotal: 35,
      settlementAmount: 65,
    });
  });

  test("creates stable Jahez adjustment fingerprints", async () => {
    const file = new File(
      [
        [
          "Restaurant,Date,Transaction_Type,ReasonId,OrderId,BranchId,Sequence_Number,Restaurant_Total_Transactions,Restaurant_Total_Debit_Amount,Restaurant_Total_Credit_Amount",
          "Past,All,All,All,All,All,All,1,30,0",
          "",
          "",
          "",
          "#,Branch,Order #,Transaction Type,Reason,Creation Date,Amount,Free,Comments,Missing Item Name",
          "1,Branch,J-1,debit,Missing Item(s),06/10/2026 11:00:00 PM,30,false,On restaurant,Item",
        ].join("\n"),
      ],
      "refunds.csv",
      { type: "text/csv" },
    );
    const first = await parseOperationFile(file, "jahez_adjustments");
    const second = await parseOperationFile(file, "jahez_adjustments");
    expect(first.summary.adjustmentDebit).toBe(30);
    expect(first.adjustments[0]?.fingerprint).toBe(second.adjustments[0]?.fingerprint);
  });
});
