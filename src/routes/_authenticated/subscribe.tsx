import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Lock, Sparkles } from "lucide-react";

import { OnboardingScreen } from "@/components/OnboardingGate";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { CORE_FEATURE_LABELS, PLAN_FEATURES, featureForPermission, lockedFeatureLabel, type PublicPlan } from "@/lib/plans";
import { listPublicPlans } from "@/lib/plans.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/subscribe")({
  head: () => ({
    meta: [
      { title: "الاشتراك · تدقيق" },
      { name: "description", content: "الباقات المتاحة وخطوات الاشتراك في تدقيق." },
    ],
  }),
  component: SubscribePage,
});

function SubscribePage() {
  const { context } = useWorkspaceAccess();
  const plans = useQuery({ queryKey: ["public-plans"], queryFn: () => listPublicPlans() });

  // One label per locked feature (a feature locks several permissions).
  const lockedLabels = [
    ...new Set(
      context.planLockedPermissions
        .filter((p) => featureForPermission(p) || p === "users.manage")
        .map((p) => lockedFeatureLabel(p)),
    ),
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="audit-heading">{context.trial ? "اشترك في تدقيق" : "باقتك وترقيتها"}</h1>
        <p className="audit-subtitle">
          {context.trial
            ? "أنت الآن في التجربة المجانية. أكمل بيانات شركتك واحجز موعداً مع الفريق لتفعيل الاشتراك."
            : "تواصل معنا لتغيير الباقة أو إضافة أقسام لفريقك."}
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Sparkles className="size-4 text-primary" />
            {context.trial ? "التجربة المجانية" : `باقتك: ${context.planName ?? "كل الميزات"}`}
          </p>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            {context.trial
              ? "رفع ملفات منصة واحدة لفترة واحدة، مع اللوحة التنفيذية ومطابقة الفاتورة وخريطة الرسوم وتقارير الفروع."
              : "الأقسام المفتوحة لفريقك حسب باقتك وصلاحيات كل مستخدم."}
          </p>
          {context.uploadLimit !== null ? (
            <p className="mt-3 text-sm">
              {context.trial ? "الرفع المستخدم" : "الرفع هذا الشهر"}:{" "}
              <span className="num">
                {Math.min(context.uploadsThisMonth, context.uploadLimit)} / {context.uploadLimit}
              </span>
            </p>
          ) : null}
        </div>
        <div className="panel p-5">
          <p className="text-sm font-bold">{lockedLabels.length ? "يُفتح بعد الاشتراك" : "كل الأقسام مفتوحة"}</p>
          {lockedLabels.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {lockedLabels.map((label) => (
                <li key={label} className="flex items-center gap-2 text-muted-foreground">
                  <Lock className="size-3.5 text-primary" />
                  {label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">لا توجد أقسام مقفلة في باقتك الحالية.</p>
          )}
        </div>
      </section>

      {plans.data?.length ? <PlanCards plans={plans.data} current={context.planName} /> : null}

      {context.trial ? (
        <section>
          <h2 className="mb-3 text-base font-bold">خطوات الاشتراك</h2>
          <OnboardingScreen />
        </section>
      ) : (
        <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="text-sm text-muted-foreground">لترقية باقتك أو تغييرها تواصل مع مدير حسابك في تدقيق.</p>
          <Button asChild variant="outline">
            <Link to="/dashboard">العودة إلى اللوحة</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function PlanCards({ plans, current }: { plans: PublicPlan[]; current: string | null }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-bold">الباقات</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className={cn("panel flex flex-col gap-3 p-5", plan.highlighted && "border-primary ring-2 ring-primary/20")}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold">{plan.name}</h3>
              {plan.name === current ? (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">باقتك</span>
              ) : plan.highlighted ? (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">الأكثر طلباً</span>
              ) : null}
            </div>
            <p>
              <span className="num text-2xl font-semibold">{money(plan.price)}</span>
              <span className="text-sm text-muted-foreground"> ر.س / {plan.cycle === "monthly" ? "شهرياً" : "سنوياً"}</span>
            </p>
            {plan.description ? <p className="text-sm text-muted-foreground">{plan.description}</p> : null}
            <ul className="space-y-1.5 text-sm">
              {[...CORE_FEATURE_LABELS, ...PLAN_FEATURES.filter((f) => plan.features.includes(f.key)).map((f) => f.label)].map(
                (label) => (
                  <li key={label} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    {label}
                  </li>
                ),
              )}
              <li className="text-muted-foreground">
                {plan.uploadLimit === null ? "رفع غير محدود" : `حتى ${plan.uploadLimit} رفعات شهرياً`}
              </li>
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
