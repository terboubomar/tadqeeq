import { createFileRoute } from "@tanstack/react-router";
import {
  Bot,
  Database,
  Loader2,
  MessageCircleQuestion,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { askTadqeeq } from "@/lib/ai/analyst-ai.functions";
import type { AnalystChatResult, AnalystHistoryMessage } from "@/lib/ai/analyst-ai";
import { arabicDate } from "@/lib/format";
import { useSelectedPeriod } from "@/lib/use-period";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ask")({
  head: () => ({
    meta: [
      { title: "اسأل تدقيق · تدقيق" },
      {
        name: "description",
        content: "محلل محادثي يجيب من نتائج Tadqeeq الموثقة للفترة المختارة.",
      },
      { property: "og:title", content: "اسأل تدقيق · تدقيق" },
    ],
  }),
  component: AskTadqeeqPage,
});

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: AnalystChatResult;
}

const SUGGESTIONS = [
  "ما أهم المشاكل التي تحتاج مراجعتي في هذه الفترة؟",
  "أي الفروع لديها أعلى تكلفة منصة؟",
  "كم قيمة الاسترداد المحتمل وما الذي يدعمها؟",
  "كيف تغيّرت المبيعات والتكلفة عن الفترة السابقة؟",
];

function AskTadqeeqPage() {
  const { selected, isLoading } = useSelectedPeriod();

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }

  if (!selected) {
    return (
      <EmptyState
        title="لا توجد فترة للتحدث عنها"
        body="ارفع بيانات فترة تدقيق أولاً، وبعدها يستطيع Ask Tadqeeq الإجابة من النتائج الموثقة."
      />
    );
  }

  return <AskTadqeeqChat key={selected.id} periodId={selected.id} platform={selected.platform} start={selected.period_start} end={selected.period_end} />;
}

function AskTadqeeqChat({
  periodId,
  platform,
  start,
  end,
}: {
  periodId: string;
  platform: "hungerstation" | "keeta" | "jahez";
  start: string | null;
  end: string | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);

  const platformLabel =
    platform === "hungerstation" ? "هنقرستيشن" : platform === "keeta" ? "كيتا" : "جاهز";

  function historyForRequest(): AnalystHistoryMessage[] {
    return messages.slice(-8).map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  async function sendQuestion(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (!question || loading) return;

    const userMessage: ChatMessage = {
      id: "user-" + Date.now() + "-" + messages.length,
      role: "user",
      content: question,
    };

    const previousHistory = historyForRequest();
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setLoading(true);

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error("الجلسة منتهية، سجّل الدخول مرة أخرى لاستخدام Tadqeeq AI.");
      }

      const result = await askTadqeeq({
        data: {
          periodId,
          question,
          history: previousHistory,
          accessToken,
        },
      });

      setMessages((current) => [
        ...current,
        {
          id: "assistant-" + Date.now() + "-" + current.length,
          role: "assistant",
          content: result.response.answer,
          result,
        },
      ]);
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "تعذّر الحصول على إجابة من Ask Tadqeeq حالياً.";
      toast.error(message);
      setMessages((current) => [
        ...current,
        {
          id: "assistant-error-" + Date.now(),
          role: "assistant",
          content: message,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="audit-heading">اسأل تدقيق</h1>
            <span className="rounded-full border border-primary/15 bg-secondary px-2 py-0.5 text-[10px] font-semibold text-primary">
              Ask Tadqeeq V1
            </span>
          </div>
          <p className="audit-subtitle">
            {platformLabel} · {arabicDate(start)} — {arabicDate(end)}
          </p>
        </div>

        {messages.length ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMessages([])}
            disabled={loading}
          >
            <RotateCcw className="size-3.5" />
            محادثة جديدة
          </Button>
        ) : null}
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <TrustCard
          icon={Database}
          title="المصدر"
          body="نتائج Tadqeeq المحسوبة، الفروع، الاستثناءات، الأدلة، ومقارنة الفترة السابقة."
        />
        <TrustCard
          icon={ShieldCheck}
          title="الحدود"
          body="لا يحسب رقماً محاسبياً جديداً، ولا يغيّر الاستثناءات أو مبالغ الاسترداد."
        />
        <TrustCard
          icon={Sparkles}
          title="دور AI"
          body="يفهم السؤال ويشرح الحقائق الموثقة فقط، مع إظهار الأدلة التي استند إليها."
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="border-b border-border bg-secondary/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            <p className="text-xs font-semibold">Tadqeeq Financial Analyst</p>
            <span className="text-[10.5px] text-muted-foreground">
              مبني على نتائج التدقيق — لا يغيّرها
            </span>
          </div>
        </div>

        <div className="min-h-[430px] p-4 sm:p-5">
          {messages.length === 0 ? (
            <EmptyChat onAsk={sendQuestion} />
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <ChatBubble
                  key={message.id}
                  message={message}
                  onFollowUp={sendQuestion}
                  showFollowUps={index === messages.length - 1 && !loading}
                />
              ))}

              {loading ? (
                <div className="flex items-start gap-2.5">
                  <div className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary">
                    <Bot className="size-4" />
                  </div>
                  <div className="rounded-xl rounded-tr-sm border border-border bg-secondary/30 px-3.5 py-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      أراجع حقائق الفترة والأدلة الموثقة…
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <form
          className="border-t border-border bg-background/60 p-3 sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void sendQuestion(draft);
          }}
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendQuestion(draft);
                }
              }}
              placeholder="مثال: أي فرع يحتاج مراجعتي أولاً ولماذا؟"
              maxLength={1200}
              disabled={loading}
              className="min-h-[52px] max-h-36 resize-y bg-white"
            />
            <Button
              type="submit"
              size="icon"
              className="size-[52px] shrink-0"
              disabled={loading || draft.trim().length < 2}
              aria-label="إرسال"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10.5px] leading-5 text-muted-foreground">
              Enter للإرسال · Shift+Enter لسطر جديد · رسائل المحادثة لا تُكتب في نتائج التدقيق.
            </p>
            <span className="text-[10px] text-muted-foreground">{draft.length}/1200</span>
          </div>
        </form>
      </section>
    </div>
  );
}

