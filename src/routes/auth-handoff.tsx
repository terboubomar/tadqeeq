import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { LogoWordmark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { emailInToken, HANDOFF_STATE_KEY, loginOriginFor, parseHandoff, type Handoff } from "@/lib/login-host";
import { NOINDEX } from "@/lib/seo";

export const Route = createFileRoute("/auth-handoff")({
  ssr: false,
  head: () => ({ meta: [NOINDEX, { title: "جارٍ الدخول · تدقيق" }] }),
  component: AuthHandoffPage,
});

type Step = { kind: "working" } | { kind: "confirm"; handoff: Handoff; email: string | null } | { kind: "invalid"; message: string };

/** Whether this handoff was started by this tab's own sign-in, so it can go straight in. */
function trusted(handoff: Handoff): boolean {
  let expected: string | null = null;
  try {
    expected = sessionStorage.getItem(HANDOFF_STATE_KEY);
    sessionStorage.removeItem(HANDOFF_STATE_KEY);
  } catch {
    expected = null;
  }
  if (handoff.state && expected === handoff.state) return true;
  try {
    return document.referrer !== "" && new URL(document.referrer).origin === loginOriginFor(window.location.host);
  } catch {
    return false;
  }
}

/**
 * Opened by login.tadqeeq.app after signing in: stores the session here and opens the app. A handoff that did
 * not come from this tab's sign-in (a link from somewhere else) asks the person to confirm the account first,
 * so nobody can be signed into an account that is not theirs by following a link.
 */
function AuthHandoffPage() {
  const [step, setStep] = useState<Step>({ kind: "working" });
  // The fragment is read once and wiped, so a second run of the effect (React strict mode) must not read it again.
  const started = useRef(false);

  async function enter(handoff: Handoff) {
    setStep({ kind: "working" });
    const { error } = await supabase.auth.setSession({ access_token: handoff.accessToken, refresh_token: handoff.refreshToken });
    if (error) {
      setStep({ kind: "invalid", message: "انتهت صلاحية رابط الدخول. سجّل الدخول من جديد." });
      return;
    }
    window.location.replace(handoff.next ?? "/dashboard");
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const handoff = parseHandoff(window.location.hash);
    // Never leave the tokens in the address bar or the history.
    window.history.replaceState(null, "", window.location.pathname);
    if (!handoff) {
      setStep({ kind: "invalid", message: "رابط الدخول غير صالح. سجّل الدخول من جديد." });
      return;
    }
    if (trusted(handoff)) void enter(handoff);
    else setStep({ kind: "confirm", handoff, email: emailInToken(handoff.accessToken) });
  }, []);

  return (
    <main dir="rtl" className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <LogoWordmark title="تدقيق" className="mx-auto h-9 text-ink" />
        {step.kind === "working" ? (
          <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> جارٍ الدخول إلى حسابك…
          </p>
        ) : step.kind === "confirm" ? (
          <>
            <h1 className="mt-8 font-display text-xl font-semibold">متابعة الدخول؟</h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              ستدخل إلى تدقيق بحساب{" "}
              <span dir="ltr" className="font-semibold text-foreground">{step.email ?? "غير معروف"}</span>. تابع فقط إن كان هذا حسابك.
            </p>
            <div className="mt-6 grid gap-2">
              <Button size="lg" onClick={() => void enter(step.handoff)}>متابعة</Button>
              <Button asChild size="lg" variant="ghost">
                <Link to="/auth">ليس حسابي، سجّل الدخول</Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-8 text-sm leading-7 text-muted-foreground" role="alert">{step.message}</p>
            <Button asChild size="lg" className="mt-6 w-full">
              <Link to="/auth">تسجيل الدخول</Link>
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
