import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { count, money, percent, sar, short } from "@/lib/format";
import { operationCommissionRatio, operationCostRatio } from "@/lib/operations/details";
import { monthLabel, shiftMonth } from "@/lib/operations/months";
import type { OperationBranchSummary, OperationDay } from "@/lib/operations/types";
import { cn } from "@/lib/utils";

/** Month field with previous / next arrows. */
export function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <Button type="button" variant="outline" size="icon-sm" aria-label="الشهر السابق" onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronRight />
      </Button>
      <Input
        type="month"
        aria-label="الشهر"
        value={month}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="num h-9 w-[152px] bg-card"
      />
      <Button type="button" variant="outline" size="icon-sm" aria-label="الشهر التالي" onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronLeft />
      </Button>
    </div>
  );
}

const WEEKDAYS = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];

/**
 * The month's days, Sunday first: a day with a saved file is filled and opens it; missing days up to the last
 * uploaded one are marked, later days are faded.
 */
export function CoverageCalendar({
  month,
  daysInMonth,
  uploaded,
  onOpen,
}: {
  month: string;
  daysInMonth: number;
  /** Day of month → the current upload of that day. */
  uploaded: Map<number, string>;
  onOpen: (importId: string) => void;
}) {
  const [year, monthNumber] = month.split("-").map(Number);
  const offset = new Date(Date.UTC(year!, monthNumber! - 1, 1)).getUTCDay();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === monthNumber;
  const lastUploaded = uploaded.size ? Math.max(...uploaded.keys()) : 0;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: offset }, (_, index) => (
          <span key={"pad-" + index} />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const importId = uploaded.get(day);
          const missing = !importId && day < lastUploaded;
          const future = isCurrentMonth && day > today.getDate();
          const label = `${day} ${monthLabel(month)}`;
          if (importId) {
            return (
              <button
                key={day}
                type="button"
                onClick={() => onOpen(importId)}
                title={label + " · مرفوع، اضغط لفتح الملف"}
                aria-label={label + " · مرفوع"}
                className="num grid h-8 place-items-center rounded-md bg-success/15 text-[11.5px] font-semibold text-success hover:bg-success/25"
              >
                {day}
              </button>
            );
          }
          return (
            <span
              key={day}
              title={label + (missing ? " · لم يرفع" : "")}
              aria-label={label + (missing ? " · لم يرفع" : "")}
              className={cn(
                "num grid h-8 place-items-center rounded-md border text-[11.5px]",
                missing ? "border-dashed border-destructive/50 text-destructive" : "border-transparent bg-muted/40 text-muted-foreground",
                future && "opacity-40",
                isCurrentMonth && day === today.getDate() && "ring-1 ring-primary",
              )}
            >
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}

const chartTooltip = {
  contentStyle: {
    background: "var(--color-popover)",
    border: "1px solid var(--color-border)",
    borderRadius: "12px",
    fontSize: "12px",
    direction: "rtl" as const,
  },
  labelStyle: { color: "var(--color-muted-foreground)" },
  cursor: { fill: "var(--color-muted)", opacity: 0.5 },
};

/** Two small charts with one axis each: sales per day, and platform cost as a share of that day's sales. */
export function DailyTrend({ days }: { days: OperationDay[] }) {
  const data = days.map((day) => ({
    day: day.date.slice(8, 10) + "/" + day.date.slice(5, 7),
    sales: Number(day.grossSales.toFixed(2)),
    cost: day.grossSales > 0 ? Number(((day.chargesTotal / day.grossSales) * 100).toFixed(2)) : null,
  }));
  const average = days.reduce((sum, day) => sum + day.grossSales, 0) / Math.max(1, days.length);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <figure className="min-w-0">
        <figcaption className="text-[12px] font-semibold">
          المبيعات يومياً <span className="font-normal text-muted-foreground">· متوسط {sar(average)}</span>
        </figcaption>
        <div className="mt-2 h-48" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10.5 }} stroke="var(--color-muted-foreground)" />
              <YAxis tickFormatter={(value: number) => short(value)} tick={{ fontSize: 10.5 }} stroke="var(--color-muted-foreground)" width={40} />
              <Tooltip {...chartTooltip} formatter={(value: number) => [money(value) + " ر.س", "المبيعات"]} />
              <Bar dataKey="sales" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
      <figure className="min-w-0">
        <figcaption className="text-[12px] font-semibold">
          نسبة تكلفة المنصة يومياً <span className="font-normal text-muted-foreground">· التكلفة ÷ المبيعات</span>
        </figcaption>
        <div className="mt-2 h-48" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10.5 }} stroke="var(--color-muted-foreground)" />
              <YAxis
                tickFormatter={(value: number) => value + "%"}
                tick={{ fontSize: 10.5 }}
                stroke="var(--color-muted-foreground)"
                width={40}
                allowDecimals={false}
                domain={[(min: number) => Math.max(0, Math.floor(min - 5)), (max: number) => Math.ceil(max + 5)]}
              />
              <Tooltip {...chartTooltip} cursor={{ stroke: "var(--color-border)" }} formatter={(value: number) => [value.toFixed(2) + "%", "تكلفة المنصة"]} />
              <Line type="monotone" dataKey="cost" stroke="var(--color-chart-2)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  );
}

