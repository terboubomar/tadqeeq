import type { StoredPeriod } from "./periods";

/**
 * How each invoice-only charge (a line the invoice bills that the order data cannot recompute, such as printers or a
 * monthly subscription) is placed: straight onto the branch whose invoice section prints it, or kept at platform level
 * when only the consolidated summary prints it. Nothing is split across branches. Display only: the amounts are the
 * invoice's own, and no audit figure changes.
 */
export type AllocationRule = "direct" | "platform_level";

export const ALLOCATION_RULE_AR: Record<AllocationRule, string> = {
  direct: "مباشر للفرع (من قسم الفرع في الفاتورة)",
  platform_level: "على مستوى المنصة (في ملخص الفاتورة فقط، غير موزّع)",
};

export const ALLOCATION_RULE_EN: Record<AllocationRule, string> = {
  direct: "direct_to_branch: printed in that branch's invoice section",
  platform_level: "platform_level: printed only in the consolidated summary, not allocated",
};

export interface AllocationRow {
  /** The branch as its invoice section names it; null for platform-level charges. */
  branch: string | null;
  label: string;
  amount: number;
  rule: AllocationRule;
}

export interface InvoiceOnlyAllocation {
  rows: AllocationRow[];
  allocated: number;
  unallocated: number;
  /** allocated + unallocated. */
  total: number;
  /** The invoice-only total the audit counted, when it has one. */
  invoiceTotal: number | null;
  /** invoiceTotal − total, when invoiceTotal is known. */
  residual: number | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function invoiceOnlyAllocation(period: StoredPeriod): InvoiceOnlyAllocation {
  const rows: AllocationRow[] = [];
  for (const branch of period.invoice?.branches ?? []) {
    const name = branch.branch ?? null;
    if (branch.invoiceOnlyItems?.length) {
      for (const item of branch.invoiceOnlyItems) rows.push({ branch: name, label: item.label, amount: item.amount, rule: "direct" });
    } else if (Math.abs(branch.invoiceOnlyCharges ?? 0) > 0.005) {
      rows.push({ branch: name, label: "بنود الفاتورة فقط", amount: branch.invoiceOnlyCharges ?? 0, rule: "direct" });
    }
  }
  for (const item of period.invoice?.unallocatedCharges ?? []) {
    rows.push({ branch: null, label: item.label, amount: item.amount, rule: "platform_level" });
  }
  const allocated = round2(rows.filter((row) => row.rule === "direct").reduce((sum, row) => sum + row.amount, 0));
  const unallocated = round2(rows.filter((row) => row.rule === "platform_level").reduce((sum, row) => sum + row.amount, 0));
  const total = round2(allocated + unallocated);
  const extras = period.summary?.invoiceOnlyExtras;
  const invoiceTotal = typeof extras === "number" && extras > 0.005 ? round2(extras) : null;
  return { rows, allocated, unallocated, total, invoiceTotal, residual: invoiceTotal === null ? null : round2(invoiceTotal - total) };
}
