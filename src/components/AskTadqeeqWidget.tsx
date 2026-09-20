import {
  Bot,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type {
  AnalystChatResult,
  AnalystHistoryMessage,
  AnalystTablePresentation,
} from "@/lib/ai/analyst-ai";
import { askTadqeeq } from "@/lib/ai/analyst-ai.functions";
import { arabicDate } from "@/lib/format";
import type { StoredPeriod } from "@/lib/periods";
import { cn } from "@/lib/utils";

import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Textarea } from "./ui/textarea";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: AnalystChatResult;
}

const SUGGESTIONS = [
  "ما أهم المشاكل التي تحتاج مراجعتي في هذه الفترة؟",
  "أي الفروع لديها أعلى تكلفة منصة؟",
  "كم قيمة الاسترداد المحتمل وما الذي يدعمه؟",
  "كيف تغيّرت المبيعات والتكلفة عن الفترة السابقة؟",
];

export function AskTadqeeqWidget({
  selected,
  defaultOpen = false,
}: {
  selected: StoredPeriod | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  return (
    <div data-noprint dir="rtl">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 left-5 z-50 flex items-center gap-2 rounded-full border border-primary/15 bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-xl transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary/30 sm:bottom-6 sm:left-6"
          aria-label="فتح اسأل تدقيق"
        >
          <span className="grid size-7 place-items-center rounded-full bg-white/15">
            <Bot className="size-4" />
          </span>
          <span>اسأل تدقيق</span>
          <span className="hidden rounded-full bg-white/15 px-2 py-0.5 text-[9.5px] font-medium sm:inline">
            AI
          </span>
        </button>
      ) : (
        <section
          className={cn(
            "fixed z-50 overflow-hidden border border-border bg-white shadow-2xl",
            "inset-3 rounded-2xl sm:inset-auto sm:bottom-5 sm:left-5",
            expanded
              ? "sm:h-[calc(100vh-2.5rem)] sm:w-[min(920px,calc(100vw-2.5rem))]"
              : "sm:h-[min(780px,calc(100vh-2.5rem))] sm:w-[min(620px,calc(100vw-2.5rem))]",
          )}
          aria-label="اسأل تدقيق"
        >
          <div className="flex h-full min-h-0 flex-col">
            <WidgetHeader
              selected={selected}
              expanded={expanded}
              onToggleExpand={() => setExpanded((current) => !current)}
              onClose={() => setOpen(false)}
            />

            {selected ? (
              <AskTadqeeqConversation key={selected.id} period={selected} />
            ) : (
              <NoPeriodState onClose={() => setOpen(false)} />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function WidgetHeader({
  selected,
  expanded,
  onToggleExpand,
  onClose,
}: {
  selected: StoredPeriod | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
}) {
  const platformLabel = selected
    ? selected.platform === "hungerstation"
      ? "هنقرستيشن"
      : selected.platform === "keeta"
        ? "كيتا"
        : "جاهز"
    : null;

  return (
    <header className="shrink-0 border-b border-border bg-secondary/20 px-4 py-3.5 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Bot className="size-4" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold">اسأل تدقيق</h2>
                <span className="rounded-full border border-primary/15 bg-white px-2 py-0.5 text-[9.5px] font-semibold text-primary">
                  Financial Analyst
                </span>
              </div>
              {selected ? (
                <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                  {platformLabel} · {arabicDate(selected.period_start)} — {arabicDate(selected.period_end)}
                </p>
              ) : (
                <p className="mt-0.5 text-[10.5px] text-muted-foreground">لا توجد فترة مختارة</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden size-8 sm:inline-flex"
            onClick={onToggleExpand}
            aria-label={expanded ? "تصغير نافذة اسأل تدقيق" : "تكبير نافذة اسأل تدقيق"}
            title={expanded ? "تصغير" : "تكبير"}
          >
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onClose}
            aria-label="إغلاق اسأل تدقيق"
            title="إغلاق"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

    </header>
  );
}

function AskTadqeeqConversation({ period }: { period: StoredPeriod }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

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
          periodId: period.id,
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
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4 sm:p-5">
          {messages.length === 0 ? (
            <EmptyConversation onAsk={sendQuestion} />
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end border-b border-border/60 pb-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[10.5px]"
                  onClick={() => setMessages([])}
                  disabled={loading}
                >
                  <RotateCcw className="size-3" />
                  محادثة جديدة
                </Button>
              </div>

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
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </ScrollArea>

      <form
        className="shrink-0 border-t border-border bg-background/80 p-3 sm:p-4"
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
            placeholder="اسأل عن الفروع، الاستثناءات، التكاليف أو التغيّرات…"
            maxLength={1200}
            disabled={loading}
            className="min-h-[54px] max-h-36 resize-y bg-white"
          />
          <Button
            type="submit"
            size="icon"
            className="size-[54px] shrink-0"
            disabled={loading || draft.trim().length < 2}
            aria-label="إرسال"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[9.5px] leading-5 text-muted-foreground">
            Enter للإرسال · Shift+Enter لسطر جديد
          </p>
          <span className="text-[9.5px] text-muted-foreground">{draft.length}/1200</span>
        </div>
      </form>
    </>
  );
}

function EmptyConversation({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <div className="mx-auto flex min-h-[420px] max-w-xl items-center justify-center sm:min-h-[500px]">
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onAsk(suggestion)}
            className="rounded-lg border border-border bg-white px-3 py-3 text-start text-xs leading-5 transition-colors hover:border-primary/25 hover:bg-secondary/40"
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

      <div
        className={cn(
          "min-w-0 space-y-2",
          isUser ? "max-w-[88%] items-end" : "max-w-full flex-1",
        )}
      >
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
            {message.result.presentation ? (
              <AnalystPresentationTable presentation={message.result.presentation} />
            ) : null}
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

function AnalystPresentationTable({
  presentation,
}: {
  presentation: AnalystTablePresentation;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      {presentation.title ? (
        <div className="border-b border-border bg-secondary/25 px-3 py-2.5">
          <p className="text-[11px] font-bold text-foreground">{presentation.title}</p>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[11px]">
          <thead className="bg-secondary/10 text-muted-foreground">
            <tr>
              {presentation.columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "whitespace-nowrap border-b border-border px-3 py-2 font-semibold",
                    column.align === "number" ? "text-end" : "text-start",
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {presentation.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-border/60 last:border-b-0 hover:bg-secondary/10"
              >
                {presentation.columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "whitespace-nowrap px-3 py-2.5",
                      column.align === "number"
                        ? "num text-end font-medium"
                        : "text-start",
                      column.key === "branch" && "font-semibold text-foreground",
                    )}
                  >
                    {row[column.key] ?? "—"}
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
              <li key={index} className="list-disc">
                {item}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function NoPeriodState({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
          <Bot className="size-6" />
        </div>
        <h3 className="mt-4 text-sm font-bold">لا توجد فترة للتحدث عنها</h3>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          ارفع بيانات فترة تدقيق أولاً. بعد اختيار الفترة سيستخدم اسأل تدقيق نتائجها واستثناءاتها
          وأدلتها كمصدر للإجابة.
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onClose}>
          إغلاق
        </Button>
      </div>
    </div>
  );
}
