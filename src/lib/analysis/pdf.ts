import type { HungerInvoiceBranch, InvoiceFigures, KeetaInvoiceBranch } from "./types";

/** Extract plain text from the first pages of a PDF, in the browser. */
export async function extractPdfText(file: ArrayBuffer, maxPages = 3): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(file) }).promise;
  const pages = Math.min(doc.numPages, maxPages);
  const chunks: string[] = [];
  for (let i = 1; i <= pages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    chunks.push(line);
  }
  doc.cleanup();
  return chunks.join("\n");
}

const NUM = "\\(?-?[\\d,]+\\.\\d{1,2}\\)?";
// Filler between a label and its amount: anything that is not the start of a number.
// Bilingual invoices often garble the Arabic label into characters that include digits.
const GAP = "(?:[^0-9(]|\\d(?![\\d,]*\\.\\d))";

function toNumber(raw: string): number {
  const negative = raw.startsWith("(");
  const value = Number.parseFloat(raw.replace(/[(),]/g, ""));
  if (!Number.isFinite(value)) return Number.NaN;
  return negative ? -value : value;
}

/** Numbers that follow a label, in document order. */
function amountsAfter(source: string, count: number, ...labels: string[]): number[] {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `${escaped}${GAP}{0,120}` +
        Array.from({ length: count }, () => `(${NUM})`).join(`${GAP}{0,60}`),
      "i",
    );
    const match = source.match(re);
    if (match) {
      const values = match.slice(1, count + 1).map(toNumber);
      if (values.every((v) => Number.isFinite(v))) return values;
    }
  }
  return [];
}

function amountAfter(source: string, ...labels: string[]): number | undefined {
  const [value] = amountsAfter(source, 1, ...labels);
  return value;
}

const AR_LABELS: Record<string, string> = {
  salesCommission: "عمولة المبيعات",
  paymentFees: "رسوم الدفع الإلكتروني",
  othersCommission: "عمولات أخرى",
  totalExVat: "الإجمالي قبل الضريبة",
  vat: "ضريبة القيمة المضافة",
  totalIncVat: "إجمالي الفاتورة",
  totalOnlineSales: "إجمالي المبيعات الإلكترونية",
  creditSales: "إجمالي المبيعات الآجلة",
  netDue: "صافي المستحق",
};

function build(entries: Record<string, number | string | undefined>): InvoiceFigures {
  const figures = { lines: [] } as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) figures[key] = value;
  }
  const lines: { label: string; amount: number }[] = [];
  for (const [key, label] of Object.entries(AR_LABELS)) {
    const value = figures[key];
    if (typeof value === "number" && value !== 0) lines.push({ label, amount: value });
  }
  figures["lines"] = lines;
  return figures as unknown as InvoiceFigures;
}

/**
 * Detail rows that exist only on the invoice (no equivalent in the order sheet).
 * Each row reads: label, quantity, rate, amount — we keep the last number.
 */
const EXTRA_LINES: { label: string; keys: string[] }[] = [
  { label: "رسوم محفظة العميل", keys: ["Wallet Payments Fee", "Wallet Payment Fee"] },
  { label: "الطابعات", keys: ["Printers"] },
  { label: "الاشتراك الشهري", keys: ["Monthly subscription fees", "Monthly Subscription"] },
  {
    label: "رسوم حملات التوصيل المجاني",
    keys: ["Free Delivery fee campaign Charges", "Free Delivery fee campaign"],
  },
];

function parseExtras(source: string): { label: string; amount: number }[] {
  const extras: { label: string; amount: number }[] = [];
  for (const item of EXTRA_LINES) {
    const values = amountsAfter(source, 3, ...item.keys);
    const amount = values.length === 3 ? values[2] : amountsAfter(source, 1, ...item.keys)[0];
    if (typeof amount === "number" && Number.isFinite(amount) && amount !== 0) {
      extras.push({ label: item.label, amount });
    }
  }
  return extras;
}

function cleanBranchName(page: string): string | undefined {
  const match = page.match(/Invoice Details\s+(.+?)\s+Commissions\b/i);
  if (!match?.[1]) return undefined;

  // Keep only whitespace-separated tokens that were already pure ASCII.
  // This removes the garbled bilingual PDF fragments without damaging short real
  // branch tokens such as "A", "Al", "Ar" or wrapped words like "Fahd".
  const tokens = match[1]
    .split(/\s+/)
    .filter((token) => /^[\x20-\x7E]+$/.test(token))
    .filter((token) => !/^\/7/.test(token))
    .filter((token) => !/^[0-9.]+$/.test(token));

  const name = tokens.join(" ").replace(/\s+-\s+/g, " - ").trim();
  return /[A-Za-z]/.test(name) ? name : undefined;
}

