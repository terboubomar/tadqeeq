import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { opsCan } from "@/lib/ops";
import { getOpsUsage } from "@/lib/ops.functions";
import { OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";

export const Route = createFileRoute("/ops/usage")({ component: Usage });

// Gregorian with Western digits, like every other ops date (plain "ar-SA" gives Hijri).
const d = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric" }) : "—";

function Usage() {
  const role = useOpsRole();
  const q = useQuery({ queryKey: ["ops-usage"], queryFn: () => getOpsUsage({ data: {} }), enabled: opsCan(role, "usage") });
  if (!opsCan(role, "usage")) return <OpsDenied />;
  const rows = [...(q.data ?? [])].sort((a, b) => (b.lastLogin ?? "").localeCompare(a.lastLogin ?? ""));
  return (
    <div>
      <OpsHeader title="الاستخدام والنشاط" sub="نشاط كل عميل داخل المنصة" />
      {q.isLoading ? <Loader2 className="m-4 size-5 animate-spin" /> : q.error ? <p className="panel p-4 text-sm text-destructive">{(q.error as Error).message}</p> : (
      <>
      <section className="space-y-2 md:hidden">
        {rows.map((r) => (
          <article key={r.workspaceId} className="panel p-4 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate font-semibold">{r.name}</p>
              <span className="shrink-0 text-xs text-muted-foreground">آخر دخول {d(r.lastLogin)}</span>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              {(
                [
                  ["المستخدمون", r.users],
                  ["التدقيقات", r.audits],
                  ["الملفات", r.uploads],
                  ["Tadqeeq AI", r.aiCalls30d],
                  ["أدلة Telegram", r.evidence],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-md bg-muted/50 px-2 py-1.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="num font-semibold">{value}</dd>
                </div>
              ))}
              <div className="rounded-md bg-muted/50 px-2 py-1.5">
                <dt className="text-muted-foreground">آخر رفع</dt>
                <dd className="font-semibold">{d(r.lastUpload)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>
      <section className="panel hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["العميل", "المستخدمون", "التدقيقات", "الملفات المرفوعة", "Tadqeeq AI (30 يوم)", "أدلة Telegram", "آخر رفع", "آخر دخول"].map((h) => <th key={h} className="p-3 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.workspaceId} className="border-t border-border">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3"><span className="num">{r.users}</span></td>
                  <td className="p-3"><span className="num">{r.audits}</span></td>
                  <td className="p-3"><span className="num">{r.uploads}</span></td>
                  <td className="p-3"><span className="num">{r.aiCalls30d}</span></td>
                  <td className="p-3"><span className="num">{r.evidence}</span></td>
                  <td className="whitespace-nowrap p-3">{d(r.lastUpload)}</td>
                  <td className="whitespace-nowrap p-3">{d(r.lastLogin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
      </section>
      </>
      )}
    </div>
  );
}
