import { PageHeader } from "@/components/workspace/PageKit";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Clock, Lock, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { OnboardingScreen } from "@/components/OnboardingGate";
import { SubscribedPlan } from "@/components/subscription/SubscribedPlan";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { Button } from "@/components/ui/button";
import { count, money } from "@/lib/format";
import { getMyPlanRequest, requestPlan } from "@/lib/onboarding.functions";
import {
  CORE_FEATURE_LABELS,
  PLAN_ADDONS,
  PLAN_FEATURES,
  PRICING_TERMS,
  featureForPermission,
  lockedFeatureLabel,
  planHasAssistant,
  orderBasedPlans,
  ordersMonthLabel,
  planIncludesAddon,
  recommendPlan,
  type PlanAddon,
  type PublicPlan,
} from "@/lib/plans";
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

type Cycle = "monthly" | "yearly";

/** What every order-based plan includes, whatever its size. */
const INCLUDED = ["فروع ومنصات ومستخدمون بلا حدود", "رفع ملفات بلا حدود", ...PLAN_FEATURES.filter((f) => ["invoice_audit", "exceptions", "contracts"].includes(f.key)).map((f) => f.label), "رقيب · المراقب الذكي والقراءة الذكية للملفات"];

function SubscribePage() {
  const { context } = useWorkspaceAccess();
  const plans = useQuery({ queryKey: ["public-plans"], queryFn: () => listPublicPlans() });
  const [showAll, setShowAll] = useState(false);
  // A subscribed client sees their own plan, use and upgrades; the full catalogue stays one click away.
  const subscribed = !context.trial && context.planId !== null;

  if (subscribed && !showAll) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "الاشتراك" }]}
          title="باقتك"
          subtitle="اشتراكك واستخدامك هذا الشهر."
        />

        {plans.isLoading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : (
          <SubscribedPlan plans={plans.data ?? []} onShowAll={() => setShowAll(true)} />
        )}
      </div>
    );
  }

  const lockedLabels = [
    ...new Set(
      context.planLockedPermissions.filter((p) => featureForPermission(p) || p === "users.manage").map((p) => lockedFeatureLabel(p)),
    ),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "الاشتراك" }]}
        title={context.trial ? "اشترك في تدقيق" : subscribed ? "كل الباقات" : "باقتك وترقيتها"}
        subtitle="تدفع حسب عدد طلباتك فقط."
      />
      {subscribed ? (
        <button type="button" onClick={() => setShowAll(false)} className="text-sm font-semibold text-primary-text hover:underline">
          → العودة إلى باقتك
        </button>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <UsagePanel />
        <div className="panel p-5">
          <p className="text-sm font-bold">{lockedLabels.length ? "يُفتح بعد الاشتراك أو الإضافة" : "كل الأقسام مفتوحة"}</p>
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

      {plans.data?.length ? <PlanPicker plans={plans.data} /> : null}

      {context.trial ? (
        <section>
          <h2 className="mb-3 text-base font-bold">خطوات الاشتراك</h2>
          <OnboardingScreen />
        </section>
      ) : null}
    </div>
  );
}

function UsagePanel() {
  const { context } = useWorkspaceAccess();
  const limit = context.orderLimit;
  const used = context.monthlyOrders;
  const share = limit ? Math.min(1, used / limit) : 0;
  const over = limit !== null && used > limit;
  return (
    <div className="panel p-5">
      <p className="flex items-center gap-2 text-sm font-bold">
        <Sparkles className="size-4 text-primary" />
        {context.trial ? "التجربة المجانية" : `باقتك: ${context.planName ?? "كل الميزات"}`}
      </p>
      {context.trial ? (
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          رفع ملفات منصة واحدة لفترة واحدة، مع اللوحة التنفيذية و«مُطابِق» لمطابقة الفاتورة و«كاشِف» لخريطة الرسوم وتقارير الفروع.
          {context.uploadLimit !== null ? (
            <span className="num block">
              الرفع المستخدم: {Math.min(context.uploadsThisMonth, context.uploadLimit)} / {context.uploadLimit}
            </span>
          ) : null}
        </p>
      ) : null}
      <div className="mt-4">
        <p className="flex justify-between text-sm">
          <span>{ordersMonthLabel(context.ordersMonth)} من كل المنصات</span>
          <span className="num font-semibold">
            {count(used)}
            {limit !== null ? <span className="text-muted-foreground"> / {count(limit)}</span> : null}
          </span>
        </p>
        {limit !== null ? (
          <div className="mt-2 h-2 rounded-full bg-muted">
            <div className={cn("h-2 rounded-full", over ? "bg-destructive" : share >= 0.8 ? "bg-warning" : "bg-success")} style={{ width: `${share * 100}%` }} />
          </div>
        ) : null}
        {over ? (
          <p className="mt-2 text-xs leading-6 text-destructive">
            تجاوزت حد باقتك في هذا الشهر. لن نوقف تدقيقك، وإذا تكرر في الشهر التالي ننقلك للباقة الأنسب.
          </p>
        ) : limit !== null && share >= 0.8 ? (
          <p className="mt-2 text-xs text-muted-foreground">اقتربت من حد باقتك.</p>
        ) : null}
      </div>
      {context.addons.length ? (
        <p className="mt-3 text-sm text-muted-foreground">
          الإضافات: {PLAN_ADDONS.filter((a) => context.addons.includes(a.key)).map((a) => a.label).join("، ")}
        </p>
      ) : null}
    </div>
  );
}

