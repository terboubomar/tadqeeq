import { describe, expect, test } from "bun:test";

import { parseCpcInvoice, parseHungerInvoice } from "./pdf";

/**
 * A HungerStation commission invoice laid out like HS-2026/9-4871148 (one page per line, as
 * extractPdfText joins them), with the figures of that invoice and no customer details.
 */
const SUMMARY = [
  "TAX INVOICE Invoice No. HS-TEST-0001 Simple Invoice Description Amount VAT 15% 15% Total with VAT",
  "Sales Commission 224,052.26 33,607.84 257,660.1 Payment Fees 31,551.16 4,732.67 36,283.83",
  "Others Commission 62,499.98 9,375.0 71,874.98 Total Invoice 318,103.4 47,715.51 365,818.91 SAR",
  "Total Online Sales (1,327,217.83) SAR Net Due Invoice (961,398.92) SAR",
  "Notice: For any changes relating to the (RDF), please submit a ticket through the Vendor Portal.",
].join(" ");

const DETAILS = [
  "Invoice Details ÿ þ 7 / Commissions Description Details Quantity AVG rate Amount Sales Commission",
  "HS delivery commission ÿ þ 953,501.23 19.1% 181,824.07 HS Pickup Commission ÿ þ 200,957.94 21.0% 42,228.19",
  "Online Payments Fees Successful Bank Fee ÿ þ 1,156,746.29 2.5% 28,918.69 Refunded Bank Fee 1,723.0 2.5% 43.1",
  "Wallet Payments Fee ÿ þ 103,570.64 2.5% 2,589.37 Other Commissions",
  "Free Delivery fee campaign Charges ÿ þ 7 ÿ 338.0 1.74 587.83 RDF campaigns ÿ þ 8,024.0 7.17 57,543.47",
  "Printers ÿ þ 3.0 500.0 1,500.0 Customer Compensation ÿ þ 2,612.17 100.0% 2,612.16",
  "Monthly subscription fees ÿ þ 7 1.0 200.0 200.0 Avoidable wait time fees ÿ þ 7 56.52 100.0% 56.52",
  "Total Commission ÿ þ 318,103.4 SAR VAT 15% 15% 47,715.51 SAR Total Invoice After VAT 365,818.91 SAR Page 2 / 9",
].join(" ");

const ONLINE = "Online Payments Description Details Amount Net Bank Cards Payments (1,156,703.29) Total Collections (1,327,217.83) SAR Page 3 / 9";

const SOA = [
  "Simple SOA of the Month ÿ þ Description Amount",
  "Opening Balance ( Advance payment + previous due balance ) ÿ þ 7 ÿ þ + ÿ / ) ' ÿ ) 442,433.03",
  "Total Commission Invoice ÿ þ 7 / 365,818.91 Total Advertising Services Invoice ÿ þ 7 / 70,624.35",
  "Total Loan Installment Invoice ÿ þ 7 / 0.0 Total Online Sales ÿ þ (1,327,217.83) SAR",
  "Net Monthly Due Balance ÿ þ (448,341.54) SAR Page 4 / 9",
].join(" ");

function branchPages(name: string, extraRows: string, totals: string): string[] {
  return [
    `Invoice Details ${name} ' ÿ - ' 7 / Commissions Description Details Quantity AVG rate Amount Sales Commission ` +
      `HS delivery commission 2,935.63 15.0% 440.35 HS Pickup Commission 1,366.09 23.0% 314.2 ` +
      `Online Payments Fees Successful Bank Fee 4,503.29 2.5% 112.58 Other Commissions ${extraRows} ` +
      `Total Commission ${totals} SAR Page 5 / 9`,
    `Online Payments for branch ${name} Net Bank Cards Payments (4,391.0) Total Collections (4,391.0) SAR Page 6 / 9`,
  ];
}

const INVOICE = [
  SUMMARY,
  DETAILS,
  ONLINE,
  SOA,
  ...branchPages(
    "Motto - Uhud",
    "RDF campaigns 30.0 12.35 370.44 Monthly subscription fees 1.0 200.0 200.0 Avoidable wait time fees ÿ þ 7 9.13 100.0% 9.13",
    "1,446.70",
  ),
  ...branchPages("PAST - al mazrua", "Printers 1.0 500.0 500.0 Customer Compensation 104.35 100.0% 104.35", "1,471.48"),
  ...branchPages("PAST - Al Hamadaniyah", "Printers 1.0 500.0 500.0", "1,367.13"),
  ...branchPages("PAST - Al Khubar Ash shamaliyah", "Printers 1.0 500.0 500.0", "1,367.13"),
].join("\n");

