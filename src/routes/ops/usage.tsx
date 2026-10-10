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
  return (
    <div>
      <OpsHeader title="الاستخدام والنشاط" sub="نشاط كل عميل داخل المنصة" />
      <section className="panel overflow-x-auto">
        {q.isLoading ? <Loader2 className="m-4 size-5 animate-spin" /> : q.error ? <p className="p-4 text-sm text-destructive">{(q.error as Error).message}</p> : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["العميل", "المستخدمون", "التدقيقات", "الملفات المرفوعة", "Tadqeeq AI (30 يوم)", "أدلة Telegram", "آخر رفع", "آخر دخول"].map((h) => <th key={h} className="p-3 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {[...(q.data ?? [])].sort((a, b) => (b.lastLogin ?? "").localeCompare(a.lastLogin ?? "")).map((r) => (
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
        )}
      </section>
    </div>
  );
}