function PlanPicker({ plans: allPlans }: { plans: PublicPlan[] }) {
  const { context } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const ordered = orderBasedPlans(allPlans);
  const plans = ordered.length ? ordered : allPlans;
  const recommended = recommendPlan(plans, context.monthlyOrders);
  const current = plans.find((plan) => plan.name === context.planName) ?? null;
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [selectedId, setSelectedId] = useState<string | null>(recommended?.id ?? current?.id ?? plans[0]?.id ?? null);
  const [addons, setAddons] = useState<PlanAddon[]>(context.addons.filter((a): a is PlanAddon => PLAN_ADDONS.some((x) => x.key === a)));
  const selected = plans.find((plan) => plan.id === selectedId) ?? null;
  const included = (addon: PlanAddon) => selected !== null && planIncludesAddon(selected.features, addon);
  const chosenAddons = addons.filter((addon) => !included(addon));
  const canRequest = context.role === "owner" || context.role === "admin";
  const request = useQuery({ queryKey: ["my-plan-request"], queryFn: () => getMyPlanRequest({ data: {} }) });
  const send = useMutation({
    mutationFn: () => requestPlan({ data: { planId: selectedId!, cycle, addons: chosenAddons } }),
    onSuccess: () => {
      toast.success("وصل طلبك. سنرسل لك الفاتورة ونفعّل الباقة بعد التحويل.");
      void queryClient.invalidateQueries({ queryKey: ["my-plan-request"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const priceOf = (plan: PublicPlan) => (cycle === "yearly" && plan.priceYearly !== null ? plan.priceYearly : plan.price);
  const pending = request.data ? plans.find((plan) => plan.id === request.data?.planId) : null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold">الباقات</h2>
        <div role="group" aria-label="دورة الفوترة" className="flex rounded-full bg-muted p-1 text-sm">
          {(["monthly", "yearly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={cycle === value}
              onClick={() => setCycle(value)}
              className={cn("rounded-full px-4 py-2", cycle === value ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
            >
              {value === "monthly" ? "شهري" : "سنوي · شهران مجاناً"}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("grid gap-3 sm:grid-cols-2", plans.length <= 3 ? "lg:grid-cols-3" : plans.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-5")}>
        {plans.map((plan) => {
          const active = plan.id === selectedId;
          return (
            <button
              key={plan.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedId(plan.id)}
              className={cn(
                "panel relative flex flex-col gap-2 p-4 text-start transition-colors",
                active ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/50",
              )}
            >
              <span className="flex flex-wrap gap-1">
                {plan.name === context.planName ? <Badge tone="success">باقتك</Badge> : null}
                {plan.id === recommended?.id ? <Badge tone="primary">الأنسب لطلباتك</Badge> : plan.highlighted ? <Badge tone="muted">الأكثر طلباً</Badge> : null}
              </span>
              <span className="font-bold">{plan.name}</span>
              <span className="text-xs text-muted-foreground">
                {plan.orderLimit !== null ? (
                  <>
                    حتى <span className="num">{count(plan.orderLimit)}</span> طلب شهرياً
                  </>
                ) : plan.customPrice ? "طلبات أكثر وخدمة مخصصة" : plan.code ? "طلبات بلا حدود" : plan.description}
              </span>
              {PLAN_ADDONS.some((addon) => planIncludesAddon(plan.features, addon.key)) ? (
                <span className="text-xs font-semibold text-primary-text">يشمل «استرداد» و Tadqeeq AI</span>
              ) : null}
              {planHasAssistant(plan.features) ? <span className="text-xs font-semibold text-primary-text">والتدقيق من داخل Claude و ChatGPT</span> : null}
              <span className="mt-auto pt-2">
                {plan.customPrice ? (
                  <span className="font-semibold">بالاتفاق</span>
                ) : (
                  <>
                    <span className="num text-xl font-semibold">{money(priceOf(plan))}</span>
                    <span className="text-xs text-muted-foreground"> ر.س / {cycle === "yearly" && plan.priceYearly !== null ? "سنوياً" : "شهرياً"}</span>
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {PLAN_ADDONS.map((addon) => {
            const inPlan = included(addon.key);
            const on = inPlan || addons.includes(addon.key);
            return (
              <label key={addon.key} className={cn("panel flex items-start gap-3 p-4", inPlan ? "opacity-80" : "cursor-pointer", on && "border-primary ring-2 ring-primary/30")}>
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={on}
                  disabled={inPlan}
                  onChange={(event) => setAddons(event.target.checked ? [...addons, addon.key] : addons.filter((key) => key !== addon.key))}
                />
                <span>
                  <span className="block font-bold">إضافة: {addon.label}</span>
                  <span className="mt-1 block text-sm leading-7 text-muted-foreground">
                    فيديو الطلب من قروب الفرع يُربط بالطلب لطلب التعويض، مع Tadqeeq AI والتدقيق من Claude و ChatGPT.
                  </span>
                  <span className="mt-1 block text-sm font-semibold">
                    {inPlan ? (
                      `مشمولة في باقة ${selected?.name}`
                    ) : (
                      <>
                        <span className="num">{money(addon.price)}</span> ر.س كل {addon.months} أشهر
                      </>
                    )}
                  </span>
                </span>
              </label>
            );
          })}
          <div className="panel p-4">
            <p className="text-sm font-bold">مشمول في كل الباقات</p>
            <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
              {[...INCLUDED, ...CORE_FEATURE_LABELS.filter((label) => !label.startsWith("رفع ملفات"))].map((label) => (
                <li key={label} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="panel flex flex-col gap-3 p-5">
          <p className="text-sm font-bold">طلبك</p>
          {selected ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt>{selected.name}</dt>
                <dd className="num font-semibold">
                  {selected.customPrice ? "بالاتفاق" : `${money(priceOf(selected))} ر.س ${cycle === "yearly" && selected.priceYearly !== null ? "سنوياً" : "شهرياً"}`}
                </dd>
              </div>
              {PLAN_ADDONS.filter((a) => chosenAddons.includes(a.key)).map((addon) => (
                <div key={addon.key} className="flex justify-between gap-3">
                  <dt>{addon.label}</dt>
                  <dd className="font-semibold">
                    <span className="num">{money(addon.price)}</span> ر.س / {addon.months} أشهر
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          <ul className="space-y-1 text-xs leading-6 text-muted-foreground">
            {PRICING_TERMS.map((term) => (
              <li key={term}>· {term}</li>
            ))}
          </ul>
          {pending ? (
            <p className="flex items-center gap-2 rounded-md bg-secondary p-3 text-xs leading-6">
              <Clock className="size-4 shrink-0 text-primary" />
              طلبت باقة {pending.name} ({request.data?.cycle === "yearly" ? "سنوي" : "شهري"}). سنرسل الفاتورة ونفعّلها بعد التحويل.
            </p>
          ) : null}
          {canRequest ? (
            <Button disabled={!selected || send.isPending} onClick={() => send.mutate()}>
              {selected?.customPrice ? "اطلب عرض سعر" : "اطلب هذه الباقة"}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">مالك الحساب أو المدير يستطيع طلب الباقة.</p>
          )}
          {!context.trial ? (
            <Button asChild variant="outline">
              <Link to="/dashboard">العودة إلى اللوحة</Link>
            </Button>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function Badge({ tone, children }: { tone: "primary" | "success" | "muted"; children: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "primary" && "bg-primary text-primary-foreground",
        tone === "success" && "bg-success/15 text-success",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
