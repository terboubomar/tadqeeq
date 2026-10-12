import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Building2, Check, HandCoins, LogOut } from "lucide-react";
import { useEffect } from "react";

import { LogoWordmark } from "@/components/brand/Logo";
import { MizanMark } from "@/components/brand/SuiteMarks";
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

/** Each platform's symbol on its tile: «ميزان» has its own mark; «استرداد» keeps its hand-and-coins icon. */
function SuiteSymbol({ suite }: { suite: SuiteKey }) {
  return suite === "mizan" ? (
    <MizanMark className="size-10 text-ink-foreground" />
  ) : (
    <HandCoins className="size-7 text-primary-foreground" strokeWidth={1.75} />
  );
}

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

        {/* Type scale after Linear's DESIGN.md (display 40/600, card title 28/600, body 14-15, caption 12), with
            Arabic line heights opened up and no negative tracking, which would break letter joins. */}
        <section aria-labelledby="start-title" className="mx-auto my-auto w-full max-w-[920px] py-10 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Building2 className="size-3.5 text-primary-text" />
            {context.workspaceName}
          </p>
          <h1 id="start-title" className="mt-5 font-display text-[30px] font-semibold leading-[1.3] text-ink sm:text-[40px]">
            {firstName ? `أهلاً ${firstName}، ` : "أهلاً، "}أين تبدأ اليوم؟
          </h1>
          <p className="mt-2 max-w-[56ch] text-[15px] leading-[1.75] text-muted-foreground">
            منصتان في حساب واحد. اختر واحدة، وتنقّل بينهما متى شئت من أعلى الصفحة.
          </p>

          <div className="mt-9 grid gap-4 md:grid-cols-2 md:gap-5">
            {SUITE_ORDER.map((key) => {
              const suite = SUITES[key];
              return (
                <Link
                  key={key}
                  to={suite.path}
                  className={cn(
                    "group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgb(15_42_34/0.06)] transition-[transform,box-shadow,border-color] duration-200",
                    "hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_22px_44px_-26px_rgb(15_42_34/0.4)] active:translate-y-0",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                >
                  <div className="flex items-start justify-between gap-4 p-6 pb-0 sm:p-7 sm:pb-0">
                    <div className="min-w-0">
                      <h2 className="font-display text-[28px] font-semibold leading-[1.25] text-ink">{suite.name}</h2>
                      <p className="mt-1 text-[14px] font-medium leading-[1.5] text-primary-text">{suite.descriptor}</p>
                    </div>
                    <span
                      className={cn(
                        "grid size-14 shrink-0 place-items-center rounded-2xl",
                        key === "mizan" ? "bg-ink" : "bg-primary",
                      )}
                    >
                      <SuiteSymbol suite={key} />
                    </span>
                  </div>
                  <ul className="mt-6 flex-1 space-y-3 px-6 text-[14px] leading-[1.5] text-foreground/80 sm:px-7">
                    {suite.highlights.map((line) => (
                      <li key={line} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-success" />
                        {line}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-7 flex items-center justify-between gap-3 border-t border-border px-6 py-4 sm:px-7">
                    <span className="text-[12px] font-medium tracking-[0.04em] text-muted-foreground" dir="ltr">
                      {suite.nameEn}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink">
                      فتح {suite.name}
                      <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-1" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
