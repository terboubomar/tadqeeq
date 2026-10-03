import { FlaskConical, Info } from "lucide-react";
import { useState } from "react";

import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * "Real effect" tab of the ads ROI page: how many orders the ads really added per branch,
 * next to the orders the platform credits to them.
 */

export type LiftVerdict = "clear" | "partial" | "none" | "unmeasurable";

export interface BranchLift {
  restaurantId: string;
  branchName: string;
  /** Orders the platform credits to ads. */
  attributedOrders: number;
  spent: number;
  /** Estimated extra orders; null when not measurable. */
  extraOrders: number | null;
  /** Half-width of the 95% range. */
  margin: number | null;
  /** Spend per extra order. */
  costPerExtra: number | null;
  verdict: LiftVerdict;
}

export interface AdLiftView {
  referenceBranches: number;
  daysWithAds: number;
  daysWithoutAds: number;
  branches: BranchLift[];
}

const VERDICT: Record<LiftVerdict, { label: string; className: string }> = {
  clear: { label: "أثر واضح", className: "bg-success/10 text-success" },
  partial: { label: "معظمها كان سيأتي", className: "bg-warning/10 text-warning" },
  none: { label: "لا أثر واضح", className: "bg-destructive/10 text-destructive" },
  unmeasurable: { label: "لا يمكن القياس", className: "bg-muted text-muted-foreground" },
};

const ORDER: LiftVerdict[] = ["none", "partial", "clear", "unmeasurable"];

