import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpCircle, Building2, CalendarClock, Check, Clock, CreditCard, FileUp, Gauge, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { Button } from "@/components/ui/button";
import { arabicDate, count, money } from "@/lib/format";
import { getMyPlanRequest, getMySubscription, requestPlan } from "@/lib/onboarding.functions";
import type { MySubscription } from "@/lib/onboarding.server";
import { orderBasedPlans, ordersMonthLabel, PLAN_ADDONS, planIncludesAddon, recommendPlan, type PlanAddon, type PublicPlan } from "@/lib/plans";
import { cn } from "@/lib/utils";

const STATUS: Record<MySubscription["status"], { label: string; tone: string }> = {
  active: { label: "نشطة", tone: "bg-success text-white" },
  trial: { label: "تجريبية", tone: "bg-primary text-primary-foreground" },
  overdue: { label: "بانتظار السداد", tone: "bg-warning text-ink" },
  cancelled: { label: "ملغاة", tone: "bg-ink-2 text-ink-foreground" },
  suspended: { label: "موقوفة", tone: "bg-destructive text-white" },
};

const METHOD: Record<string, string> = { bank_transfer: "تحويل بنكي", card: "بطاقة", cash: "نقداً" };

const sortByPrice = (plans: PublicPlan[]) =>
  [...plans].sort((a, b) => (a.customPrice ? 1 : 0) - (b.customPrice ? 1 : 0) || a.price - b.price);