const BRANCHES_SHOWN = 10;

type BranchSort = "grossSales" | "orderCount" | "cost" | "commission" | "cancellationCount" | "complaintCount";

/** The month's branches, sortable by any column; phones get one card per branch. */
export function BranchBreakdown({ branches }: { branches: OperationBranchSummary[] }) {
  const [sort, setSort] = useState<{ key: BranchSort; desc: boolean }>({ key: "grossSales", desc: true });
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => {
    const value = (branch: OperationBranchSummary): number => {
      if (sort.key === "cost") return operationCostRatio(branch.chargesTotal, branch.grossSales) ?? -1;
      if (sort.key === "commission") return operationCommissionRatio(branch.commissionAmount, branch.grossSales) ?? -1;
      return branch[sort.key];
    };
    return [...branches].sort((a, b) => (sort.desc ? value(b) - value(a) : value(a) - value(b)));
  }, [branches, sort]);
  const visible = showAll ? rows : rows.slice(0, BRANCHES_SHOWN);
  const columns: Array<{ key: BranchSort; label: string }> = [
    { key: "orderCount", label: "الطلبات" },
    { key: "grossSales", label: "المبيعات" },
    { key: "cost", label: "تكلفة المنصة" },
    { key: "commission", label: "نسبة العمولة" },
    { key: "cancellationCount", label: "ملغاة" },
    { key: "complaintCount", label: "شكاوى" },
  ];
  const cells = (branch: OperationBranchSummary) => ({
    orderCount: count(branch.orderCount),
    grossSales: sar(branch.grossSales),
    cost: percent(operationCostRatio(branch.chargesTotal, branch.grossSales)),
    commission: percent(operationCommissionRatio(branch.commissionAmount, branch.grossSales)),
    cancellationCount: count(branch.cancellationCount),
    complaintCount: count(branch.complaintCount),
  });
  const name = (branch: OperationBranchSummary) => branch.branchName ?? branch.branchId ?? "—";
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-start text-[12px]">
          <thead className="bg-muted/55 text-muted-foreground">
            <tr>
              <th className="border-b border-border px-4 py-2.5 text-start font-medium">الفرع</th>
              {columns.map((column) => (
                <th key={column.key} className="border-b border-border px-3 py-1.5 text-start font-medium">
                  <button
                    type="button"
                    onClick={() => setSort((current) => ({ key: column.key, desc: current.key === column.key ? !current.desc : true }))}
                    className="inline-flex items-center gap-1 rounded px-1 py-1 hover:text-foreground"
                    aria-label={"ترتيب حسب " + column.label}
                  >
                    {column.label}
                    {sort.key === column.key ? sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" /> : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((branch) => {
              const values = cells(branch);
              return (
                <tr key={branch.key} className="hover:bg-muted/25">
                  <td className="max-w-64 truncate px-4 py-2.5 font-medium" title={name(branch)}>
                    {name(branch)}
                  </td>
                  {columns.map((column) => (
                    <td key={column.key} className={cn("whitespace-nowrap px-4 py-2.5", column.key === "grossSales" && "font-semibold")}>
                      <span className="num">{values[column.key]}</span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-border md:hidden">
        {visible.map((branch) => {
          const values = cells(branch);
          return (
            <li key={branch.key} className="px-4 py-3">
              <p className="truncate text-[13px] font-semibold">{name(branch)}</p>
              <dl className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1.5 text-[11px]">
                {columns.map((column) => (
                  <div key={column.key}>
                    <dt className="text-muted-foreground">{column.label}</dt>
                    <dd className="num font-medium">{values[column.key]}</dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
      {rows.length > BRANCHES_SHOWN ? (
        <div className="border-t border-border px-4 py-2.5 text-center">
          <button type="button" onClick={() => setShowAll((current) => !current)} className="text-[12px] font-medium text-primary-text hover:underline">
            {showAll ? "عرض أعلى " + count(BRANCHES_SHOWN) + " فروع فقط" : "عرض كل الفروع (" + count(rows.length) + ")"}
          </button>
        </div>
      ) : null}
    </>
  );
}
