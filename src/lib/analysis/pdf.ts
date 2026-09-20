import type { HungerInvoiceBranch, InvoiceFigures } from "./types";

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

/** Parse a Keeta settlement invoice. */
export function parseKeetaInvoice(raw: string): InvoiceFigures {
  const source = raw.replace(/\s+/g, " ");
  return build({
    salesCommission: amountAfter(source, "Order commission", "Commission fee"),
    paymentFees: amountAfter(source, "Bank commission", "Bank charges"),
    othersCommission: amountAfter(source, "Other commission", "Promotion service fee"),
    totalExVat: amountAfter(source, "Total Excluding VAT", "Subtotal"),
    vat: amountAfter(source, "VAT 15", "Total VAT"),
    totalIncVat: amountAfter(source, "Total Invoice", "Invoice Total", "Total amount"),
    creditSales: amountAfter(source, "Total credit sales", "Credit sales"),
    netDue: amountAfter(source, "Net due invoice", "Net Due"),
  });
}
