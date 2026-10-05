import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LogoWordmark } from "@/components/brand/Logo";

export const Route = createFileRoute("/email-confirmed")({
  head: () => ({
    meta: [
      { title: "تم تأكيد بريدك · تدقيق" },
      { name: "robots", content: "noindex, follow" },
      { name: "description", content: "تم تأكيد بريدك الإلكتروني في تدقيق. سجّل الدخول لإكمال بيانات منشأتك." },
      { property: "og:title", content: "تم تأكيد بريدك · تدقيق" },
      { property: "og:description", content: "تم تأكيد حسابك في تدقيق — سجّل الدخول للمتابعة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmailConfirmedPage,
});

function EmailConfirmedPage() {
  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <LogoWordmark title="تدقيق" className="mx-auto h-9 text-ink" />
        <CheckCircle2 className="mx-auto mt-8 size-14 text-success" aria-hidden />
        <h1 className="mt-4 font-display text-2xl font-semibold">تم تأكيد بريدك بنجاح</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          حسابك في تدقيق أصبح جاهزاً. سجّل الدخول لإكمال بيانات منشأتك والبدء.
        </p>
        <Button asChild size="lg" className="mt-8 w-full">
          <Link to="/auth">تسجيل الدخول</Link>
        </Button>
      </div>
    </main>
  );
}
