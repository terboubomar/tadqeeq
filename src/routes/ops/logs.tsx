import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { opsCan } from "@/lib/ops";
import { getOpsLogs } from "@/lib/ops.functions";
import { OpsDenied, OpsHeader, useOpsRole } from "../ops";

export const Route = createFileRoute("/ops/logs")({ component: Logs });

function Logs() {
  const role = useOpsRole();
  const [src, setSrc] = useState<"all" | "ops" | "client">("all");
  const q = useQuery({ queryKey: ["ops-logs"], queryFn: () => getOpsLogs({ data: {} }), enabled: opsCan(role, "logs") });
  if (!opsCan(role, "logs")) return <OpsDenied />;
  const rows = (q.data ?? []).filter((r) => src === "all" || r.source === src);
  return (
    <div>
      <OpsHeader title="السجلات" sub="آخر 300 حدث">
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={src} onChange={(e) => setSrc(e.target.value as typeof src)}>
          <option value="all">الكل</option><option value="ops">إجراءات فريق العمليات</option><option value="client">أحداث العملاء</option>
        </select>
      </OpsHeader>
      <section className="panel overflow-x-auto">
        {q.isLoading ? <Loader2 className="m-4 size-5 animate-spin" /> : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["الوقت", "المصدر", "الإجراء", "المنفّذ", "العميل", "التفاصيل"].map((h) => <th key={h} className="p-3 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.source + r.id} className="border-t border-border align-top">
                  <td className="num whitespace-nowrap p-3">{new Date(r.createdAt).toLocaleString("ar-SA")}</td>
                  <td className="p-3">{r.source === "ops" ? "العمليات" : "العميل"}</td>
                  <td className="p-3 font-mono text-xs">{r.action}</td>
                  <td className="p-3 text-xs">{r.actor}</td>
                  <td className="p-3">{r.workspace}</td>
                  <td className="max-w-xs truncate p-3 font-mono text-[11px] text-muted-foreground" title={r.details}>{r.details}</td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد أحداث.</td></tr> : null}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