const figures = parseHungerInvoice(INVOICE);
const line = (key: string) => figures.lineDetails?.find((row) => row.key === key);
const branch = (name: string) => figures.branches?.find((row) => row.branch?.startsWith(name));

describe("invoice lines with quantity and average rate (task 1)", () => {
  test("reads the acceptance rows as the invoice prints them", () => {
    expect(line("free_delivery_campaign")).toMatchObject({ quantity: 338, unit: "orders", avgRate: 1.74, rateKind: "per_unit", amount: 587.83 });
    expect(line("rdf_campaigns")).toMatchObject({ quantity: 8024, unit: "orders", avgRate: 7.17, amount: 57543.47 });
    expect(line("delivery_commission")).toMatchObject({ quantity: 953501.23, unit: "sar_base", avgRate: 19.1, rateKind: "percent", amount: 181824.07 });
  });

  test("keeps every summary row, including the ones Tadqeeq cannot recalculate", () => {
    expect(figures.lineDetails?.map((row) => row.key)).toEqual([
      "delivery_commission",
      "pickup_commission",
      "bank_fee_success",
      "bank_fee_refunded",
      "wallet_fee",
      "free_delivery_campaign",
      "rdf_campaigns",
      "printers",
      "customer_compensation",
      "monthly_subscription",
      "waiting_time",
    ]);
    expect(line("customer_compensation")).toMatchObject({ quantity: 2612.17, avgRate: 100, amount: 2612.16 });
    expect(line("printers")).toMatchObject({ quantity: 3, unit: "count", avgRate: 500, amount: 1500 });
  });

  test("leaves the existing invoice figures exactly as before", () => {
    expect(figures).toMatchObject({ totalExVat: 318103.4, vat: 47715.51, totalIncVat: 365818.91, salesCommission: 224052.26 });
    expect(figures.extras).toEqual([
      { label: "الطابعات", amount: 1500 },
      { label: "الاشتراك الشهري", amount: 200 },
      { label: "رسوم حملات التوصيل المجاني", amount: 587.83 },
    ]);
  });
});

describe("invoice-only charges per branch (task 2)", () => {
  test("each charge stays on the branch whose section lists it", () => {
    expect(branch("Motto - Uhud")?.invoiceOnlyItems).toEqual([{ label: "الاشتراك الشهري", amount: 200 }]);
    expect(branch("PAST - al mazrua")?.invoiceOnlyItems).toEqual([{ label: "الطابعات", amount: 500 }]);
    expect(branch("PAST - Al Hamadaniyah")?.invoiceOnlyItems).toEqual([{ label: "الطابعات", amount: 500 }]);
    expect(branch("PAST - Al Khubar Ash shamaliyah")?.invoiceOnlyItems).toEqual([{ label: "الطابعات", amount: 500 }]);
    // The branch total the audit already uses is unchanged.
    expect(branch("Motto - Uhud")?.invoiceOnlyCharges).toBe(200);
  });

  test("a charge printed only in the consolidated summary is unallocated, on no branch", () => {
    expect(figures.unallocatedCharges).toEqual([{ label: "رسوم حملات التوصيل المجاني", amount: 587.83 }]);
    const onBranches = (figures.branches ?? []).flatMap((row) => row.invoiceOnlyItems ?? []);
    expect(onBranches.some((item) => item.label === "رسوم حملات التوصيل المجاني")).toBe(false);
  });
});

describe("statement of account (task 3)", () => {
  test("reads the Simple SOA of the Month as printed", () => {
    expect(figures.statementOfAccount).toEqual({
      openingBalance: 442433.03,
      commissionInvoice: 365818.91,
      advertisingServicesInvoice: 70624.35,
      loanInstallmentInvoice: 0,
      totalOnlineSales: -1327217.83,
      netMonthlyDueBalance: -448341.54,
    });
  });

  test("an invoice without the section has none", () => {
    expect(parseHungerInvoice([SUMMARY, DETAILS, ONLINE].join("\n")).statementOfAccount).toBeUndefined();
  });
});