function EmptyChat({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <div className="mx-auto flex min-h-[390px] max-w-2xl flex-col items-center justify-center text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
        <MessageCircleQuestion className="size-6" />
      </div>
      <h2 className="mt-4 text-base font-bold">اسأل عن نتائج التدقيق</h2>
      <p className="mt-2 max-w-xl text-xs leading-6 text-muted-foreground">
        Ask Tadqeeq يقرأ سجل حقائق منظم تم بناؤه من الفترة المختارة. إذا لم توجد بيانات كافية
        للإجابة، سيقول ذلك بدلاً من اختراع رقم أو سبب.
      </p>

      <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onAsk(suggestion)}
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-start text-xs leading-5 transition-colors hover:border-primary/25 hover:bg-secondary/40"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatBubble({
  message,
  onFollowUp,
  showFollowUps,
}: {
  message: ChatMessage;
  onFollowUp: (question: string) => void;
  showFollowUps: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex items-start gap-2.5", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-primary",
        )}
      >
        {isUser ? <UserRound className="size-4" /> : <Bot className="size-4" />}
      </div>

      <div className={cn("max-w-[88%] space-y-2", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-xl px-3.5 py-3 text-sm leading-7",
            isUser
              ? "rounded-tl-sm bg-primary text-primary-foreground"
              : "rounded-tr-sm border border-border bg-secondary/25 text-foreground",
          )}
        >
          {message.content}
        </div>

        {message.result ? (
          <>
            <ResponseMeta result={message.result} />

            {showFollowUps && message.result.response.followUpSuggestions.length ? (
              <div className="flex flex-wrap gap-1.5">
                {message.result.response.followUpSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => onFollowUp(suggestion)}
                    className="rounded-full border border-border bg-white px-2.5 py-1 text-[10.5px] text-muted-foreground transition-colors hover:border-primary/25 hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function ResponseMeta({ result }: { result: AnalystChatResult }) {
  const { response, factsUsed } = result;
  const confidenceLabel =
    response.confidence === "high"
      ? "ثقة عالية"
      : response.confidence === "medium"
        ? "ثقة متوسطة"
        : "ثقة منخفضة";

  const answerabilityLabel =
    response.answerability === "grounded"
      ? "إجابة موثقة"
      : response.answerability === "partial"
        ? "إجابة جزئية"
        : "البيانات غير كافية";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded-full border border-border bg-white px-2 py-0.5">
          {answerabilityLabel}
        </span>
        <span className="rounded-full border border-border bg-white px-2 py-0.5">
          {confidenceLabel}
        </span>
        <span>AI تفسير فقط</span>
      </div>

      {factsUsed.length ? (
        <details className="rounded-lg border border-border bg-white">
          <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-muted-foreground">
            الأدلة المستخدمة ({factsUsed.length})
          </summary>
          <div className="border-t border-border px-3 py-2.5">
            <div className="space-y-2">
              {factsUsed.map((fact) => (
                <div key={fact.id} className="flex items-start justify-between gap-3 text-[11px]">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground/90">{fact.label}</p>
                    <p className="mt-0.5 break-words leading-5 text-muted-foreground">
                      {fact.displayValue}
                    </p>
                  </div>
                  <span className="num shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[9.5px] text-muted-foreground">
                    {fact.id}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </details>
      ) : null}

      {response.limitations.length ? (
        <details className="rounded-lg border border-border bg-background/60">
          <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-muted-foreground">
            حدود الإجابة
          </summary>
          <ul className="border-t border-border px-3 py-2.5 ps-7 text-[10.5px] leading-5 text-muted-foreground">
            {response.limitations.map((item, index) => (
              <li key={index} className="list-disc">{item}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function TrustCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Database;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 text-primary" />
        <p className="text-xs font-semibold">{title}</p>
      </div>
      <p className="mt-1.5 text-[10.5px] leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}
