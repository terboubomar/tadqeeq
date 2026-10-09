import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";

import { branchSummaries, mergeKeetaOrderRows, parseOperationFile } from "./parser";

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
        "Estimated earnings",
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
        80,
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
      merchantFundedDiscountAmount: 10,
      merchantFundedVoucherAmount: 2,
      commissionAmount: 20,
      paymentFeeAmount: 3,
      estimatedEarningsAmount: 80,
    });
    expect(result.orders[0]?.deliveryMode).toBe("Platform delivery");
  });

  test("keeps HungerStation's local operating date for early-hour CSV orders", async () => {
    const file = new File(
      [
        [
          "Order ID,Order received at,Order status,Delivery type,Subtotal,Payout amount",
          "H-1,2026-10-06 00:03,Delivered,Platform delivery,50,35",
          "H-2,2026-10-06 23:58,Delivered,Platform delivery,40,28",
        ].join("\n"),
      ],
      "Orders.csv",
      { type: "text/csv" },
    );
    const result = await parseOperationFile(file, "hungerstation_orders");
    expect(result.businessDate).toBe("2026-10-06");
    expect(result.summary.orderCount).toBe(2);
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

  test("reads Keeta's current daily Operations export", async () => {
    const file = workbookFile(
      "keeta-current.xlsx",
      [
        [
          "Date",
          "Store ID",
          "Store name",
          "Order ID",
          "Order type",
          "Order time",
          "Order status",
          "Cancellation type",
          "Earnings",
          "Sales",
          "Promotion expense",
          "Keeta promotion subsidies",
          "Commission",
          "Other expenses",
          "Delivery fee",
          "Reason for order cancellation",
        ],
        [
          20261006,
          467438,
          "Branch",
          "5446822219993624",
          "Delivery",
          "20261005 23:50:00",
          "Partial refund",
          "Cancelled by user after acceptance",
          102.44,
          142,
          14,
          9,
          21.48,
          4.08,
          23,
          "Missing item",
        ],
        [
          20261006,
          467438,
          "Branch",
          "5446822219993625",
          "Delivery",
          "20261006 08:00:00",
          "Completed",
          "-",
          "-\u00a01.27",
          "-\u00a06.86",
          0,
          0,
          "-\u00a00.41",
          0,
          0,
          "",
        ],
      ],
    );
    const result = await parseOperationFile(file, "keeta_orders");
    expect(result.businessDate).toBe("2026-10-06");
    expect(result.orders[0]?.orderId).toBe("5446822219993624");
    expect(result.orders[0]?.rawData["Keeta promotion subsidies"]).toBe(9);
    expect(result.summary).toMatchObject({
      orderCount: 2,
      grossSales: 135.14,
      deliveryAmount: 23,
      complaintCount: 1,
      refundCount: 1,
      refundAmount: 0,
      discountAmount: 14,
      commissionAmount: 21.07,
      paymentFeeAmount: 4.08,
      chargesTotal: 39.15,
      settlementAmount: 101.17,
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

  test("HungerStation: cancelled orders are not sales; the payout is Estimated earnings", async () => {
    const file = new File(
      [
        [
          "Order ID,Order received at,Order status,Delivery type,Subtotal,Commission,Online payment fee,Discount Funded by you,Estimated earnings,Payout amount",
          "H-1,2026-10-01 12:00,Delivered,Pickup,130.00,29.32,2.50,2.50,95.68,72.00",
          "H-2,2026-10-01 13:00,Cancelled,Platform delivery,68.00,0.00,0.00,0.00,20.40,20.40",
        ].join("\n"),
      ],
      "Orders_1_Oct.csv",
      { type: "text/csv" },
    );
    const result = await parseOperationFile(file, "hungerstation_orders");
    expect(result.summary).toMatchObject({
      orderCount: 1,
      grossSales: 130,
      cancellationCount: 1,
      settlementAmount: 116.08,
      cancelledEarningsAmount: 20.4,
    });
    expect(result.orders).toHaveLength(2);
    expect(result.orders[1]).toMatchObject({ grossSales: 0, excludedFromSales: true });
    // Payout amount stays in the stored row for reference.
    expect(result.orders[0]?.rawData["Payout amount"]).toBe(72);
  });

  test("Keeta: an order listed twice (its row and the «*» compensation row) is one order with both amounts", async () => {
    const header = ["Date", "Store ID", "Store name", "Order ID", "Order type", "Order status", "Cancellation type", "Earnings", "Sales", "Compensation", "Promotion expense", "Commission", "Other expenses", "Delivery fee"];
    const file = workbookFile("keeta-split.xlsx", [
      header,
      [20261005, 1, "Branch", "5446823774992737", "Delivery", "Partial refund", "Cancelled by customer service", 0, 8.6, 0, 0, 0, 0, 0],
      [20261005, 1, "Branch", "5446823774992737", "Delivery", "Partial refund*", "Cancelled by Keeta (compensation to store)", 0, 0, 0, 11, 6, 1.24, 19],
      [20261005, 1, "Branch", "5446822000000001", "Delivery", "Completed", "-", 70, 100, 0, 10, 18, 2, 15],
    ]);
    const result = await parseOperationFile(file, "keeta_orders");
    expect(result.orders).toHaveLength(2);
    expect(result.orders[0]).toMatchObject({
      orderId: "5446823774992737",
      status: "Partial refund",
      grossSales: 8.6,
      commissionAmount: 6,
      chargesTotal: 18.24,
      deliveryAmount: 19,
    });
    expect(result.summary).toMatchObject({ orderCount: 2, grossSales: 108.6, chargesTotal: 48.24, settlementAmount: 70 });
  });

  test("Keeta merge keeps single rows untouched", () => {
    const row = { "Order ID": "1", "Order status": "Completed", Sales: 10 };
    expect(mergeKeetaOrderRows([row])).toEqual([row]);
  });

  test("each upload keeps per-branch totals; cancelled HungerStation orders are not counted as orders", async () => {
    const file = new File(
      [
        [
          "Order ID,Order received at,Order status,Delivery type,Store ID,Restaurant name,Subtotal,Commission,Estimated earnings,Has complaint?",
          "H-1,2026-10-01 12:00,Delivered,Pickup,10,North,100.00,20.00,80.00,N",
          "H-2,2026-10-01 13:00,Delivered,Pickup,10,North,50.00,10.00,40.00,Y",
          "H-3,2026-10-01 14:00,Cancelled,Pickup,10,North,30.00,0.00,0.00,N",
          "H-4,2026-10-01 15:00,Delivered,Pickup,20,South,200.00,40.00,160.00,N",
        ].join("\n"),
      ],
      "Orders.csv",
      { type: "text/csv" },
    );
    const result = await parseOperationFile(file, "hungerstation_orders");
    expect(result.summary.branches).toEqual([
      expect.objectContaining({ key: "20", branchName: "South", orderCount: 1, grossSales: 200, commissionAmount: 40 }),
      expect.objectContaining({ key: "10", branchName: "North", orderCount: 2, grossSales: 150, cancellationCount: 1, complaintCount: 1, settlementAmount: 120 }),
    ]);
    expect(branchSummaries([])).toEqual([]);
  });
});