describe("branch waiting time fee", () => {
  test("reads the per-branch row as the invoice prints it", () => {
    expect(branch("Motto - Uhud")?.waitingTimeFees).toBe(9.13);
  });

  test("still reads the older wording", () => {
    const [detail, online] = branchPages("Branch A", "Avoidable Waiting Time Fee 12.0 100.0% 12.0", "866.73");
    const parsed = parseHungerInvoice([SUMMARY, DETAILS, ONLINE, detail, online].join("\n"));
    expect(parsed.branches?.[0]?.waitingTimeFees).toBe(12);
  });

  test("a branch without the row has none", () => {
    expect(branch("PAST - al mazrua")?.waitingTimeFees).toBeUndefined();
  });
});

describe("CPC invoice lines per branch", () => {
  const cpc = (lines: string) =>
    [
      "Billing Instructions Cost per click (CPC) invoice contains the no. of clicks used per branch based on the agreed budget.",
      "Each branch has a separate line in the invoice. HS-ADS-2026/9-0000001",
      "Invoice Summary VAT Amount ÿ þ 7",
      lines,
      "Total Invoice Value Before VAT SAR 12898.64 ÿ þ VAT Value( 15.0 %) SAR 1934.79 % ( 15.0 )",
      "Total Invoice Value After VAT SAR 14833.43 ÿ þ Total Invoice Net Value SAR 14833.43",
    ].join("\n");
  const LINES = [
    "Booking for promoted places for branch Brand - North 854.98 5699.84 ÿ þ ? ' - ÿ þ",
    "Booking for promoted places for branch Brand - South 1079.82 7198.8 ÿ þ ? ' - ÿ þ",
  ].join(" ");

  test("reads each branch line with its amount and VAT, in the invoice's VAT, Amount order", () => {
    const figures = parseCpcInvoice(cpc(LINES));
    expect(figures).toMatchObject({ totalExVat: 12898.64, vat: 1934.79, totalIncVat: 14833.43 });
    expect(figures.cpcBranches).toEqual([
      { branch: "Brand - North", amountExVat: 5699.84, vat: 854.98 },
      { branch: "Brand - South", amountExVat: 7198.8, vat: 1079.82 },
    ]);
  });

  test("lines that do not add up to the total before VAT are not kept", () => {
    const figures = parseCpcInvoice(cpc(LINES.replace("7198.8", "7000.0")));
    expect(figures.cpcBranches).toBeUndefined();
    expect(figures.totalIncVat).toBe(14833.43);
  });

  test("an invoice with totals only has no branch lines", () => {
    expect(parseCpcInvoice(cpc("")).cpcBranches).toBeUndefined();
  });
});

describe("flash deals invoice line", () => {
  // Laid out like HS-2026/9-4899067: the Flash deals row sits between compensation and wait time.
  const flashDetails = DETAILS.replace(
    "Monthly subscription fees",
    "Flash deals Fees ÿ þ 6 ÿ 36.0 22.38% 805.78 Monthly subscription fees",
  );
  const withFlash = parseHungerInvoice([SUMMARY, flashDetails, ONLINE].join("\n"));
  const without = parseHungerInvoice([SUMMARY, DETAILS, ONLINE].join("\n"));

  test("reads the row as the invoice prints it, after customer compensation", () => {
    expect(withFlash.lineDetails?.find((row) => row.key === "flash_deals")).toMatchObject({
      label: "رسوم العروض السريعة",
      quantity: 36,
      unit: "orders",
      avgRate: 22.38,
      amount: 805.78,
    });
    const keys = withFlash.lineDetails?.map((row) => row.key) ?? [];
    expect(keys.indexOf("flash_deals")).toBe(keys.indexOf("customer_compensation") + 1);
  });

  test("changes nothing but the printed lines", () => {
    const strip = (value: typeof withFlash) =>
      JSON.parse(JSON.stringify(value, (key, field) => (key === "lineDetails" ? undefined : field)));
    expect(strip(withFlash)).toEqual(strip(without));
  });
});
