import type { InvoiceFigures } from "./types";

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

/** Parse a HungerStation commission invoice. */
export function parseHungerInvoice(raw: string): InvoiceFigures {
  const source = raw.replace(/\s+/g, " ");
  // The summary rows carry three numbers each: amount, VAT 15%, total with VAT.
  const total = amountsAfter(source, 3, "Total Invoice", "Invoice Total");
  const figures = build({
    salesCommission: amountAfter(source, "Sales Commission"),
    paymentFees: amountAfter(source, "Payment Fees", "Payment Fee"),
    othersCommission: amountAfter(source, "Others Commission", "Other Commission"),
    totalExVat: total[0],
    vat: total[1],
    totalIncVat: total[2],
    totalOnlineSales: amountAfter(source, "Total Online Sales"),
    netDue: amountAfter(source, "Net Due Invoice", "Net Due"),
    invoiceNo: source.match(/Invoice\s*(?:No|Number)[^A-Za-z0-9]{0,10}([A-Za-z0-9\-/]+)/i)?.[1],
  });
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
