import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Building2, Check, HandCoins, LogOut, Scale } from "lucide-react";
import { useEffect } from "react";

import { LogoWordmark } from "@/components/brand/Logo";
import { useWorkspaceAccess, WorkspaceAccessProvider } from "@/components/WorkspaceAccessProvider";
import { supabase } from "@/integrations/supabase/client";
import { loadSupabase } from "@/integrations/supabase/lazy-client";
import { isOpsHost } from "@/lib/ops";
import { NOINDEX } from "@/lib/seo";
import { startDestination, SUITE_ORDER, SUITES, suiteAccess, type SuiteKey } from "@/lib/suites";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/start")({
  ssr: false,
  beforeLoad: async () => {
    if (isOpsHost(window.location.host)) throw redirect({ to: "/ops" });
    const { data, error } = await (await loadSupabase()).auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  head: () => ({ meta: [NOINDEX, { title: "اختر المنصة · تدقيق" }] }),
  component: () => (
    <WorkspaceAccessProvider>
      <StartPage />
    </WorkspaceAccessProvider>
  ),
});

const ICONS: Record<SuiteKey, typeof Scale> = { mizan: Scale, istirdad: HandCoins };

/** After signing in: subscribed clients who can open both platforms pick one; everyone else goes straight in. */
function StartPage() {
  const { context, can } = useWorkspaceAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const destination = startDestination(suiteAccess({ ...context, can }));

  useEffect(() => {
    if (destination) void navigate({ to: destination, replace: true });
  }, [destination, navigate]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  if (destination) {
    return <div className="min-h-[100dvh] bg-background" aria-busy="true" />;
  }

  const firstName = context.fullName?.trim().split(/\s+/)[0];

  return (
    <div dir="rtl" className="relative min-h-[100dvh] overflow-hidden bg-background">
      <span aria-hidden="true" className="pointer-events-none absolute -top-40 -end-40 size-[28rem] rounded-full bg-primary/10" />
      <main className="relative mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-4 py-8 sm:px-8 sm:py-12">
        <header className="flex items-center justify-between gap-4">
          <LogoWordmark title="تدقيق" className="h-9 text-ink sm:h-10" />
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            تسجيل الخروج
          </button>
        </header>

        <section aria-labelledby="start-title" className="my-auto py-10">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Building2 className="size-3.5 text-primary-text" />
            {context.workspaceName}
          </p>
          <h1 id="start-title" className="mt-4 font-display text-[28px] font-bold leading-tight text-ink sm:text-[34px]">
            {firstName ? `أهلاً ${firstName}، ` : "أهلاً، "}إلى أين اليوم؟
          </h1>
          <p className="mt-2 text-sm leading-7 text-muted-foreground sm:text-[15px]">اختر المنصة التي تريد العمل عليها. يمكنك التبديل بينهما في أي وقت.</p>

          <div className="mt-8 grid gap-4 md:grid-cols-2 md:gap-5">
            {SUITE_ORDER.map((key) => {
              const suite = SUITES[key];
              const Icon = ICONS[key];
              return (
                <Link
                  key={key}
                  to={suite.path}
                  className={cn(
                    "group relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-[0_1px_3px_rgb(19_35_43/0.06)] transition-all sm:p-7",
                    "hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_18px_40px_-24px_rgb(19_35_43/0.35)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:translate-y-0",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-12 place-items-center rounded-xl",
                      key === "mizan" ? "bg-ink text-ink-foreground" : "bg-primary text-primary-foreground",
                    )}
                  >
                    <Icon className="size-6" />
                  </span>
                  <p className="mt-5 flex items-baseline gap-2">
                    <span className="font-display text-[26px] font-bold leading-none text-ink">{suite.name}</span>
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground" dir="ltr">{suite.nameEn}</span>
                  </p>
                  <p className="mt-2 text-sm font-semibold text-primary-text">{suite.descriptor}</p>
                  <ul className="mt-5 space-y-2.5 text-sm text-muted-foreground">
                    {suite.highlights.map((line) => (
                      <li key={line} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-success" />
                        {line}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-7 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-ink">
                    فتح {suite.name}
                    <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
