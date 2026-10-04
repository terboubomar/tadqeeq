import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronLeft, Loader2, Mail, MessageCircle } from "lucide-react";

import { normalizeSaudiMobile } from "@/lib/onboarding";
import { opsCan } from "@/lib/ops";
import { getOpsTasks } from "@/lib/ops.functions";
import { OPS_TASK_GROUPS, type OpsTask, type OpsTaskKind } from "@/lib/ops-tasks";
import { OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";

export const Route = createFileRoute("/ops/tasks")({ component: Tasks });

const DAY = 864e5;

/** "Today", "in 3 days", "5 days ago" — the task date relative to now. */
function relative(iso: string | null, kind: OpsTaskKind) {
  if (!iso) return kind === "inactive" ? "لم يسجّل الدخول أبداً" : "—";
  const days = Math.round((new Date(iso).getTime() - Date.now()) / DAY);
  if (days === 0) return "اليوم";
  if (days > 0) return days === 1 ? "غداً" : `بعد ${days} يوم`;
  const ago = -days;
  const prefix = kind === "inactive" ? "آخر دخول قبل" : kind === "overdue" ? "انتهى قبل" : "قبل";
  return ago === 1 ? `${prefix} يوم` : `${prefix} ${ago} يوم`;
}

const exact = (iso: string | null, kind: OpsTaskKind) =>
  !iso
    ? null
    : kind === "meeting_upcoming" || kind === "meeting_missed"
      ? new Date(iso).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
      : new Date(iso).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric" });

function Tasks() {
  const role = useOpsRole();
  const q = useQuery({ queryKey: ["ops-tasks"], queryFn: () => getOpsTasks({ data: {} }), enabled: opsCan(role, "clients"), staleTime: 60_000 });
  if (!opsCan(role, "clients")) return <OpsDenied />;

  const tasks = q.data?.tasks ?? [];
  const groups = OPS_TASK_GROUPS.filter((g) => !g.finance || q.data?.finance)
    .map((g) => ({ ...g, items: tasks.filter((t) => t.kind === g.kind) }))
    .filter((g) => g.items.length);

  return (
    <div>
      <OpsHeader title="مهام اليوم" sub="كل ما يحتاج إجراءً من الفريق، مرتباً حسب الأولوية" />
      {q.isLoading ? (
        <Loader2 className="size-5 animate-spin" />
      ) : q.error ? (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : !groups.length ? (
        <div className="panel flex flex-col items-center gap-2 p-10 text-center">
          <CheckCircle2 className="size-8 text-primary" />
          <p className="font-semibold">لا توجد مهام معلّقة</p>
          <p className="text-sm text-muted-foreground">كل العملاء في حالة سليمة.</p>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {groups.map((g) => (
              <a key={g.kind} href={`#${g.kind}`} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs hover:border-foreground/30">
                {g.title} <span className="num font-bold">{g.items.length}</span>
              </a>
            ))}
          </div>
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.kind} id={g.kind} className="panel scroll-mt-20 overflow-hidden">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
                  <h2 className="text-sm font-bold">
                    {g.title} <span className="num text-muted-foreground">({g.items.length})</span>
                  </h2>
                  <p className="text-xs text-muted-foreground">{g.hint}</p>
                </header>
                <ul className="divide-y divide-border">
                  {g.items.map((t) => (
                    <TaskRow key={`${t.kind}-${t.workspaceId}`} t={t} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TaskRow({ t }: { t: OpsTask }) {
  const when = exact(t.date, t.kind);
  const mobile = t.contactMobile ? normalizeSaudiMobile(t.contactMobile)?.slice(1) : null;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-40 flex-1">
        <p className="font-semibold">{t.name}</p>
        <p className="text-xs text-muted-foreground">
          {relative(t.date, t.kind)}
          {when ? <span className="ms-1.5 opacity-70">· {when}</span> : null}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {mobile ? (
          <a href={`https://wa.me/${mobile}`} target="_blank" rel="noreferrer" title={t.contactMobile ?? ""} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="واتساب">
            <MessageCircle className="size-4" />
          </a>
        ) : null}
        {t.contactEmail ? (
          <a href={`mailto:${t.contactEmail}`} title={t.contactEmail} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="بريد">
            <Mail className="size-4" />
          </a>
        ) : null}
        {t.kind === "plan_request" || t.kind === "over_limit" ? (
          <Link to="/ops/subscriptions" className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
            الاشتراكات
          </Link>
        ) : null}
        <Link
          to="/ops/clients/$workspaceId"
          params={{ workspaceId: t.workspaceId }}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
        >
          فتح العميل
          <ChevronLeft className="size-3.5" />
        </Link>
      </div>
    </li>
  );
}
