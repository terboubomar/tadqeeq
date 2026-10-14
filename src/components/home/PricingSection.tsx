import { Link } from "@tanstack/react-router";
import { Check, Plus, X } from "lucide-react";
import { useState } from "react";

import { SectionIntro } from "@/components/home/SectionIntro";
import {
  CORE_FEATURE_LABELS,
  PLAN_ADDONS,
  PLAN_FEATURES,
  PRICING_TERMS,
  orderBasedPlans,
  planCardItems,
  planComparison,
  planIncludesAddon,
  type ComparisonCell,
  type ComparisonRow,
  type PublicPlan,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

/** The plans, their comparison, the add-on and the terms. On the homepage the title is an <h2>; on /pricing an <h1>. */
export function Pricing({ plans, heading = "h2" }: { plans: PublicPlan[]; heading?: "h1" | "h2" }) {
  const ordered = orderBasedPlans(plans);
  return ordered.length ? <OrderPricing plans={ordered.slice(0, 3)} heading={heading} /> : <LegacyPricing plans={plans} heading={heading} />;
}

/**
 * Three order-based plans side by side, with a monthly / yearly switch. After Linear's pricing (design-md-library:
 * same-size cards, the featured plan set apart by surface tone rather than size) and two 21st.dev ideas rebuilt in
 * Tadqeeq's own tokens: the yearly total and saving under each price («Annual Savings Pricing Grid») and a soft
 * fade on the price when the cycle changes («Pricing Section with Frequency Toggle»).
 */
function OrderPricing({ plans, heading }: { plans: PublicPlan[]; heading: "h1" | "h2" }) {
  const [cycle, setCycle] = useState<PublicPlan["cycle"]>("monthly");
  const yearly = cycle === "yearly";
  const largestLimit = Math.max(0, ...plans.map((plan) => plan.orderLimit ?? 0));
  const bundled = (plan: PublicPlan) => PLAN_ADDONS.some((addon) => planIncludesAddon(plan.features, addon.key));
  const addonFor = plans.filter((plan) => !bundled(plan) && !plan.customPrice).map((plan) => plan.name);
  const addonIn = plans.filter(bundled).map((plan) => plan.name);
  const comparison = planComparison(plans);
  const addon = PLAN_ADDONS[0];
  const featured = (plan: PublicPlan) => plan.highlighted;

  return (
    <section id="pricing" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionIntro eyebrow="الخطط والأسعار" title="ادفع حسب طلباتك، لا حسب فروعك." heading={heading}>
          فروع ومنصات ومستخدمون بلا حدود في كل الباقات. ابدأ بتجربة مجانية بدون بطاقة.
        </SectionIntro>
        <div role="group" aria-label="دورة الفوترة" className="flex rounded-full bg-muted p-1 text-sm">
          {(["monthly", "yearly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={cycle === value}
              onClick={() => setCycle(value)}
              className={cn(
                "rounded-full px-5 py-2.5 transition-colors",
                cycle === value ? "bg-card font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "monthly" ? "شهري" : "سنوي · شهران مجاناً"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-12 grid items-stretch gap-4 md:grid-cols-3">
        {plans.map((plan, index) => {
          const dark = plan.highlighted;
          const price = yearly && plan.priceYearly !== null ? plan.priceYearly : plan.price;
          const perYear = plan.priceYearly !== null && !plan.customPrice;
          const saving = perYear ? plan.price * 12 - plan.priceYearly! : 0;
          return (
            <article
              key={plan.id}
              data-reveal
              className={cn(
                "relative flex flex-col rounded-[22px] p-6 sm:p-7",
                dark ? "bg-ink text-ink-foreground shadow-[0_30px_60px_-30px_rgb(19_35_43/0.5)]" : "border border-border bg-card",
              )}
            >
              {dark ? (
                <span className="absolute -top-3 start-6 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">الأكثر اختياراً</span>
              ) : null}
              <h3 className="font-display text-xl font-extrabold">{plan.name}</h3>
              <p className={cn("mt-1 text-sm", dark ? "text-ink-muted" : "text-muted-foreground")}>
                {plan.orderLimit !== null || plan.customPrice ? (
                  <>
                    {plan.customPrice ? "أكثر من" : "حتى"} <span className="num">{(plan.orderLimit ?? largestLimit).toLocaleString("en-US")}</span> طلب شهرياً
                  </>
                ) : (
                  "طلبات بلا حدود"
                )}
              </p>

              <div className="mt-6 min-h-[5.5rem]">
                {plan.customPrice ? (
                  <p className="font-display text-3xl font-extrabold">بالاتفاق</p>
                ) : (
                  <>
                    {/* Remounts on each cycle change so the new price fades in. */}
                    <p key={cycle} className="flex flex-wrap items-baseline gap-x-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
                      <span className="num text-[2.6rem] font-semibold leading-none">{price.toLocaleString("en-US")}</span>
                      <span className={cn("text-sm", dark ? "text-ink-muted" : "text-muted-foreground")}>
                        ر.س / {yearly && plan.priceYearly !== null ? "سنوياً" : "شهرياً"}
                      </span>
                    </p>
                    {perYear ? (
                      <p className={cn("mt-2.5 text-[13px]", dark ? "text-ink-muted" : "text-muted-foreground")}>
                        {yearly ? (
                          <>
                            توفّر <span className={cn("num font-semibold", dark ? "text-primary" : "text-success")}>{saving.toLocaleString("en-US")}</span> ر.س في السنة
                          </>
                        ) : (
                          <>
                            أو <span className="num font-semibold">{plan.priceYearly!.toLocaleString("en-US")}</span> ر.س سنوياً
                          </>
                        )}
                      </p>
                    ) : null}
                  </>
                )}
              </div>

              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className={cn(
                  "mt-6 inline-flex h-11 items-center justify-center rounded-full text-sm font-bold transition-transform active:scale-[0.98]",
                  dark ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-ink text-ink-foreground hover:bg-ink/90",
                )}
              >
                {plan.customPrice ? "تواصل معنا" : "ابدأ تجربتك المجانية"}
              </Link>
              <PlanCardFeatures plans={plans} index={index} dark={dark} addonOffered={!bundled(plan) && !plan.customPrice && !!addon} />
            </article>
          );
        })}
      </div>

      <PlanComparisonTable plans={plans} rows={comparison} featured={featured} yearly={yearly} />

      <div className="mt-6 grid gap-4">
        {PLAN_ADDONS.map((addon) => (
          <div key={addon.key} data-reveal className="rounded-[22px] bg-secondary p-6 sm:flex sm:items-center sm:justify-between sm:gap-8">
            <div>
            <p className="text-xs font-semibold text-primary-text">
              {addonFor.length ? `إضافة اختيارية ${addonFor.length === 1 ? "لباقة" : addonFor.length === 2 ? "لباقتي" : "لباقات"} ${addonFor.join(" و")}` : "إضافة اختيارية"}
              {addonIn.length ? ` · مشمولة في ${addonIn.join(" و")}` : ""}
            </p>
            <p className="mt-2 font-display text-lg font-extrabold leading-8">{addon.label}</p>
            <p className="mt-2 text-sm leading-7 text-foreground/80">
              اعترض على التعويضات بفيديو من قروب الفرع، واسأل عن أرقامك بلغة بسيطة، ودقّق فواتيرك من داخل Claude و ChatGPT.
            </p>
            </div>
            <p className="mt-3 shrink-0 font-semibold sm:mt-0">
              <span className="num text-2xl">{addon.price.toLocaleString("en-US")}</span> ر.س كل {addon.months} أشهر
            </p>
          </div>
        ))}
      </div>

      <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
        {PRICING_TERMS.map((term) => (
          <li key={term}>· {term}</li>
        ))}
      </ul>
    </section>
  );
}

/** What a plan card includes: its own list, or "everything in the previous plan" plus what it adds. */
function PlanCardFeatures({ plans, index, dark, addonOffered }: { plans: PublicPlan[]; index: number; dark: boolean; addonOffered: boolean }) {
  const { basedOn, items } = planCardItems(plans, index);
  const addon = PLAN_ADDONS[0];
  return (
    <div className={cn("mt-1 border-t pt-4 text-sm", dark ? "border-ink-foreground/15" : "border-border")}>
      {basedOn ? (
        <p className="font-semibold">{items.length ? `كل ما في ${basedOn}، و:` : `كل ما في ${basedOn}، مع حد طلبات أعلى.`}</p>
      ) : (
        <p className="font-semibold">تشمل:</p>
      )}
      {items.length ? (
        <ul className="mt-3 space-y-2.5">
          {items.map((item) => (
            <li key={item} className="flex gap-2.5 leading-6">
              <Check className={cn("mt-0.5 size-4 shrink-0", dark ? "text-primary" : "text-success")} />
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {addonOffered && addon ? (
        <p className={cn("mt-3 flex gap-2.5 leading-6", dark ? "text-ink-muted" : "text-muted-foreground")}>
          <Plus className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="block font-semibold">
              إضافة اختيارية · <span className="num">{addon.price.toLocaleString("en-US")}</span> ر.س كل {addon.months} أشهر
            </span>
            <span className="block">«استرداد» للتعويضات، و Tadqeeq AI، والتدقيق من Claude و ChatGPT</span>
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** Every feature against every plan, so a restaurant can compare at a glance. */
function PlanComparisonTable({
  plans,
  rows,
  featured,
  yearly,
}: {
  plans: PublicPlan[];
  rows: ComparisonRow[];
  featured: (plan: PublicPlan) => boolean;
  yearly: boolean;
}) {
  return (
    <div data-reveal className="mt-10">
      <h3 className="font-display text-xl font-extrabold">قارن الباقات</h3>
      <div className="mt-4 overflow-x-auto rounded-[22px] border border-border bg-card">
        <table className="w-full table-fixed text-[12.5px] sm:text-sm">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="w-[34%] p-2.5 text-start font-semibold text-muted-foreground sm:w-[40%] sm:p-4">
                الميزة
              </th>
              {plans.map((plan) => {
                const price = yearly && plan.priceYearly !== null ? plan.priceYearly : plan.price;
                return (
                  <th key={plan.id} scope="col" className={cn("p-2 text-center align-bottom sm:p-4", featured(plan) && "bg-secondary")}>
                    <span className="block font-display text-sm font-extrabold sm:text-base">{plan.name}</span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {plan.customPrice ? (
                        "بالاتفاق"
                      ) : (
                        <>
                          <span className="num">{price.toLocaleString("en-US")}</span> ر.س / {yearly && plan.priceYearly !== null ? "سنوياً" : "شهرياً"}
                        </>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border/70 last:border-0">
                <th scope="row" className="p-2.5 text-start font-medium leading-6 sm:p-4">
                  {row.label}
                </th>
                {row.cells.map((cell, index) => (
                  <td key={plans[index]!.id} className={cn("p-2 text-center sm:p-4", featured(plans[index]!) && "bg-secondary/60")}>
                    <ComparisonValue cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComparisonValue({ cell }: { cell: ComparisonCell }) {
  if (cell.kind === "yes") return <Check aria-label="مشمول" className="mx-auto size-5 text-success" />;
  if (cell.kind === "no") return <span aria-label="غير متاح" className="text-muted-foreground">—</span>;
  if (cell.kind === "addon") {
    // "إضافة · 399 ر.س / 4 أشهر" → the word on one line and the price under it, so it fits a phone column.
    const [word, price] = cell.text.split(" · ");
    return (
      <span className="text-xs font-semibold leading-5 text-primary-text">
        {word}
        {price ? <span className="block font-normal">{price.split(/(\d[\d,]*)/).map((part, i) => (/^\d/.test(part) ? <span key={i} className="num">{part}</span> : part))}</span> : null}
      </span>
    );
  }
  return <span className="font-semibold">{cell.text.split(/(\d[\d,]*)/).map((part, i) => (/^\d/.test(part) ? <span key={i} className="num">{part}</span> : part))}</span>;
}

function LegacyPricing({ plans, heading }: { plans: PublicPlan[]; heading: "h1" | "h2" }) {
  const cycles = [...new Set(plans.map((plan) => plan.cycle))];
  const [cycle, setCycle] = useState<PublicPlan["cycle"]>(cycles.includes("monthly") ? "monthly" : "yearly");
  const visible = cycles.length > 1 ? plans.filter((plan) => plan.cycle === cycle) : plans;

  return (
    <section id="pricing" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionIntro eyebrow="الخطط والأسعار" title="خطة تناسب حجم مطعمك." heading={heading}>
          كل الخطط تشمل اللوحة التنفيذية ورفع ملفات المنصات الثلاث والصلاحيات.
        </SectionIntro>
        {cycles.length > 1 ? (
          <div role="group" aria-label="دورة الفوترة" className="flex rounded-full bg-muted p-1 text-sm">
            {(["monthly", "yearly"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={cycle === value}
                onClick={() => setCycle(value)}
                className={cn(
                  "rounded-full px-5 py-2.5",
                  cycle === value ? "bg-card font-semibold shadow-sm" : "text-muted-foreground",
                )}
              >
                {value === "monthly" ? "شهري" : "سنوي"}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-12 grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((plan, index) => (
          <article
            key={plan.id}
            data-reveal
            style={{ transitionDelay: `${index * 0.1}s` }}
            className={cn(
              "relative flex flex-col gap-5 rounded-[22px] p-7",
              plan.highlighted
                ? "bg-ink text-ink-foreground shadow-[0_30px_60px_-30px_rgb(19_35_43/0.5)]"
                : "border border-border bg-card",
            )}
          >
            {plan.highlighted ? (
              <span className="lp-shine absolute -top-3 start-7 z-10 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                الأكثر اختياراً
              </span>
            ) : null}
            <div className={cn("flex flex-col gap-5", plan.highlighted && "lp-float-slow")}>
              <div>
                <h3 className="font-display text-xl font-extrabold">{plan.name}</h3>
                {plan.description ? (
                  <p className={cn("mt-2 text-sm leading-7", plan.highlighted ? "text-ink-muted" : "text-muted-foreground")}>{plan.description}</p>
                ) : null}
              </div>
              <p className="flex items-baseline gap-2">
                <span className="num text-[2.6rem] font-semibold leading-none">{plan.price.toLocaleString("en-US")}</span>
                <span className={cn("text-sm", plan.highlighted ? "text-ink-muted" : "text-muted-foreground")}>
                  ر.س / {plan.cycle === "yearly" ? "سنوياً" : "شهرياً"}
                </span>
              </p>
              <p className={cn("rounded-[10px] px-3 py-2.5 text-[13px]", plan.highlighted ? "bg-ink-foreground/10 text-ink-muted" : "bg-background text-muted-foreground")}>
                {plan.uploadLimit === null ? "رفع ملفات بلا حدود" : `حتى ${plan.uploadLimit} عمليات رفع شهرياً`}
              </p>
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className={cn(
                  "inline-flex h-12 items-center justify-center rounded-full text-[15px] font-bold",
                  plan.highlighted ? "bg-primary text-primary-foreground" : "bg-ink text-ink-foreground",
                )}
              >
                اختر {plan.name}
              </Link>
              <ul className="space-y-3 text-sm">
                {CORE_FEATURE_LABELS.map((label) => (
                  <li key={label} className="flex gap-2.5">
                    <Check className={cn("size-4 shrink-0", plan.highlighted ? "text-primary" : "text-success")} />
                    {label}
                  </li>
                ))}
                {PLAN_FEATURES.map((feature) => {
                  const on = plan.features.includes(feature.key);
                  return (
                    <li key={feature.key} className={cn("flex gap-2.5", !on && "line-through opacity-45")}>
                      {on ? (
                        <Check className={cn("size-4 shrink-0", plan.highlighted ? "text-primary" : "text-success")} />
                      ) : (
                        <X className="size-4 shrink-0" />
                      )}
                      {feature.label}
                    </li>
                  );
                })}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
