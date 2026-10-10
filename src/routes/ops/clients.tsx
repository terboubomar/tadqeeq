import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ONBOARDING_STATUS_LABELS, ONBOARDING_STEPS } from "@/lib/onboarding";
import { opsCan, SUBSCRIPTION_STATUS_LABELS } from "@/lib/ops";
import { getOpsUsage, listOpsClients, listPlans, listSubscriptions, workspaceOrderUsage } from "@/lib/ops.functions";
import { clientHealth, HEALTH_LABELS, type ClientHealth, type HealthLevel } from "@/lib/ops-health";
import type { OpsClient } from "@/lib/ops.server";
import { ClientListRow, HealthDot } from "@/components/OpsClientForms";
import { OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";

const HEALTH_LEVELS: HealthLevel[] = ["red", "amber", "green"];

/** Search, status and health live in the address, so a filtered list can be shared or bookmarked. */
export const Route = createFileRoute("/ops/clients")({
  validateSearch: (search: Record<string, unknown>): { q?: string; status?: string; health?: HealthLevel } => ({
    q: typeof search["q"] === "string" && search["q"] ? search["q"] : undefined,
    status: typeof search["status"] === "string" && search["status"] !== "all" ? search["status"] : undefined,
    health: HEALTH_LEVELS.includes(search["health"] as HealthLevel) ? (search["health"] as HealthLevel) : undefined,
  }),
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
  const params = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = params.q ?? "";
  const filter = params.status ?? "all";
  const setParams = (patch: Partial<typeof params>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const q = useQuery({ queryKey: ["ops-clients"], queryFn: () => listOpsClients({ data: {} }), enabled: opsCan(role, "clients") });
  // Health signals: activity needs the usage section, plan use needs subscriptions; missing ones are left out.
  const canUsage = opsCan(role, "usage");
  const canSubs = opsCan(role, "subscriptions");
  const usage = useQuery({ queryKey: ["ops-usage"], queryFn: () => getOpsUsage({ data: {} }), enabled: canUsage });
  const subs = useQuery({ queryKey: ["ops-subs"], queryFn: () => listSubscriptions({ data: {} }), enabled: canSubs });
  const plans = useQuery({ queryKey: ["ops-plans"], queryFn: () => listPlans({ data: {} }), enabled: canSubs });
  const orders = useQuery({ queryKey: ["ops-order-usage"], queryFn: () => workspaceOrderUsage({ data: {} }), enabled: canSubs });
  const health = useMemo(() => {
    const map = new Map<string, ClientHealth>();
    for (const c of q.data ?? []) {
      // Health is about paying customers: only active, not archived clients get a level.
      if (c.archived || c.status !== "active") continue;
      const activity = canUsage ? usage.data?.find((u) => u.workspaceId === c.workspaceId) : undefined;
      const live = canSubs
        ? subs.data?.find((sub) => sub.workspaceId === c.workspaceId && ["trial", "active", "overdue"].includes(sub.status))
        : undefined;
      const limit = live ? plans.data?.find((plan) => plan.id === live.planId)?.orderLimit ?? null : undefined;
      const latest = canSubs ? orders.data?.find((o) => o.workspaceId === c.workspaceId)?.latest : undefined;
      map.set(
        c.workspaceId,
        clientHealth({
          lastLogin: canUsage && usage.data ? activity?.lastLogin ?? null : undefined,
          lastUpload: canUsage && usage.data ? activity?.lastUpload ?? null : undefined,
          subscriptionStatus: c.subscriptionStatus,
          subscriptionEndsOn: c.subscriptionEndsOn,
          orders: limit ? latest ?? 0 : undefined,
          orderLimit: limit,
        }),
      );
    }
    return map;
  }, [q.data, usage.data, subs.data, plans.data, orders.data, canUsage, canSubs]);
  if (!opsCan(role, "clients")) return <OpsDenied />;
  const current = (q.data ?? []).filter((c) => !c.archived);
  const archivedCount = (q.data ?? []).length - current.length;
  const counts = new Map<string, number>();
  for (const c of current) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
  const rows = current.filter((c) => {
    const text = `${c.name} ${c.legalName ?? ""} ${c.crNumber ?? ""} ${c.contactEmail ?? ""} ${c.ownerEmail ?? ""} ${c.contactMobile ?? ""}`.toLowerCase();
    return (
      (filter === "all" || c.status === filter) &&
      (!params.health || health.get(c.workspaceId)?.level === params.health) &&
      text.includes(search.toLowerCase())
    );
  });
  const healthCounts = new Map<HealthLevel, number>();
  for (const value of health.values()) healthCounts.set(value.level, (healthCounts.get(value.level) ?? 0) + 1);
  const chip = (key: string, label: string, count: number) => (
    <button
      key={key}
      onClick={() => setParams({ status: key === "all" ? undefined : key })}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${filter === key ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground/30"}`}
    >
      {label} <span className="num font-bold">{count}</span>
    </button>
  );
  return (
    <div>
      <OpsHeader title="العملاء" sub={`${current.length} شركة`}>
        <div className="flex gap-2">
          <Input placeholder="بحث بالاسم، السجل، البريد، الجوال" value={search} onChange={(e) => setParams({ q: e.target.value || undefined })} className="w-60" />
          <Button variant="outline" onClick={() => downloadCsv(rows)} disabled={!rows.length}>
            <Download className="size-4" />
            تصدير CSV
          </Button>
        </div>
      </OpsHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        {chip("all", "الكل", current.length)}
        {[...ONBOARDING_STEPS, "suspended" as const].filter((s) => counts.get(s)).map((s) => chip(s, ONBOARDING_STATUS_LABELS[s], counts.get(s) ?? 0))}
        {archivedCount > 0 ? (
          <Link to="/ops/archive" className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
            المؤرشفة <span className="num font-bold">{archivedCount}</span>
          </Link>
        ) : null}
      </div>

      {health.size ? (
        <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="صحة العملاء النشطين">
          <span className="text-xs text-muted-foreground">صحة العملاء النشطين:</span>
          {HEALTH_LEVELS.filter((level) => healthCounts.get(level)).map((level) => (
            <button
              key={level}
              aria-pressed={params.health === level}
              onClick={() => setParams({ health: params.health === level ? undefined : level })}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${params.health === level ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground/30"}`}
            >
              <HealthDot level={level} />
              {HEALTH_LABELS[level]} <span className="num font-bold">{healthCounts.get(level)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {q.isLoading ? <Loader2 className="size-5 animate-spin" /> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : (
        <div className="space-y-2">
          {rows.map((c) => <ClientListRow key={c.workspaceId} c={c} health={health.get(c.workspaceId)} />)}
          {!rows.length ? <p className="panel p-8 text-center text-sm text-muted-foreground">لا يوجد عملاء بهذه الحالة.</p> : null}
        </div>
      )}
    </div>
  );
}
