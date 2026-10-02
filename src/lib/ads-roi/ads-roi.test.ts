import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { analyzeAdsRoi, brandKey, type BrandSettings } from "./analysis";
import * as XLSX from "xlsx";

import { parseCsv, readCsvText, readWorkbook } from "./read-file";
import { ordersSchema, reportSchema } from "./schemas";
import { detectHsReportKind, missingColumns, parseHsAdsReport, parseHsOrdersReport, type ReportRow } from "./reports";

// Anonymised copy of a real one-day HungerStation ads export (17 branches, 26 campaigns).
const fixture = readCsvText(readFileSync(join(import.meta.dir, "fixtures/hungerstation-ads.csv"), "utf8"));

const SETTINGS: BrandSettings = {
  ALPHA: { commissionRate: 0.15, foodCostRate: 0.3 },
  BETA: { commissionRate: 0.18, foodCostRate: 0.3 },
  GAMMA: { commissionRate: null, foodCostRate: 0.3 },
  DELTA: { commissionRate: null, foodCostRate: 0.3 },
};

describe("report detection", () => {
  test("recognises the ads, orders and outlet summary exports by their columns", () => {
    expect(detectHsReportKind(fixture.headers)).toBe("ads");
    expect(
      detectHsReportKind(["Restaurant name", "Order ID", "Store ID", "Order status", "Subtotal", "Commission", "Operational Charges"]),
    ).toBe("orders");
    expect(detectHsReportKind(["Date", "Restaurant ID", "Outlet name", "Successful Orders", "Gross Sales"])).toBe("outlet_summary");
    expect(detectHsReportKind(["Branch Name", "Commission"])).toBeNull();
    expect(missingColumns("ads", ["Restaurant ID", "Outlet name"])).toContain("Spent Budget");
  });
});

describe("ads report", () => {
  const report = parseHsAdsReport(fixture.rows);

  test("splits campaigns packed into one cell", () => {
    expect(report.campaigns).toHaveLength(26);
    expect(report.branchDays).toHaveLength(17);
    expect(report.packedRows).toBe(9);
    expect(report.dateFrom).toBe("2026-08-01");
    expect(report.dateTo).toBe("2026-08-01");
    const branch2 = report.campaigns.filter((c) => c.outletName === "Alpha - Branch 2");
    expect(branch2.map((c) => [c.clicks, c.orders, c.gmv, c.spent])).toEqual([
      [38, 13, 869.23, 42.65],
      [57, 14, 1050.17, 104.65],
    ]);
  });

  test("an order count that is not split per campaign stays unknown per campaign but counts for the branch", () => {
    const gamma = report.campaigns.filter((c) => c.outletName.startsWith("Gamma") && c.spent > 100);
    expect(gamma[0]?.orders).toBeNull();
    const branch = report.branchDays.find((d) => d.restaurantId === gamma[0]?.restaurantId);
    expect(branch?.orders).toBe(1);
    expect(report.notes.map((n) => n.kind).sort()).toEqual(["orders_missing", "orders_not_split"]);
  });

  test("a row whose spend cannot be matched to its campaigns is refused", () => {
    const rows: ReportRow[] = [
      { Date: "2026-08-01", "Restaurant ID": "1", "Outlet name": "A - B", "Campaign ID": "x;y", Clicks: "1;2", "Total Orders": "1;1", "Total GMV": "10;20", "Spent Budget": "5;6;7" },
    ];
    expect(() => parseHsAdsReport(rows)).toThrow("تعذّر فصل الحملات");
  });
});

