import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { opsActionLabel, opsCan } from "@/lib/ops";
import { Input } from "@/components/ui/input";
import { getOpsLogs } from "@/lib/ops.functions";
import { OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";

export const Route = createFileRoute("/ops/logs")({ component: Logs });

function Logs() {
  const role = useOpsRole();
  const [src, setSrc] = useState<"all" | "ops" | "client">("all");
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["ops-logs"], queryFn: () => getOpsLogs({ data: {} }), enabled: opsCan(role, "logs") });
  if (!opsCan(role, "logs")) return <OpsDenied />;
  const needle = search.trim().toLowerCase();
  const rows = (q.data ?? []).filter(
    (r) => (src === "all" || r.source === src) && (!needle || `${r.workspace} ${r.actor} ${r.action} ${opsActionLabel(r.action)}`.toLowerCase().includes(needle)),
  );
  return (
    <div>
      <OpsHeader title="السجلات" sub="آخر 300 حدث">
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <Input placeholder="بحث بالعميل أو المنفّذ أو الإجراء" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 sm:w-60 sm:flex-none" />
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={src} onChange={(e) => setSrc(e.target.value as typeof src)}>
          <option value="all">الكل</option><option value="ops">إجراءات فريق العمليات</option><option value="client">أحداث العملاء</option>
        </select>
        </div>
      </OpsHeader>
      <section className="space-y-2 md:hidden">
        {q.isLoading ? <Loader2 className="m-4 size-5 animate-spin" /> : null}
        {rows.map((r) => (
          <article key={r.source + r.id} className="panel p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 font-medium">{opsActionLabel(r.action)}</p>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{r.source === "ops" ? "العمليات" : "العميل"}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.workspace} · <span dir="ltr">{r.actor}</span>
            </p>
            <p className="mt-0.5 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
              {new Date(r.createdAt).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh" })}
            </p>
            {r.details && r.details !== "{}" ? (
              <p className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground" dir="ltr" title={r.details}>{r.details}</p>
            ) : null}
          </article>
        ))}
        {!q.isLoading && !rows.length ? <p className="panel p-6 text-center text-sm text-muted-foreground">لا توجد أحداث.</p> : null}
      </section>
      <section className="panel hidden overflow-x-auto md:block">
        {q.isLoading ? <Loader2 className="m-4 size-5 animate-spin" /> : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["الوقت", "المصدر", "الإجراء", "المنفّذ", "العميل", "التفاصيل"].map((h) => <th key={h} className="p-3 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.source + r.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap p-3 tabular-nums">{new Date(r.createdAt).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh" })}</td>
                  <td className="p-3">{r.source === "ops" ? "العمليات" : "العميل"}</td>
                  <td className="p-3"><span className="font-medium">{opsActionLabel(r.action)}</span>{opsActionLabel(r.action) !== r.action ? <span className="block font-mono text-[10px] text-muted-foreground">{r.action}</span> : null}</td>
                  <td className="p-3 text-xs" dir="ltr">{r.actor}</td>
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
