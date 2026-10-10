import { AlertTriangle, CalendarDays, Check, FileUp, LineChart } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { PlatformIcon } from "@/components/brand/PlatformLogo";
import { cn } from "@/lib/utils";

const STEP_MS = 4200;

const STEPS: Array<{ title: string; body: string; icon: typeof FileUp }> = [
  { title: "ارفع ملف اليوم", body: "ملف الطلبات اليومي من بوابة هنقرستيشن أو كيتا أو جاهز، ويمكنك سحب عدة أيام معاً.", icon: FileUp },
  { title: "يُقرأ التاريخ ويكتمل التقويم", body: "يتعرف نَبْض على يوم الملف وفروعه، ويظهر في التقويم ما رُفع وما ينقص.", icon: CalendarDays },
  { title: "تكلفة كل منصة يوماً بيوم", body: "المبيعات ونسبة تكلفة المنصة والتكلفة لكل طلب والتحويل المتوقع لنهاية الشهر.", icon: LineChart },
  { title: "تنبيه قبل أن تعتمد الرقم", body: "ملف صُدّر قبل أن تحسب المنصة عمولتها؟ ينبّهك لإعادة تصديره بدلاً من نسبة خاطئة.", icon: AlertTriangle },
];

/** An illustrated, self-playing walk through «نَبْض»: upload, calendar, daily cost, incomplete-file alert. */
export function NabdWorkflow() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
  }, []);

  // Restart each step's own animation, then move on after STEP_MS while playing.
  useEffect(() => {
    setShown(false);
    const reveal = window.setTimeout(() => setShown(true), 60);
    const next = playing ? window.setTimeout(() => setStep((current) => (current + 1) % STEPS.length), STEP_MS) : undefined;
    return () => {
      window.clearTimeout(reveal);
      if (next) window.clearTimeout(next);
    };
  }, [step, playing]);

  function choose(index: number) {
    setPlaying(false);
    setStep(index);
  }

  return (
    <section aria-label="كيف يعمل نَبْض" className="lp-root mt-10 overflow-hidden rounded-[28px] border border-border bg-card">
      <div className="grid gap-0 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="relative order-1 grid h-[380px] place-items-center overflow-hidden bg-secondary px-5 pb-10 pt-6 sm:p-8 md:order-2 md:h-auto md:min-h-[420px]">
          <span aria-hidden="true" className="absolute -top-20 -start-20 size-56 rounded-full bg-primary/10" />
          <span aria-hidden="true" className="absolute -bottom-28 -end-16 size-72 rounded-full border border-primary/25" />
          <div key={step} className="relative w-full max-w-sm">
            <StepVisual step={step} shown={shown} />
          </div>
          <span className="absolute bottom-3 start-4 rounded-full bg-card/80 px-2.5 py-1 text-[11px] text-muted-foreground">مثال توضيحي</span>
        </div>
        <ol className="order-2 divide-y divide-border md:order-1">
          {STEPS.map((item, index) => {
            const active = index === step;
            return (
              <li key={item.title}>
                <button
                  type="button"
                  onClick={() => choose(index)}
                  aria-current={active ? "step" : undefined}
                  className={cn("flex w-full gap-3 px-5 py-4 text-start transition-colors sm:px-6", active ? "bg-background" : "hover:bg-muted/40")}
                >
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-xl transition-colors",
                      active ? "bg-primary text-primary-foreground" : "bg-secondary text-primary-text",
                    )}
                  >
                    <item.icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[15px] font-bold">
                      <span className="num text-xs font-semibold text-muted-foreground">{index + 1}</span>
                      {item.title}
                    </span>
                    <span className={cn("mt-1 block text-[13.5px] leading-7 text-muted-foreground", !active && "hidden sm:block")}>{item.body}</span>
                    {active ? (
                      <span className="mt-2 block h-0.5 overflow-hidden rounded-full bg-border">
                        <span
                          className="block h-full rounded-full bg-primary ease-linear"
                          style={{
                            width: shown && playing ? "100%" : playing ? "0%" : "100%",
                            transitionProperty: "width",
                            transitionDuration: playing ? `${STEP_MS - 100}ms` : "0ms",
                          }}
                        />
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl bg-card p-4 shadow-[0_24px_48px_-28px_rgb(19_35_43/0.45)] sm:p-5", className)}>{children}</div>;
}

function StepVisual({ step, shown }: { step: number; shown: boolean }) {
  const fade = (delay: number) => ({
    className: cn("transition-[opacity,transform] duration-500 ease-out", shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"),
    style: { transitionDelay: `${delay}s` },
  });

  if (step === 0) {
    return (
      <Card>
        <div className="flex items-center justify-center gap-2">
          {(["hungerstation", "keeta", "jahez"] as const).map((platform) => (
            <PlatformIcon key={platform} platform={platform} className="size-7 rounded-full" />
          ))}
        </div>
        <div className="mt-4 rounded-xl border-2 border-dashed border-primary/40 p-4 text-center">
          <div className={cn(fade(0.1).className, "mx-auto flex w-fit items-center gap-2 rounded-lg bg-muted px-3 py-2 text-[12.5px]")} style={fade(0.1).style}>
            <FileUp className="size-4 text-primary-text" />
            <span dir="ltr" className="num">Orders_7_Oct.csv</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-[1600ms] ease-out" style={{ width: shown ? "100%" : "0%", transitionDelay: "0.3s" }} />
          </div>
        </div>
        <p {...fade(1.9)}>
          <span className="mt-3 flex items-center gap-1.5 rounded-lg bg-success-soft px-3 py-2 text-[12px] font-semibold text-success">
            <Check className="size-4 shrink-0" /> حُفظ يوم 7 أكتوبر · 1,264 طلب
          </span>
        </p>
      </Card>
    );
  }

  if (step === 1) {
    return (
      <Card>
        <p className="text-sm font-semibold">أكتوبر</p>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 21 }, (_, index) => {
            const day = index + 1;
            const uploaded = day <= 7 && day !== 6;
            const missing = day === 6;
            return (
              <span
                key={day}
                className={cn(
                  "num grid h-8 place-items-center rounded-md text-[11.5px] transition-colors duration-300",
                  shown && uploaded ? "bg-success/15 font-semibold text-success" : shown && missing ? "border border-dashed border-destructive/60 text-destructive" : "bg-muted/50 text-muted-foreground",
                )}
                style={{ transitionDelay: `${0.15 + Math.min(day, 8) * 0.18}s` }}
              >
                {day}
              </span>
            );
          })}
        </div>
        <p {...fade(1.7)}>
          <span className="mt-3 block rounded-lg bg-muted px-3 py-2 text-[12px]">يوم 6 ناقص · ارفعه ليكتمل التوقع لنهاية الشهر</span>
        </p>
      </Card>
    );
  }

  if (step === 2) {
    const bars = [72, 66, 71, 60, 68, 74];
    return (
      <Card>
        <div className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              ["تكلفة المنصة", "27.6%"],
              ["لكل طلب", "18.55"],
              ["التحويل المتوقع", "2.3M"],
            ] as const
          ).map(([label, value], index) => (
            <div key={label} {...fade(0.1 + index * 0.12)}>
              <div className="rounded-xl bg-muted/60 px-2 py-2.5">
                <p className="text-[10.5px] text-muted-foreground">{label}</p>
                <p className="num mt-1 text-[14px] font-semibold">{value}</p>
              </div>
            </div>
          ))}
        </div>
        <div dir="ltr" className="mt-4 flex h-24 items-end gap-2">
          {bars.map((height, index) => (
            <div key={index} className="flex h-full flex-1 flex-col items-center gap-1">
              <div className="relative w-full flex-1">
                <div
                  className="absolute inset-x-0 bottom-0 rounded-t-md bg-chart-1 transition-[height] duration-700 ease-out"
                  style={{ height: shown ? `${height}%` : "0%", transitionDelay: `${0.4 + index * 0.1}s` }}
                />
              </div>
              <span className="num text-[10px] text-muted-foreground">{index + 1}</span>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div {...fade(0.1)}>
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/15 p-3 text-[12.5px] leading-6">
          <AlertTriangle className="mt-1 size-4 shrink-0 text-warning" />
          <span>
            ملف يوم 7 غير مكتمل: <span className="num font-semibold">1,044</span> طلب بلا عمولة أو أرباح بعد. أعد تصديره لاحقاً.
          </span>
        </div>
      </div>
      <div {...fade(0.7)}>
        <div className="mt-3 flex items-center justify-between rounded-xl border border-border p-3 text-[12.5px]">
          <span>فرع الريان · تكلفة المنصة</span>
          <span className="num font-semibold text-destructive">39.9%</span>
        </div>
      </div>
      <div {...fade(1.2)}>
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-success-soft px-3 py-2 text-[12px] font-semibold text-success">
          <Check className="size-4 shrink-0" /> بعد إعادة الرفع يحل الملف الجديد محل القديم تلقائياً
        </p>
      </div>
    </Card>
  );
}