describe("true ROI", () => {
  const result = analyzeAdsRoi({ report: parseHsAdsReport(fixture.rows), settings: SETTINGS });

  test("totals match the report", () => {
    expect(result.totals).toMatchObject({
      spent: 2953.48,
      gmv: 18479.95,
      orders: 256,
      clicks: 1628,
      cpc: 1.81,
      costPerOrder: 11.54,
      roas: 6.26,
    });
  });

  test("break-even and profit after VAT, commission and food cost", () => {
    const alpha = result.brands.find((b) => b.brand === "Alpha");
    expect(alpha?.keptPerSar).toBeCloseTo(0.4587, 4);
    expect(alpha?.breakEvenRoas).toBe(2.18);
    expect(result.brands.find((b) => b.brand === "Beta")?.breakEvenRoas).toBe(2.33);
    expect(result.totals.profit).toBeCloseTo(5514.81, 1);
  });

  test("five campaigns lose money, six are thin, fifteen are profitable", () => {
    expect(result.verdict.loss.campaigns).toBe(5);
    expect(result.verdict.loss.spent).toBe(395.21);
    expect(result.verdict.loss.profit).toBeCloseTo(-237.16, 1);
    expect(result.verdict.thin.campaigns).toBe(6);
    expect(result.verdict.profit.campaigns).toBe(15);
    expect(result.campaigns[0]).toMatchObject({ spent: 137.26, status: "loss", action: "stop", expensiveClicks: true });
  });

  test("orders the report did not split per campaign are shared by sales and marked as estimated", () => {
    const gamma = result.campaigns.filter((c) => c.brand === "Gamma").sort((a, b) => b.gmv - a.gmv);
    expect(gamma.map((c) => [c.orders, c.ordersEstimated])).toEqual([[1, true], [0, true]]);
    expect(result.campaigns.find((c) => c.brand === "Alpha")?.ordersEstimated).toBe(false);
  });

  test("thin campaigns with expensive clicks are told to lower the bid", () => {
    const lower = result.campaigns.filter((c) => c.action === "lower_bid").map((c) => c.cpc);
    expect(lower.sort()).toEqual([3.23, 3.52]);
  });

  test("budget shifts: the branch's bigger spender is the much weaker campaign", () => {
    expect(result.shifts).toHaveLength(4);
    for (const shift of result.shifts) {
      expect(shift.weak.spent).toBeGreaterThan(shift.strong.spent);
      expect(shift.weak.roas ?? 0).toBeLessThan(shift.strong.roas ?? 0);
    }
  });

  test("notes the platform ROAS that does not match its own numbers", () => {
    expect(result.notes.platformRoasMismatches).toBe(18);
    expect(result.notes.campaignsWithPlatformRoas).toBe(23);
    expect(result.notes.defaultCommissionBrands.sort()).toEqual(["Delta", "Gamma"]);
    expect(result.notes.ordersIncluded).toBe(false);
  });

  test("without food cost the profit is higher and every brand is listed as missing it", () => {
    const before = analyzeAdsRoi({ report: parseHsAdsReport(fixture.rows) });
    expect(before.totals.profit).toBeGreaterThan(result.totals.profit);
    expect(before.notes.missingFoodCostBrands).toHaveLength(4);
  });

  test("is deterministic", () => {
    expect(analyzeAdsRoi({ report: parseHsAdsReport(fixture.rows), settings: SETTINGS })).toEqual(result);
  });
});

describe("orders report", () => {
  const orderRows: ReportRow[] = [
    { "Restaurant name": "Alpha - Branch 2", "Order ID": "1", "Store ID": "500007", "Order status": "Delivered", "Order received at": "2026-08-01 18:22", Subtotal: "40.00", Commission: "6.00", "Operational Charges": "20.00", "Discount Funded by you": "5.00", "Voucher Funded by you": "0.00" },
    { "Restaurant name": "Alpha - Branch 2", "Order ID": "2", "Store ID": "500007", "Order status": "Delivered", "Order received at": "2026-08-01 19:00", Subtotal: "60.00", Commission: "9.00", "Operational Charges": "30.00", "Discount Funded by you": "0.00", "Voucher Funded by you": "2.00" },
    { "Restaurant name": "Alpha - Branch 2", "Order ID": "3", "Store ID": "500007", "Order status": "Cancelled", "Order received at": "2026-08-01 20:00", Subtotal: "50.00", Commission: "0.00", "Operational Charges": "0.00" },
  ];

  test("totals delivered orders per store", () => {
    const parsed = parseHsOrdersReport(orderRows);
    expect(parsed.cancelledOrders).toBe(1);
    expect(parsed.stores).toEqual([
      { storeId: "500007", outletName: "Alpha - Branch 2", orders: 2, subtotal: 100, commission: 15, operationalCharges: 50, restaurantDiscounts: 7, paymentFees: 0, otherFees: 0 },
    ]);
  });

  test("counts the restaurant's discounts, fees and delivery offer from the orders report", () => {
    const report = parseHsAdsReport(fixture.rows);
    const withOrders = analyzeAdsRoi({ report, settings: SETTINGS, orders: parseHsOrdersReport(orderRows) });
    const without = analyzeAdsRoi({ report, settings: SETTINGS });
    const branch = withOrders.branches.find((b) => b.restaurantId === "500007");
    expect(branch?.costSource).toBe("orders");
    expect(branch?.costs.discount).toBeCloseTo(0.07, 6);
    expect(branch?.costs.commission).toBeCloseTo(0.15, 6);
    expect(branch?.costs.deliveryOffer).toBeCloseTo(0.5, 6);
    // VAT is due only on what the customer paid after the discount.
    expect(branch?.costs.vat).toBeCloseTo((0.93 * 0.15) / 1.15, 6);
    const shares = branch!.costs;
    expect(shares.discount + shares.vat + shares.commission + shares.paymentFee + shares.deliveryOffer + shares.otherFees + shares.foodCost + shares.kept).toBeCloseTo(1, 9);
    // Half of every sale goes to the delivery offer: this branch cannot break even on ads.
    expect(branch?.breakEvenRoas).toBeNull();
    expect(branch!.profit).toBeLessThan(without.branches.find((b) => b.restaurantId === "500007")!.profit);
    // Other branches of the same brand use the brand's average from the orders report.
    expect(withOrders.branches.find((b) => b.brand === "Alpha" && b.restaurantId !== "500007")?.costSource).toBe("brand_orders");
    expect(withOrders.branches.find((b) => b.brand === "Beta")?.costSource).toBe("settings");
    expect(withOrders.notes.ordersIncluded).toBe(true);
    expect(withOrders.notes.branchesWithoutOrders.length).toBe(16);
  });

  test("without the orders report the shares are VAT, commission and food cost only", () => {
    const report = parseHsAdsReport(fixture.rows);
    const alpha = analyzeAdsRoi({ report, settings: SETTINGS }).brands.find((b) => b.brand === "Alpha")!;
    expect(alpha.costs.discount).toBe(0);
    expect(alpha.costs.vat).toBeCloseTo(0.15 / 1.15, 6);
    expect(alpha.costSource).toBe("settings");
  });
});