function sumNumbers(...values: Array<number | undefined>): number {
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function parseHungerBranch(detailPage: string, onlinePage: string): HungerInvoiceBranch {
  const delivery = amountsAfter(detailPage, 3, "HS delivery commission");
  const pickup = amountsAfter(detailPage, 3, "HS Pickup Commission");
  const bankSuccess = amountsAfter(detailPage, 3, "Successful Bank Fee");
  const bankRefunded = amountsAfter(detailPage, 3, "Refunded Bank Fee");
  const walletFee = amountsAfter(detailPage, 3, "Wallet Payments Fee");
  const rdf = amountsAfter(detailPage, 3, "RDF campaigns");
  const compensation = amountsAfter(detailPage, 3, "Customer Compensation");
  const waiting = amountsAfter(detailPage, 3, "Avoidable Waiting Time Fee");
  const freeDelivery = amountsAfter(
    detailPage,
    3,
    "Free Delivery fee campaign Charges",
    "Free Delivery fee campaign",
  );
  const printers = amountsAfter(detailPage, 3, "Printers");
  const subscription = amountsAfter(
    detailPage,
    3,
    "Monthly subscription fees",
    "Monthly Subscription",
  );

  const salesCommission = sumNumbers(delivery[2], pickup[2]);
  const paymentFees = sumNumbers(bankSuccess[2], bankRefunded[2], walletFee[2]);
  const totalExVat = amountAfter(detailPage, "Total Commission");
  const invoiceOnlyCharges = sumNumbers(freeDelivery[2], printers[2], subscription[2]);
  const creditSales = amountsAfter(onlinePage, 3, "Credit Sales");
  const rejectedSales = amountsAfter(onlinePage, 3, "Rejected sales", "Rejected Sales");

  return {
    branch: cleanBranchName(detailPage),
    deliveryBase: delivery[0],
    deliveryCommission: delivery[2],
    pickupBase: pickup[0],
    pickupCommission: pickup[2],
    salesCommission,
    bankFeeSuccessBase: bankSuccess[0],
    bankFeeSuccess: bankSuccess[2],
    bankFeeRefundedBase: bankRefunded[0],
    bankFeeRefunded: bankRefunded[2],
    walletFeeBase: walletFee[0],
    walletFee: walletFee[2],
    paymentFees,
    rdfOrders: rdf[0],
    rdfCampaigns: rdf[2],
    compensation: compensation[2],
    waitingTimeFees: waiting[2],
    invoiceOnlyCharges,
    otherCommission:
      totalExVat !== undefined ? totalExVat - salesCommission - paymentFees : undefined,
    totalExVat,
    // Online-payments rows are printed as negative amounts when they are collections.
    // Flip those signs back into the same semantic direction as the Excel export.
    netBankCards: -(amountAfter(onlinePage, "Net Bank Cards Payments") ?? 0),
    walletAmount: -(amountAfter(onlinePage, "User wallets payments") ?? 0),
    riderWallet: -(amountAfter(onlinePage, "Rider wallets payments") ?? 0),
    totalFoodDiscount: -(amountAfter(onlinePage, "Total food discounts") ?? 0),
    restaurantFoodDiscount: amountAfter(onlinePage, "Restaurant food discounts") ?? 0,
    rewardsDiscount: -(amountAfter(onlinePage, "Rewards Discounts") ?? 0),
    netMarketingDiscount: -(amountAfter(onlinePage, "Net Marketing Discounts") ?? 0),
    approvedRefunds: -(amountAfter(onlinePage, "Total Approved Claims") ?? 0),
    totalCollections: -(amountAfter(onlinePage, "Total Collections") ?? 0),
    creditSalesOrders: creditSales[0],
    creditSales: creditSales[1],
    rejectedSalesOrders: rejectedSales[0],
    rejectedSales: rejectedSales[1],
  };
}

function parseHungerBranches(pages: string[]): HungerInvoiceBranch[] {
  const pairs: Array<{ detail: string; online: string; named: boolean }> = [];
  for (let index = 0; index < pages.length - 1; index += 1) {
    const detail = pages[index]!;
    const online = pages[index + 1]!;
    if (!/Invoice Details/i.test(detail) || !/Online Payments/i.test(online)) continue;
    pairs.push({
      detail,
      online,
      named: /Online Payments for branch/i.test(online),
    });
  }

  const namedPairs = pairs.filter((pair) => pair.named);
  const selected = namedPairs.length ? namedPairs : pairs.slice(-1);
  return selected.map((pair) => parseHungerBranch(pair.detail, pair.online));
}

/** Parse a HungerStation commission invoice. */
export function parseHungerInvoice(raw: string): InvoiceFigures {
  // extractPdfText preserves page boundaries with newlines. Headline invoice values belong
  // to page 1; later pages reuse labels such as "Online Payments Fees" for detail sections
  // where the first number is a fee base, not the summary fee amount.
  const pages = raw
    .split(/\n+/)
    .map((page) => page.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const firstPage = pages[0] ?? raw.replace(/\s+/g, " ");
  const salesPage =
    pages.slice(0, 2).find((page) => /Sales Summary|Credit Sales/i.test(page)) ?? firstPage;
  const source = raw.replace(/\s+/g, " ");

  // Summary rows carry three values. Sales Summary rows are:
  // order count, amount excluding VAT, amount including VAT.
  const total = amountsAfter(firstPage, 3, "Total Invoice", "Invoice Total");
  const creditSales = amountsAfter(salesPage, 3, "Credit Sales");
  const rejectedSales = amountsAfter(salesPage, 3, "Rejected sales", "Rejected Sales");
  const figures = build({
    salesCommission: amountAfter(firstPage, "Sales Commission"),
    paymentFees: amountAfter(
      firstPage,
      "Payment Fees",
      "Payment Fee",
      "Online Payments Fees",
      "Online Payment Fees",
    ),
    othersCommission: amountAfter(firstPage, "Others Commission", "Other Commission"),
    totalExVat: total[0],
    vat: total[1],
    totalIncVat: total[2],
    totalOnlineSales: amountAfter(firstPage, "Total Online Sales"),
    netDue: amountAfter(firstPage, "Net Due Invoice", "Net Due"),
    creditSalesOrders: creditSales[0],
    creditSales: creditSales[1],
    creditSalesIncVat: creditSales[2],
    rejectedSalesOrders: rejectedSales[0],
    rejectedSales: rejectedSales[1],
    rejectedSalesIncVat: rejectedSales[2],
    invoiceNo: firstPage.match(/Invoice\s*(?:No|Number)[^A-Za-z0-9]{0,10}([A-Za-z0-9\-/]+)/i)?.[1],
  });
  const branches = parseHungerBranches(pages);
  if (branches.length === 1) {
    const [onlyBranch] = branches;
    if (onlyBranch && onlyBranch.creditSales === undefined && figures.creditSales !== undefined) {
      onlyBranch.creditSalesOrders = figures.creditSalesOrders;
      onlyBranch.creditSales = figures.creditSales;
      onlyBranch.rejectedSalesOrders = figures.rejectedSalesOrders;
      onlyBranch.rejectedSales = figures.rejectedSales;
    }
  }
  if (branches.length) figures.branches = branches;

  const extras = parseExtras(source);
  if (extras.length) {
    figures.extras = extras;
    figures.lines = [...figures.lines, ...extras];
  }
  return figures;
}

/** Parse a HungerStation CPC (paid ads) invoice. */
export function parseCpcInvoice(raw: string): InvoiceFigures {
  const source = raw.replace(/\s+/g, " ");

  // Real HungerStation advertising invoices use explicit "Value Before/After VAT" labels.
  // Avoid generic "Total Invoice" matching because it can capture the before-VAT value.
  const vatMatch = source.match(
    /VAT Value\s*\(\s*[\d.]+\s*%\s*\)\s*(?:SAR\s*)?(\(?-?[\d,]+\.\d{1,2}\)?)/i,
  );

  return build({
    totalExVat: amountAfter(
      source,
      "Total Invoice Value Before VAT",
      "Total Excluding VAT",
      "Subtotal",
    ),
    vat: vatMatch ? toNumber(vatMatch[1]!) : amountAfter(source, "VAT 15", "Total VAT"),
    totalIncVat: amountAfter(
      source,
      "Total Invoice Value After VAT",
      "Total Invoice Net Value",
      "Invoice Total",
      "Total Due",
    ),
    invoiceNo:
      source.match(/HS-ADS-[A-Za-z0-9/\-]+/i)?.[0] ??
      source.match(/HS-CPC-[A-Za-z0-9/\-]+/i)?.[0],
  });
}

const KEETA_GAP = "(?:[^0-9-]|-(?![\\d,]+\\.\\d)|\\d(?![\\d,]*\\.\\d))";

function keetaAmountsAfter(source: string, count: number, ...labels: string[]): number[] {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
    const re = new RegExp(
      escaped +
        KEETA_GAP +
        "{0,700}" +
        Array.from({ length: count }, () => "(" + NUM + ")").join(KEETA_GAP + "{0,100}"),
      "i",
    );
    const match = source.match(re);
    if (match) {
      const values = match.slice(1, count + 1).map(toNumber);
      if (values.every((value) => Number.isFinite(value))) return values;
    }
  }
  return [];
}

function keetaAmountAfter(source: string, ...labels: string[]): number | undefined {
  const [value] = keetaAmountsAfter(source, 1, ...labels);
  return value;
}

/**
 * Keeta tax pages use labels such as "Total(Including VAT)" both as a table
 * column header and again in the actual totals block. Requiring the SAR marker
 * prevents the column header from being paired with the first row quantity (1.00).
 */
function keetaSarSummaryAmount(source: string, ...labels: string[]): number | undefined {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^$(){}|[\]\\]/g, "\\function keetaAmountAfter(source: string, ...labels: string[]): number | undefined {
  const [value] = keetaAmountsAfter(source, 1, ...labels);
  return value;
}

