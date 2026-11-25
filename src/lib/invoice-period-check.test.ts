import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { invoicePeriodMismatch, invoicePeriodMismatchMessage, readInvoicePeriod } from "./invoice-period-check";

describe("readInvoicePeriod", () => {
  test("reads HungerStation's printed invoice period", () => {
    const text =
      "Invoice No. HS-2026/10-4958727 Invoice Date 2026-11-01 14:23:57 Invoice Period ÿ þ From 2026-10-01 00:00:00 To 2026-10-31 00:00:00 Simple Invoice";
    expect(readInvoicePeriod(text)).toEqual({ start: "2026-10-01", end: "2026-10-31" });
  });

  test("reads Arabic wording, day-first dates and Arabic digits", () => {
    expect(readInvoicePeriod("فترة الفاتورة من ٠١/٠٩/٢٠٢٦ إلى ٣٠/٠٩/٢٠٢٦")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(readInvoicePeriod("Billing period: 2026.09.01 - 2026.09.30")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
  });

  test("stays silent when no period is printed or the dates are not a period", () => {
    expect(readInvoicePeriod("Invoice Date 2026-11-01 Total 1,200.00")).toBeNull();
    expect(readInvoicePeriod("From 2026-10-31 To 2026-10-01")).toBeNull();
    expect(readInvoicePeriod("From 2026-02-30 To 2026-03-31")).toBeNull();
    expect(readInvoicePeriod("From 2026-01-01 To 2026-12-31")).toBeNull();
  });
});

describe("invoicePeriodMismatch", () => {
  const september = { start: "2026-09-01", end: "2026-09-30" };
  const october = { start: "2026-10-01", end: "2026-10-31" };

  test("stops an October order file with a September invoice", () => {
    const mismatch = invoicePeriodMismatch(september, "2026-10-01T00:12:00", "2026-10-31T23:40:00");
    expect(mismatch).toEqual({ data: { start: "2026-10-01", end: "2026-10-31" }, invoice: september });
    const message = invoicePeriodMismatchMessage(mismatch!);
    expect(message).toContain("تواريخ الملفات غير متطابقة");
    expect(message).toContain("من 2026-10-01 إلى 2026-10-31 (أكتوبر 2026)");
    expect(message).toContain("من 2026-09-01 إلى 2026-09-30 (سبتمبر 2026)");
    expect(message).toContain("تحقّق من أن ملف الطلبات والفاتورة لنفس الشهر");
  });

  test("lets matching files through, including a stray order across the month edge or a part-month file", () => {
    expect(invoicePeriodMismatch(october, "2026-10-01", "2026-10-31")).toBeNull();
    expect(invoicePeriodMismatch(october, "2026-09-30", "2026-10-31")).toBeNull();
    expect(invoicePeriodMismatch(october, "2026-10-01", "2026-10-15")).toBeNull();
  });

  test("says nothing without an invoice period or data dates", () => {
    expect(invoicePeriodMismatch(null, "2026-10-01", "2026-10-31")).toBeNull();
    expect(invoicePeriodMismatch(september, null, "2026-10-31")).toBeNull();
  });

  test("runs before anything is saved in the upload flow, not in re-analysis", () => {
    const source = readFileSync(new URL("./import-audit.server.ts", import.meta.url), "utf8");
    const check = source.indexOf("invoicePeriodMismatch(invoicePeriod");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(source.indexOf("saveColumnAliases(client"));
    expect(check).toBeLessThan(source.indexOf("insertPeriod(workspaceId"));
    const reanalysis = readFileSync(new URL("./reanalyze-period.server.ts", import.meta.url), "utf8");
    expect(reanalysis).not.toContain("invoicePeriodMismatch");
  });
});