test("brand key ignores case and the branch part", () => {
  expect(brandKey("Past - Malqa")).toBe("PAST");
  expect(brandKey("PAST - Uhud")).toBe("PAST");
  expect(brandKey("Tikka Noon - Al Khubar Ash Shamaliyah")).toBe("TIKKA NOON");
});

test("an Excel export reads the same as the CSV, dates included", () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Date", "Restaurant ID", "Outlet name", "Campaign ID", "Clicks", "Total Orders", "Total GMV", "ROAS", "Spent Budget"],
    [new Date(2026, 7, 1), 500007, "Alpha - Branch 2", "aa;bb", "38;57", "13;14", "869.23;1050.17", "", "42.645246;104.647853"],
  ], { cellDates: true });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
  const data = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const table = readWorkbook(data);
  expect(detectHsReportKind(table.headers)).toBe("ads");
  const report = parseHsAdsReport(table.rows);
  expect(report.dateFrom).toBe("2026-08-01");
  expect(report.campaigns.map((c) => [c.restaurantId, c.spent])).toEqual([["500007", 42.65], ["500007", 104.65]]);
});

describe("CSV reading", () => {
  test("handles quotes, doubled quotes, line breaks inside fields, CRLF and a byte-order mark", () => {
    const text = '\uFEFFa,b,c\r\n1,"x, y","say ""hi"""\r\n2,"line one\nline two",\n\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["1", "x, y", 'say "hi"'],
      ["2", "line one\nline two", ""],
    ]);
  });

  test("an anonymised sample of a real monthly orders export", () => {
    const table = readCsvText(readFileSync(join(import.meta.dir, "fixtures/hungerstation-orders.csv"), "utf8"));
    expect(detectHsReportKind(table.headers)).toBe("orders");
    expect(table.rows).toHaveLength(153);
    const parsed = parseHsOrdersReport(table.rows);
    expect(parsed.cancelledOrders).toBe(4);
    const store = parsed.stores.find((s) => s.storeId === "500063");
    expect(store).toMatchObject({ orders: 146, subtotal: 9568, commission: 1574.9, operationalCharges: 29.9, paymentFees: 206.13, restaurantDiscounts: 1107.5, otherFees: 0 });
    expect(parsed.stores.find((s) => s.storeId === "500000")).toMatchObject({ orders: 3, subtotal: 207, commission: 47.61, restaurantDiscounts: 40 });
  });
});

test("saving keeps every field the readers produce", () => {
  const report = parseHsAdsReport(fixture.rows);
  expect(reportSchema.parse(report)).toEqual(report);
  const orders = parseHsOrdersReport(readCsvText(readFileSync(join(import.meta.dir, "fixtures/hungerstation-orders.csv"), "utf8")).rows);
  expect(ordersSchema.parse(orders)).toEqual(orders);
});