function whole(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Extra orders as a bar against the platform's number, with the uncertainty range drawn behind it. */
function LiftBar({ lift, scale }: { lift: BranchLift; scale: number }) {
  if (lift.extraOrders === null) return <span className="text-muted-foreground">—</span>;
  const pct = (value: number) => `${Math.max(0, Math.min(100, (value / scale) * 100))}%`;
  const low = Math.max(0, lift.extraOrders - (lift.margin ?? 0));
  const high = lift.extraOrders + (lift.margin ?? 0);
  return (
    <div className="flex items-center gap-3">
      <span className="num w-[86px] shrink-0 whitespace-nowrap font-semibold">
        ≈ {whole(Math.max(0, lift.extraOrders))}
        <span className="text-[11px] font-normal text-muted-foreground"> ±{whole(lift.margin ?? 0)}</span>
      </span>
      <div className="relative h-2.5 w-full min-w-[90px] overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 bg-foreground/10" style={{ right: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }} />
        <div
          className={cn("absolute inset-y-0 right-0 rounded-full", lift.verdict === "clear" ? "bg-success" : lift.verdict === "partial" ? "bg-warning" : "bg-destructive/60")}
          style={{ width: pct(Math.max(0, lift.extraOrders)) }}
        />
        <div className="absolute inset-y-[-2px] w-0.5 bg-foreground/70" style={{ right: pct(lift.attributedOrders) }} title="ما تنسبه المنصة" />
      </div>
    </div>
  );
}

export function AdLiftPanel({ view }: { view: AdLiftView }) {
  const [showMethod, setShowMethod] = useState(false);
  const measured = view.branches.filter((b) => b.extraOrders !== null);
  const attributed = measured.reduce((sum, b) => sum + b.attributedOrders, 0);
  const extra = measured.reduce((sum, b) => sum + Math.max(0, b.extraOrders ?? 0), 0);
  const spent = measured.reduce((sum, b) => sum + b.spent, 0);
  const unproven = measured.filter((b) => b.verdict === "none").reduce((sum, b) => sum + b.spent, 0);
  const rows = [...view.branches].sort((a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict) || b.spent - a.spent);
  const scale = Math.max(...rows.map((b) => Math.max(b.attributedOrders, (b.extraOrders ?? 0) + (b.margin ?? 0))), 1);
  const untested = view.branches.filter((b) => b.verdict === "unmeasurable");

  return (
    <div className="space-y-3">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="text-[12px] text-muted-foreground">طلبات أضافتها الإعلانات فعلاً</p>
          <p className="num mt-1 text-[22px] font-bold">≈ {whole(extra)}</p>
          <p className="text-[12px] text-muted-foreground">
            المنصة تنسب لها <span className="num font-semibold text-foreground">{whole(attributed)}</span> ·{" "}
            <span className="num font-semibold text-foreground">{whole((extra / Math.max(attributed, 1)) * 100)}%</span> فقط إضافية
          </p>
        </div>
        <div className="panel p-4">
          <p className="text-[12px] text-muted-foreground">تكلفة الطلب الإضافي الواحد</p>
          <p className="num mt-1 text-[22px] font-bold">{money(spent / Math.max(extra, 1))} <span className="text-[13px] font-semibold">ر.س</span></p>
          <p className="text-[12px] text-muted-foreground">إنفاق <span className="num">{whole(spent)}</span> ر.س</p>
        </div>
        <div className="panel bg-foreground p-4 text-background">
          <p className="text-[12px] opacity-75">إنفاق لم يثبت له أثر</p>
          <p className="num mt-1 text-[22px] font-bold">{whole(unproven)} <span className="text-[13px] font-semibold">ر.س</span></p>
          <p className="text-[12px] opacity-75">راجع هذه الفروع أولاً</p>
        </div>
      </section>

      <section className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-bold">الأثر الحقيقي لكل فرع</h2>
          <button
            type="button"
            onClick={() => setShowMethod((value) => !value)}
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <Info className="size-3.5" /> كيف حسبناه؟
          </button>
        </div>
        {showMethod ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-[12.5px] leading-6 text-muted-foreground">
            قارنّا طلبات كل فرع في <span className="num">{view.daysWithAds}</span> يوم بإعلان مع{" "}
            <span className="num">{view.daysWithoutAds}</span> يوم بدون إعلان، بعد تعديلها حسب حركة السوق في{" "}
            <span className="num">{view.referenceBranches}</span> فروع لا تعلن. الرقم تقديري؛ ± هو مدى الثقة.
          </p>
        ) : null}

        <ul className="divide-y divide-border/70 rounded-lg border border-border/70 sm:hidden">
          {rows.map((lift) => (
            <li key={lift.restaurantId} className="space-y-1.5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-semibold">{lift.branchName}</span>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold", VERDICT[lift.verdict].className)}>
                  {VERDICT[lift.verdict].label}
                </span>
              </div>
              {lift.extraOrders !== null ? (
                <>
                  <LiftBar lift={lift} scale={scale} />
                  <p className="text-[12px] text-muted-foreground">
                    المنصة تقول <span className="num font-semibold text-foreground">{whole(lift.attributedOrders)}</span> · الطلب الإضافي{" "}
                    <span className="num font-semibold text-foreground">{lift.costPerExtra && lift.costPerExtra < 1000 ? money(lift.costPerExtra) : "—"}</span> ر.س
                  </p>
                </>
              ) : (
                <p className="text-[12px] text-muted-foreground">الإعلان يعمل كل يوم، لا توجد أيام للمقارنة.</p>
              )}
            </li>
          ))}
        </ul>

        <div className="hidden overflow-x-auto rounded-lg border border-border/70 sm:block">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead className="bg-muted/50 text-[12px] text-muted-foreground">
              <tr>
                {["الفرع", "المنصة تقول", "الإضافي فعلاً", "تكلفة الطلب الإضافي", "الإنفاق", "الحكم"].map((header) => (
                  <th key={header} scope="col" className="px-3 py-2 text-start font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((lift) => {
                const td = "border-t border-border/60 px-3 py-2.5 align-middle";
                return (
                  <tr key={lift.restaurantId}>
                    <td className={cn(td, "font-semibold")}>{lift.branchName}</td>
                    <td className={td}>
                      <span className="num">{lift.extraOrders === null ? "—" : whole(lift.attributedOrders)}</span>
                    </td>
                    <td className={cn(td, "w-[34%]")}>
                      {lift.extraOrders === null ? <span className="text-[12px] text-muted-foreground">الإعلان يعمل كل يوم</span> : <LiftBar lift={lift} scale={scale} />}
                    </td>
                    <td className={td}>
                      {lift.costPerExtra !== null && lift.costPerExtra < 1000 ? (
                        <span className="num">{money(lift.costPerExtra)} ر.س</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={td}>
                      <span className="num">{whole(lift.spent)}</span>
                    </td>
                    <td className={td}>
                      <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-bold", VERDICT[lift.verdict].className)}>
                        {VERDICT[lift.verdict].label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-0.5 bg-foreground/70" /> ما تنسبه المنصة
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded-sm bg-foreground/10" /> مدى الثقة
          </span>
        </p>
      </section>

      {untested.length > 0 ? (
        <section className="panel flex items-start gap-3 p-4">
          <FlaskConical className="mt-0.5 size-5 shrink-0 text-primary-text" />
          <div className="text-[12.5px] leading-6">
            <p className="font-bold">اختبر {untested.map((b) => b.branchName).join("، ")}</p>
            <p className="text-muted-foreground">أوقف الإعلان يومين في الأسبوع لمدة 4 أسابيع، وسنقيس أثره في تقرير الشهر القادم.</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
