import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ONBOARDING_STATUS_LABELS, ONBOARDING_STEPS } from "@/lib/onboarding";
import { opsCan, SUBSCRIPTION_STATUS_LABELS } from "@/lib/ops";
import { listOpsClients } from "@/lib/ops.functions";
import type { OpsClient } from "@/lib/ops.server";
import { ClientRow } from "@/components/OpsClientRow";
import { OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";

export const Route = createFileRoute("/ops/clients")({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search["open"] === "string" && search["open"] ? { open: search["open"] } : {},
  component: Clients,
});

function csvCell(v: string | number | null) {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: OpsClient[]) {
  const header = ["الشركة", "الاسم القانوني", "السجل التجاري", "الرقم الضريبي", "الحالة", "الاشتراك", "جهة الاتصال", "الجوال", "البريد", "بريد المالك", "المستخدمون", "الفروع", "إجمالي المدفوع", "تاريخ التسجيل"];
  const lines = rows.map((c) =>
    [
      c.name,
      c.legalName,
      c.crNumber,
      c.vatNumber,
      ONBOARDING_STATUS_LABELS[c.status] ?? c.status,
      c.subscriptionStatus ? SUBSCRIPTION_STATUS_LABELS[c.subscriptionStatus] : null,
      c.contactName,
      c.contactMobile,
      c.contactEmail,
      c.ownerEmail,
      c.users,
      c.branchCount,
      c.paidTotal,
      c.createdAt.slice(0, 10),
    ]
      .map(csvCell)
      .join(","),
  );
  // BOM so Excel opens the Arabic text as UTF-8.
  const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tadqeeq-clients-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Clients() {
  const role = useOpsRole();
  const { open } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const q = useQuery({ queryKey: ["ops-clients"], queryFn: () => listOpsClients({ data: {} }), enabled: opsCan(role, "clients") });
  if (!opsCan(role, "clients")) return <OpsDenied />;
  const current = (q.data ?? []).filter((c) => !c.archived);
  const archivedCount = (q.data ?? []).length - current.length;
  const counts = new Map<string, number>();
  for (const c of current) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
  const rows = current.filter((c) => {
    if (open) return c.workspaceId === open;
    const text = `${c.name} ${c.legalName ?? ""} ${c.crNumber ?? ""} ${c.contactEmail ?? ""} ${c.ownerEmail ?? ""} ${c.contactMobile ?? ""}`.toLowerCase();
    return (filter === "all" || c.status === filter) && text.includes(search.toLowerCase());
  });
  const chip = (key: string, label: string, count: number) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${filter === key ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground/30"}`}
    >
      {label} <span className="num font-bold">{count}</span>
    </button>
  );
  return (
    <div>
      <OpsHeader title="العملاء" sub={`${current.length} شركة`}>
        <div className="flex gap-2">
          <Input placeholder="بحث بالاسم، السجل، البريد، الجوال" value={search} onChange={(e) => setSearch(e.target.value)} className="w-60" disabled={!!open} />
          <Button variant="outline" onClick={() => downloadCsv(rows)} disabled={!rows.length}>
            <Download className="size-4" />
            تصدير CSV
          </Button>
        </div>
      </OpsHeader>

      {open ? (
        <p className="mb-3 text-sm">
          عرض عميل واحد ·{" "}
          <Link to="/ops/clients" search={{}} className="font-semibold underline underline-offset-4">عرض كل العملاء</Link>
        </p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {chip("all", "الكل", current.length)}
          {[...ONBOARDING_STEPS, "suspended" as const].filter((s) => counts.get(s)).map((s) => chip(s, ONBOARDING_STATUS_LABELS[s], counts.get(s) ?? 0))}
          {archivedCount > 0 ? (
            <Link to="/ops/archive" className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              المؤرشفة <span className="num font-bold">{archivedCount}</span>
            </Link>
          ) : null}
        </div>
      )}

      {q.isLoading ? <Loader2 className="size-5 animate-spin" /> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : (
        <div className="space-y-2">
          {rows.map((c) => <ClientRow key={c.workspaceId} c={c} canEdit={role !== "support"} canDelete={role === "owner"} defaultOpen={c.workspaceId === open} />)}
          {!rows.length ? <p className="panel p-8 text-center text-sm text-muted-foreground">{open ? "العميل غير موجود أو مؤرشف." : "لا يوجد عملاء بهذه الحالة."}</p> : null}
        </div>
      )}
    </div>
  );
}