function restaurantId");
    const re = new RegExp(
      escaped + "\\s*(?:SAR\\s*)(" + NUM + ")",
      "i",
    );
    const match = source.match(re);
    if (match?.[1]) {
      const value = toNumber(match[1]);
      if (Number.isFinite(value)) return value;
    }
  }
  return undefined;
}

function restaurantId(page: string): string | undefined {
  return page.match(/Restaurant\s*ID\s*:\s*(\d+)/i)?.[1];
}

function parseKeetaBranch(detailPage: string, creditPage: string): KeetaInvoiceBranch {
  const totalExVat = keetaAmountAfter(
    detailPage,
    "Total commission (not including VAT)",
    "Total commission",
  );
  const totalIncVat = keetaAmountAfter(detailPage, "Total invoice (including VAT)");

  return {
    restaurantId: restaurantId(detailPage) ?? "",
    orderCommissionInclVat: keetaAmountAfter(detailPage, "Order commission"),
    bankCommissionInclVat: keetaAmountAfter(detailPage, "Bank commission"),
    deliveryCommissionInclVat: keetaAmountAfter(detailPage, "Other commission"),
    photographyInclVat: keetaAmountAfter(detailPage, "Photography service fees"),
    subscriptionInclVat: keetaAmountAfter(detailPage, "Subscription fee"),
    commissionAdjustmentInclVat: keetaAmountAfter(detailPage, "Commission adjustment"),
    commissionTotalExVat: totalExVat,
    commissionVat:
      totalExVat !== undefined && totalIncVat !== undefined ? totalIncVat - totalExVat : undefined,
    commissionTotalInclVat: totalIncVat,
    originalItemPrice: keetaAmountAfter(creditPage, "Original item price"),
    topUpToMinimum: keetaAmountAfter(creditPage, "Top-up to minimum"),
    compensationToMerchant: keetaAmountAfter(creditPage, "Compensation to merchant"),
    restaurantDeliveryFee: keetaAmountAfter(creditPage, "Restaurant delivery fee"),
    merchantPaymentIncrease: keetaAmountAfter(creditPage, "Merchant payment increase"),
    merchantSubsidyItems: keetaAmountAfter(creditPage, "Merchant subsidy on items"),
    merchantDeliveryPromotion: keetaAmountAfter(
      creditPage,
      "Delivery promotion subsidy (restaurant delivery)",
      "Delivery promotion subsidy (restaurant",
    ),
    platformDeductions: keetaAmountAfter(creditPage, "Platform deductions from merchant"),
    advertisingCosts: keetaAmountAfter(creditPage, "Advertising costs"),
    vatWithholding: keetaAmountAfter(creditPage, "VAT withholding"),
    merchantPaymentReduction: keetaAmountAfter(creditPage, "Merchant payment reduction"),
    posMachineFees: keetaAmountAfter(creditPage, "POS machine fees"),
    totalCreditSales: keetaAmountAfter(creditPage, "Total credit sales"),
    netDue: keetaAmountAfter(creditPage, "Net due invoice"),
  };
}