/** Days from today until a date (negative when past). */
function daysUntil(date: string): number {
  const end = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

/**
 * The subscription page for a client that already subscribed: their plan and its term, this month's use,
 * the plans they can move up to, the add-on if their plan lacks it, and their payments.
 */
export function SubscribedPlan({ plans: allPlans, onShowAll }: { plans: PublicPlan[]; onShowAll: () => void }) {
  const { context } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const subscription = useQuery({ queryKey: ["my-subscription"], queryFn: () => getMySubscription({ data: {} }) });
  const request = useQuery({ queryKey: ["my-plan-request"], queryFn: () => getMyPlanRequest({ data: {} }) });
  const sub = subscription.data ?? null;
  const canRequest = context.role === "owner" || context.role === "admin";

  const coded = orderBasedPlans(allPlans);
  const plans = sortByPrice(coded.length ? coded : allPlans);
  const current = plans.find((plan) => plan.id === (sub?.planId ?? context.planId)) ?? plans.find((plan) => plan.name === context.planName) ?? null;
  const currentIndex = current ? plans.indexOf(current) : -1;
  const upgrades = currentIndex >= 0 ? plans.slice(currentIndex + 1) : [];
  const recommended = recommendPlan(plans, context.monthlyOrders);
  const cycle = sub?.cycle ?? "monthly";
  const activeAddons = sub?.addons ?? context.addons.filter((a): a is PlanAddon => PLAN_ADDONS.some((x) => x.key === a));
  const pending = request.data ? plans.find((plan) => plan.id === request.data?.planId) ?? null : null;

  const send = useMutation({
    mutationFn: (input: { planId: string; addons: PlanAddon[] }) => requestPlan({ data: { planId: input.planId, cycle, addons: input.addons } }),
    onSuccess: () => {
      toast.success("وصل طلبك. سنرسل لك الفاتورة ونفعّل التغيير بعد التحويل.");
      void queryClient.invalidateQueries({ queryKey: ["my-plan-request"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const priceOf = (plan: PublicPlan) => (cycle === "yearly" && plan.priceYearly !== null ? plan.priceYearly : plan.price);
  const per = cycle === "yearly" ? "سنوياً" : "شهرياً";
  const keepAddons = (plan: PublicPlan) => activeAddons.filter((addon) => !planIncludesAddon(plan.features, addon));

  // Usage this month.
  const limit = context.orderLimit;
  const used = context.monthlyOrders;
  const share = limit ? Math.min(1, used / limit) : 0;
  const over = limit !== null && used > limit;
  const status = sub ? STATUS[sub.status] : STATUS.active;
  const remaining = sub?.endsOn ? daysUntil(sub.endsOn) : null;
  const missingAddons = PLAN_ADDONS.filter((addon) => current && !planIncludesAddon(current.features, addon.key) && !activeAddons.includes(addon.key));

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 bg-ink p-6 text-ink-foreground">
            <div>
              <p className="flex items-center gap-2 text-xs text-ink-muted">
                <Sparkles className="size-3.5 text-primary" />
                باقتك الحالية
              </p>
              <p className="mt-2 font-display text-[28px] font-bold leading-tight">{context.planName ?? current?.name ?? "باقتك"}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {limit !== null ? (
                  <>
                    حتى <span className="num">{count(limit)}</span> طلب شهرياً
                  </>
                ) : (
                  "طلبات بلا حدود"
                )}
              </p>
            </div>
            <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", status.tone)}>{status.label}</span>
          </div>
          <dl className="grid gap-px bg-border sm:grid-cols-3">
            <Fact icon={CreditCard} label="السعر">
              {sub?.price !== null && sub?.price !== undefined ? (
                <>
                  <span className="num">{money(sub.price)}</span> ر.س {per}
                </>
              ) : current && !current.customPrice ? (
                <>
                  <span className="num">{money(priceOf(current))}</span> ر.س {per}
                </>
              ) : (
                "بالاتفاق"
              )}
            </Fact>
            <Fact icon={CalendarClock} label={sub?.endsOn ? "تتجدد في" : "بدأت في"}>
              {sub?.endsOn ? arabicDate(sub.endsOn) : arabicDate(sub?.startsOn)}
              {remaining !== null ? (
                <span className={cn("mt-0.5 block text-[11px] font-normal", remaining < 0 ? "text-destructive" : remaining <= 14 ? "text-warning" : "text-muted-foreground")}>
                  {remaining < 0 ? `انتهت قبل ${count(-remaining)} يوماً` : remaining === 0 ? "اليوم" : `بعد ${count(remaining)} يوماً`}
                </span>
              ) : null}
            </Fact>
            <Fact icon={Clock} label="دورة الفوترة">
              {cycle === "yearly" ? "سنوية" : "شهرية"}
              {sub?.startsOn ? <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">منذ {arabicDate(sub.startsOn)}</span> : null}
            </Fact>
          </dl>
          <div className="space-y-2 p-5 text-sm">
            {PLAN_ADDONS.map((addon) => {
              const inPlan = current ? planIncludesAddon(current.features, addon.key) : false;
              const on = inPlan || activeAddons.includes(addon.key);
              return (
                <p key={addon.key} className="flex items-start gap-2">
                  <Check className={cn("mt-0.5 size-4 shrink-0", on ? "text-success" : "text-muted-foreground/40")} />
                  <span className={on ? "" : "text-muted-foreground"}>
                    {addon.label}: {inPlan ? "مشمولة في باقتك" : on ? "مفعّلة كإضافة" : "غير مفعّلة"}
                  </span>
                </p>
              );
            })}
          </div>
        </div>

        <div className="panel p-5">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Gauge className="size-4 text-primary" />
            استخدامك
          </p>
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
                <div className={cn("h-2 rounded-full", over ? "bg-destructive" : share >= 0.8 ? "bg-warning" : "bg-success")} style={{ width: `${Math.max(2, share * 100)}%` }} />
              </div>
            ) : null}
            <p className={cn("mt-2 text-xs leading-6", over ? "text-destructive" : "text-muted-foreground")}>
              {over
                ? "تجاوزت حد باقتك هذا الشهر. لن نوقف تدقيقك، وإذا تكرر في الشهر التالي ننقلك للباقة الأنسب."
                : limit !== null && share >= 0.8
                  ? "اقتربت من حد باقتك هذا الشهر."
                  : limit !== null
                    ? `متبقٍ ${count(Math.max(0, limit - used))} طلب هذا الشهر.`
                    : "لا يوجد حد للطلبات في باقتك."}
            </p>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="size-3.5" />
                الشركات
              </dt>
              <dd className="num mt-1 font-semibold">
                {count(context.workspaceCount)}
                {context.workspaceLimit !== null ? <span className="text-muted-foreground"> / {count(context.workspaceLimit)}</span> : <span className="text-xs font-normal text-muted-foreground"> · بلا حدود</span>}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileUp className="size-3.5" />
                ملفات مرفوعة هذا الشهر
              </dt>
              <dd className="num mt-1 font-semibold">
                {count(context.uploadsThisMonth)}
                {context.uploadLimit !== null ? <span className="text-muted-foreground"> / {count(context.uploadLimit)}</span> : <span className="text-xs font-normal text-muted-foreground"> · بلا حدود</span>}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {pending ? (
        <p className="flex items-center gap-2 rounded-xl border border-primary/30 bg-secondary p-4 text-sm leading-6">
          <Clock className="size-4 shrink-0 text-primary" />
          طلبت باقة {pending.name} ({request.data?.cycle === "yearly" ? "سنوي" : "شهري"}). سنرسل الفاتورة ونفعّلها بعد التحويل.
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">الترقية</h2>
          <button type="button" onClick={onShowAll} className="text-xs font-semibold text-primary-text hover:underline">
            مقارنة كل الباقات
          </button>
        </div>
        {upgrades.length ? (
          <div className={cn("grid gap-3", upgrades.length === 1 ? "sm:grid-cols-1" : upgrades.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
            {upgrades.map((plan) => {
              const diff = current && !plan.customPrice && !current.customPrice ? priceOf(plan) - priceOf(current) : null;
              const fits = plan.id === recommended?.id;
              return (
                <div key={plan.id} className={cn("panel flex flex-col gap-2 p-5", fits && "border-primary ring-2 ring-primary/25")}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold">{plan.name}</p>
                    {fits ? <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">الأنسب لطلباتك</span> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {plan.orderLimit !== null ? (
                      <>
                        حتى <span className="num">{count(plan.orderLimit)}</span> طلب شهرياً
                        {limit !== null ? <> · <span className="num">{count(plan.orderLimit - limit)}</span>+ عن باقتك</> : null}
                      </>
                    ) : plan.customPrice ? (
                      "طلبات أكثر وخدمة مخصصة"
                    ) : (
                      "طلبات بلا حدود"
                    )}
                  </p>
                  {current && PLAN_ADDONS.some((addon) => planIncludesAddon(plan.features, addon.key) && !planIncludesAddon(current.features, addon.key)) ? (
                    <p className="text-xs font-semibold text-primary-text">يشمل «استرداد» و Tadqeeq AI</p>
                  ) : null}
                  <p className="mt-auto pt-2">
                    {plan.customPrice ? (
                      <span className="font-semibold">بالاتفاق</span>
                    ) : (
                      <>
                        <span className="num text-xl font-semibold">{money(priceOf(plan))}</span>
                        <span className="text-xs text-muted-foreground"> ر.س {per}</span>
                        {diff !== null && diff > 0 ? (
                          <span className="block text-[11px] text-muted-foreground">
                            <span className="num">+{money(diff)}</span> ر.س عن باقتك
                          </span>
                        ) : null}
                      </>
                    )}
                  </p>
                  {canRequest ? (
                    <Button
                      size="sm"
                      variant={fits ? "default" : "outline"}
                      disabled={send.isPending || pending?.id === plan.id}
                      onClick={() => send.mutate({ planId: plan.id, addons: keepAddons(plan) })}
                    >
                      <ArrowUpCircle className="size-4" />
                      {pending?.id === plan.id ? "تم الطلب" : plan.customPrice ? "اطلب عرض سعر" : `الترقية إلى ${plan.name}`}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="panel p-5 text-sm text-muted-foreground">أنت على أعلى باقة. للمزيد من الطلبات أو خدمة مخصصة تواصل معنا.</p>
        )}
        {!canRequest ? <p className="text-xs text-muted-foreground">مالك الحساب أو المدير يستطيع طلب الترقية.</p> : null}
      </section>

      {missingAddons.length && current ? (
        <section className="space-y-3">
          <h2 className="text-base font-bold">إضافة لباقتك</h2>
          {missingAddons.map((addon) => (
            <div key={addon.key} className="panel flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="max-w-2xl">
                <p className="font-bold">{addon.label}</p>
                <p className="mt-1 text-sm leading-7 text-muted-foreground">
                  الكاشير يرسل فيديو الطلب في قروب الفرع، وتدقيق يربطه برقم الطلب ويجهّز طلب مراجعة التعويض. ومعه Tadqeeq AI للأسئلة عن أرقامك.
                </p>
                <p className="mt-1 text-sm font-semibold">
                  <span className="num">{money(addon.price)}</span> ر.س كل {addon.months} أشهر
                </p>
              </div>
              {canRequest ? (
                <Button variant="outline" disabled={send.isPending} onClick={() => send.mutate({ planId: current.id, addons: [...activeAddons, addon.key] })}>
                  أضفها لباقتي
                </Button>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {sub?.payments.length ? (
        <section className="space-y-3">
          <h2 className="text-base font-bold">المدفوعات</h2>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 text-start font-medium">التاريخ</th>
                  <th className="px-3 py-2.5 text-start font-medium">المبلغ</th>
                  <th className="px-3 py-2.5 text-start font-medium">الطريقة</th>
                  <th className="px-5 py-2.5 text-start font-medium">المرجع</th>
                </tr>
              </thead>
              <tbody>
                {sub.payments.map((payment, index) => (
                  <tr key={`${payment.paidOn}-${index}`} className="border-b border-border/70 last:border-0">
                    <td className="px-5 py-3">{arabicDate(payment.paidOn)}</td>
                    <td className="px-3 py-3">
                      <span className="num font-semibold">{money(payment.amount)}</span> ر.س
                    </td>
                    <td className="px-3 py-3">{METHOD[payment.method] ?? payment.method}</td>
                    <td className="num px-5 py-3 text-muted-foreground">{payment.reference ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div>
        <Button asChild variant="outline">
          <Link to="/dashboard">العودة إلى اللوحة</Link>
        </Button>
      </div>
    </div>
  );
}

function Fact({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold">{children}</dd>
    </div>
  );
}
