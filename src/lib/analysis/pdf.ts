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
      `${escaped}[^0-9(\\-]{0,80}` + Array.from({ length: count }, () => `(${NUM})`).join("[^0-9(\\-]{0,40}"),
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

/** Parse a HungerStation commission invoice. */
export function parseHungerInvoice(raw: string): InvoiceFigures {
  const source = raw.replace(/\s+/g, " ");
  return build({
    salesCommission: amountAfter(source, "Sales Commission"),
    paymentFees: amountAfter(source, "Payment Fees", "Payment Fee"),
    othersCommission: amountAfter(source, "Others Commission", "Other Commission"),
    totalExVat: amountAfter(source, "Total Excluding VAT", "Subtotal"),
    vat: amountAfter(source, "VAT 15", "Total VAT"),
    totalIncVat: amountAfter(source, "Total Invoice", "Invoice Total"),
    totalOnlineSales: amountAfter(source, "Total Online Sales"),
    netDue: amountAfter(source, "Net Due Invoice", "Net Due"),
    invoiceNo: source.match(/Invoice\s*(?:No|Number)[^A-Za-z0-9]{0,10}([A-Za-z0-9\-/]+)/i)?.[1],
  });
}

/** Parse a HungerStation CPC (paid ads) invoice. */
export function parseCpcInvoice(raw: string): InvoiceFigures {
  const source = raw.replace(/\s+/g, " ");
  return build({
    totalExVat: amountAfter(source, "Total Excluding VAT", "Subtotal", "Amount"),
    vat: amountAfter(source, "VAT 15", "Total VAT"),
    totalIncVat: amountAfter(source, "Total Invoice", "Invoice Total", "Total Due"),
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
