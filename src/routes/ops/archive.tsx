import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { opsCan } from "@/lib/ops";
import { listDeletedOpsClients, listOpsClients } from "@/lib/ops.functions";
import { ClientListRow } from "@/components/OpsClientForms";
import { OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";

export const Route = createFileRoute("/ops/archive")({ component: ArchivePage });

const when = (iso: string) => new Date(iso).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });

function ArchivePage() {
  const role = useOpsRole();
  const [tab, setTab] = useState<"archived" | "deleted">("archived");
  const [search, setSearch] = useState("");
  const allowed = opsCan(role, "clients");
  const clients = useQuery({ queryKey: ["ops-clients"], queryFn: () => listOpsClients({ data: {} }), enabled: allowed });
  const deleted = useQuery({ queryKey: ["ops-deleted-clients"], queryFn: () => listDeletedOpsClients({ data: {} }), enabled: allowed });
  if (!allowed) return <OpsDenied />;

  const needle = search.toLowerCase();
  const archived = (clients.data ?? [])
    .filter((c) => c.archived)
    .filter((c) => `${c.name} ${c.legalName ?? ""} ${c.crNumber ?? ""} ${c.contactEmail ?? ""} ${c.ownerEmail ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
  const removed = (deleted.data ?? []).filter((d) =>
    `${d.name} ${d.legalName ?? ""} ${d.crNumber ?? ""} ${d.contactEmail ?? ""} ${d.ownerEmail ?? ""}`.toLowerCase().includes(needle),
  );
  const active = tab === "archived" ? clients : deleted;

  return (
    <div>
      <OpsHeader title="الأرشيف والمحذوفة" sub="العملاء الموقوفون يمكن استعادتهم · المحذوفون نهائياً يبقى لهم قيد فقط">
        <Input placeholder="بحث بالاسم، السجل، البريد" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
      </OpsHeader>
      <div className="mb-4 inline-flex rounded-lg border border-border bg-background p-1 text-sm">
        {([
          ["archived", "المؤرشفة", (clients.data ?? []).filter((c) => c.archived).length],
          ["deleted", "المحذوفة نهائياً", (deleted.data ?? []).length],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 transition-colors ${tab === key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            {label} <span className="num opacity-70">({count})</span>
          </button>
        ))}
      </div>

      {active.isLoading ? (
        <Loader2 className="size-5 animate-spin" />
      ) : active.error ? (
        <p className="text-sm text-destructive">{(active.error as Error).message}</p>
      ) : tab === "archived" ? (
        archived.length ? (
          <div className="space-y-2">
            {archived.map((c) => (
              <div key={c.workspaceId}>
                <ClientListRow c={c} meta={c.archivedAt ? `أُرشف ${new Date(c.archivedAt).toISOString().slice(0, 10)}` : undefined} />
              </div>
            ))}
          </div>
        ) : (
          <Empty text="لا يوجد عملاء مؤرشفون." />
        )
      ) : removed.length ? (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-start text-xs text-muted-foreground">
              <tr>
                {["الشركة", "السجل التجاري", "التواصل", "حُذف في", "بواسطة", "المحذوف"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-start font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {removed.map((d, i) => (
                <tr key={`${d.workspaceId ?? d.name}-${i}`} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{d.name}</p>
                    {d.legalName ? <p className="text-xs text-muted-foreground">{d.legalName}</p> : null}
                  </td>
                  <td className="px-4 py-3"><span className="num">{d.crNumber ?? "—"}</span></td>
                  <td className="px-4 py-3 text-xs" dir="ltr">
                    <p>{d.ownerEmail ?? d.contactEmail ?? "—"}</p>
                    {d.contactMobile ? <p className="text-muted-foreground">{d.contactMobile}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-xs">{when(d.deletedAt)}</td>
                  <td className="px-4 py-3 text-xs" dir="ltr">{d.deletedBy ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground"><span className="num">{d.usersDeleted}</span> مستخدم · <span className="num">{d.filesRemoved}</span> ملف</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty text="لم يُحذف أي عميل نهائياً بعد." />
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="panel p-8 text-center text-sm text-muted-foreground">{text}</div>;
}
