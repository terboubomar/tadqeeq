import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { PeriodSummaryAiResult } from "@/lib/ai/period-summary-ai";
import { summarizePeriodWithAi } from "@/lib/ai/period-summary-ai.functions";

import { Button } from "./ui/button";

export function AiPeriodSummaryPanel({ periodId }: { periodId: string }) {
  const [result, setResult] = useState<PeriodSummaryAiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function summarize() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error("الجلسة منتهية، سجّل الدخول مرة أخرى لاستخدام Tadqeeq AI.");
      }

      const response = await summarizePeriodWithAi({
        data: {
          periodId,
          accessToken,
        },
      });
      setResult(response);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "تعذّر إنشاء ملخص Tadqeeq AI لهذه الفترة.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const confidenceLabel =
    result?.explanation.confidence === "high"
      ? "ثقة عالية"
      : result?.explanation.confidence === "medium"
        ? "ثقة متوسطة"
        : "ثقة منخفضة";

  const confidenceClass =
    result?.explanation.confidence === "high"
      ? "bg-success/10 text-success"
      : result?.explanation.confidence === "medium"
        ? "bg-warning/10 text-warning"
        : "bg-destructive/10 text-destructive";

  return (
    <section className="rounded-xl border border-primary/20 bg-secondary/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="text-sm font-bold">ملخص Tadqeeq AI للفترة</h2>
            <span className="rounded-full border border-primary/15 bg-white px-2 py-0.5 text-[10px] font-semibold text-primary">
              تحليل مساعد
            </span>
          </div>
          <p className="mt-1.5 max-w-3xl text-xs leading-6 text-muted-foreground">
            يشرح نتائج الفترة والاستثناءات التي حسبها Tadqeeq. الأرقام والنتائج المحاسبية تأتي
            من المحرك الحتمي، ولا تُرسل ملفات Excel أو CSV أو PDF الخام إلى نموذج الذكاء الاصطناعي.
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          variant={result ? "outline" : "default"}
          onClick={summarize}
          disabled={loading}
          className="shrink-0"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : result ? (
            <RefreshCw className="size-3.5" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {loading ? "جارٍ إعداد الملخص…" : result ? "تحديث الملخص" : "أنشئ ملخص الفترة"}
        </Button>
      </div>

      {error && !result ? (
        <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/[0.04] px-3 py-2.5 text-xs leading-6 text-destructive">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-4 border-t border-primary/10 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={"rounded-full px-2 py-1 text-[10.5px] font-semibold " + confidenceClass}>
              {confidenceLabel}
            </span>
            <span className="text-[10.5px] text-muted-foreground">
              تحليل AI — لا يغيّر نتائج التدقيق
            </span>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <AiSummaryText title="الخلاصة التنفيذية" text={result.explanation.executiveSummary} />
            <AiSummaryText title="القراءة المالية" text={result.explanation.financialReadout} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <AiSummaryList title="أهم نقاط الانتباه" items={result.explanation.attentionItems} />
            <AiSummaryList
              title="إشارات إيجابية"
              items={result.explanation.positiveSignals}
              emptyText="لم يحدد الملخص إشارة إيجابية مستقلة لهذه الفترة."
            />
          </div>

          <AiSummaryList
            title="إجراءات المراجعة المقترحة"
            items={result.explanation.recommendedActions}
          />

          {result.explanation.limitations.length ? (
            <AiSummaryList
              title="حدود هذا التحليل"
              items={result.explanation.limitations}
              muted
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function AiSummaryText({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-white/70 p-3">
      <p className="text-[11px] font-semibold text-muted-foreground">{title}</p>
      <p className="mt-1.5 text-xs leading-6 text-foreground/90">{text}</p>
    </div>
  );
}

function AiSummaryList({
  title,
  items,
  emptyText,
  muted = false,
}: {
  title: string;
  items: string[];
  emptyText?: string;
  muted?: boolean;
}) {
  return (
    <div
      className={
        muted
          ? "rounded-lg border border-border bg-background/50 p-3"
          : "rounded-lg border border-border/70 bg-white/70 p-3"
      }
    >
      <p className="text-[11px] font-semibold text-muted-foreground">{title}</p>
      {items.length ? (
        <ul className="mt-2 list-disc space-y-1.5 ps-5 text-xs leading-6">
          {items.map((item, index) => (
            <li key={index} className={muted ? "text-muted-foreground" : "text-foreground/90"}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          {emptyText ?? "لا توجد بنود."}
        </p>
      )}
    </div>
  );
}