function parseKeetaBranches(pages: string[]): KeetaInvoiceBranch[] {
  const branches: KeetaInvoiceBranch[] = [];

  for (let index = 0; index < pages.length; index += 1) {
    const detailPage = pages[index]!;
    if (!/Invoice Details For Branch/i.test(detailPage)) continue;

    const id = restaurantId(detailPage);
    if (!id) continue;

    const idPattern = new RegExp("Restaurant\\s*ID\\s*:\\s*" + id + "\\b", "i");
    const creditPage =
      pages
        .slice(index + 1, Math.min(index + 3, pages.length))
        .find((page) => /Credit Sales/i.test(page) && idPattern.test(page)) ?? "";

    branches.push(parseKeetaBranch(detailPage, creditPage));
  }

  return branches.filter((branch) => branch.restaurantId);
}

/** Parse a Keeta settlement/tax invoice and its branch detail pages. */
export function parseKeetaInvoice(raw: string): InvoiceFigures {
  const pages = raw
    .split(/\n+/)
    .map((page) => page.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const taxPage = pages.find((page) => /Tax Invoice/i.test(page) && !/Tax Credit Note/i.test(page));
  const simplePage = pages.find((page) => /Simple invoice/i.test(page)) ?? pages[0] ?? "";
  const creditPage =
    pages.find(
      (page) =>
        /Credit Sales/i.test(page) &&
        /Original item price|Revenue\/Expenses/i.test(page) &&
        !/Restaurant\s*ID/i.test(page),
    ) ?? "";
  const creditNotes = pages.filter((page) => /Tax Credit Note/i.test(page));

  const totalExVat = keetaAmountAfter(
    simplePage,
    "Total commission (not including VAT)",
    "Total commission",
  );
  const totalIncVat = keetaAmountAfter(simplePage, "Total invoice (including VAT)");
  const promotionRow = taxPage ? keetaAmountsAfter(taxPage, 6, "Promotion service fee") : [];
  const taxTotalExVat = taxPage
    ? keetaSarSummaryAmount(
        taxPage,
        "Total Taxable Amount (Excluding VAT)",
        "Total Taxable Amount",
      )
    : undefined;
  const taxTotalVat = taxPage
    ? keetaSarSummaryAmount(taxPage, "Total VAT Amount")
    : undefined;
  const taxTotalInclVat = taxPage
    ? keetaSarSummaryAmount(taxPage, "Total(Including VAT)", "Total (Including VAT)")
    : undefined;

  const creditNoteExVat = creditNotes.reduce(
    (sum, page) =>
      sum +
      (keetaSarSummaryAmount(
        page,
        "Total Taxable Amount (Excluding VAT)",
        "Total Taxable Amount",
      ) ?? 0),
    0,
  );
  const creditNoteVat = creditNotes.reduce(
    (sum, page) => sum + (keetaSarSummaryAmount(page, "Total VAT Amount") ?? 0),
    0,
  );
  const creditNoteInclVat = creditNotes.reduce(
    (sum, page) =>
      sum +
      (keetaSarSummaryAmount(page, "Total(Including VAT)", "Total (Including VAT)") ?? 0),
    0,
  );

  const figures = build({
    salesCommission: keetaAmountAfter(simplePage, "Order commission"),
    paymentFees: keetaAmountAfter(simplePage, "Bank commission"),
    othersCommission: keetaAmountAfter(simplePage, "Other commission"),
    totalExVat,
    vat:
      totalExVat !== undefined && totalIncVat !== undefined ? totalIncVat - totalExVat : undefined,
    totalIncVat,
    creditSales: keetaAmountAfter(simplePage, "Total credit sales"),
    netDue: keetaAmountAfter(simplePage, "Net due invoice"),
    invoiceNo: taxPage?.match(/Invoice\s*Number[^0-9]{0,80}(\d{12,})/i)?.[1],
  });

  const branches = parseKeetaBranches(pages);
  if (branches.length) figures.keetaBranches = branches;

  if (promotionRow.length >= 3) {
    figures.keetaPromotionServiceFeeExVat = promotionRow[2] ?? promotionRow[1];
  }
  figures.keetaTaxInvoiceExVat = taxTotalExVat;
  figures.keetaTaxInvoiceVat = taxTotalVat;
  figures.keetaTaxInvoiceInclVat = taxTotalInclVat;
  if (creditNoteExVat) figures.keetaTaxCreditNoteExVat = creditNoteExVat;
  if (creditNoteVat) figures.keetaTaxCreditNoteVat = creditNoteVat;
  if (creditNoteInclVat) figures.keetaTaxCreditNoteInclVat = creditNoteInclVat;

  if (creditPage) {
    figures.keetaOriginalItemPrice = keetaAmountAfter(creditPage, "Original item price");
    figures.keetaTopUpToMinimum = keetaAmountAfter(creditPage, "Top-up to minimum");
    figures.keetaCompensationToMerchant = keetaAmountAfter(creditPage, "Compensation to merchant");
    figures.keetaMerchantSubsidyItems = keetaAmountAfter(creditPage, "Merchant subsidy on items");
    figures.keetaAdvertisingCosts = keetaAmountAfter(creditPage, "Advertising costs");
    figures.keetaPosMachineFees = keetaAmountAfter(creditPage, "POS machine fees");
  }

  return figures;
}
