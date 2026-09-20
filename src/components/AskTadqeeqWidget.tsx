import { Bot, Maximize2, Minimize2, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
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
  const [structuredMode, setStructuredMode] = useState(false);

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
              ? "sm:h-[calc(100vh-2.5rem)] sm:w-[min(1180px,calc(100vw-2.5rem))]"
              : structuredMode
                ? "sm:h-[min(840px,calc(100vh-2.5rem))] sm:w-[min(1040px,calc(100vw-2.5rem))]"
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
              <AskTadqeeqConversation
                key={selected.id}
                period={selected}
                onStructuredModeChange={setStructuredMode}
              />
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
                  {platformLabel} · {arabicDate(selected.period_start)} —{" "}
                  {arabicDate(selected.period_end)}
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

function AskTadqeeqConversation({
  period,
  onStructuredModeChange,
}: {
  period: StoredPeriod;
  onStructuredModeChange: (active: boolean) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
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

      if (result.presentation?.type === "table") {
        onStructuredModeChange(true);
      }

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
        cause instanceof Error ? cause.message : "تعذّر الحصول على إجابة من Ask Tadqeeq حالياً.";
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
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-4 p-4 sm:p-5">
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
                  onClick={() => {
                    setMessages([]);
                    onStructuredModeChange(false);
                  }}
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
                <Message from="assistant">
                  <MessageContent>
                    <Shimmer className="text-xs">أراجع حقائق الفترة والأدلة الموثقة…</Shimmer>
                  </MessageContent>
                </Message>
              ) : null}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label="الانتقال إلى أحدث رسالة" />
      </Conversation>

      <div className="shrink-0 border-t border-border bg-background/80 p-3 sm:p-4">
        <PromptInput
          className="bg-white"
          onSubmit={({ text }) => {
            void sendQuestion(text || draft);
            return undefined;
          }}
        >
          <PromptInputTextarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="اسأل عن الفروع، الاستثناءات، التكاليف أو التغيّرات…"
            maxLength={1200}
            disabled={loading}
            className="min-h-[54px]"
          />
          <PromptInputFooter>
            <span className="text-[9.5px] text-muted-foreground">{draft.length}/1200</span>
            <PromptInputSubmit
              status={loading ? "submitted" : "ready"}
              disabled={loading || draft.trim().length < 2}
              aria-label="إرسال"
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  );
}

function EmptyConversation({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <div className="mx-auto flex min-h-[420px] max-w-xl items-center justify-center sm:min-h-[500px]">
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <Button
            key={suggestion}
            type="button"
            variant="outline"
            onClick={() => onAsk(suggestion)}
            className="h-auto min-h-12 justify-start whitespace-normal px-3 py-3 text-start text-xs leading-5"
          >
            {suggestion}
          </Button>
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
  const structured = !isUser && Boolean(message.result?.presentation);

  if (structured && message.result) {
    return (
      <Message from="assistant" className="max-w-full space-y-3">
        <MessageContent className="w-full">
          <MessageResponse className="text-sm leading-7">{message.content}</MessageResponse>
        </MessageContent>

        {message.result.presentation ? (
          <AnalystPresentationTable presentation={message.result.presentation} />
        ) : null}

        <ResponseMeta result={message.result} />

        {showFollowUps && message.result.response.followUpSuggestions.length ? (
          <div className="flex flex-wrap gap-1.5">
            {message.result.response.followUpSuggestions.map((suggestion) => (
              <Button
                key={suggestion}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onFollowUp(suggestion)}
                className="h-auto min-h-7 whitespace-normal rounded-full px-2.5 py-1 text-[10.5px] text-muted-foreground"
              >
                {suggestion}
              </Button>
            ))}
          </div>
        ) : null}
      </Message>
    );
  }

  return (
    <Message from={message.role} className={isUser ? "max-w-[88%]" : "max-w-full"}>
      <MessageContent
        className={cn(isUser && "bg-primary text-primary-foreground", !isUser && "w-full")}
      >
        <MessageResponse className="text-sm leading-7">{message.content}</MessageResponse>

        {message.result ? (
          <>
            <ResponseMeta result={message.result} />
            {showFollowUps && message.result.response.followUpSuggestions.length ? (
              <div className="flex flex-wrap gap-1.5">
                {message.result.response.followUpSuggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onFollowUp(suggestion)}
                    className="h-auto min-h-7 whitespace-normal rounded-full px-2.5 py-1 text-[10.5px] text-muted-foreground"
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </MessageContent>
    </Message>
  );
}

function AnalystPresentationTable({ presentation }: { presentation: AnalystTablePresentation }) {
  const hasBranch = presentation.columns.some((column) => column.key === "branch");
  const hasRank = presentation.columns.some((column) => column.key === "rank");
  const gridClass = hasBranch
    ? hasRank
      ? "min-w-[960px] grid-cols-[44px_minmax(240px,1.65fr)_repeat(5,minmax(120px,1fr))]"
      : "min-w-[980px] grid-cols-[minmax(220px,1.4fr)_minmax(210px,1.4fr)_repeat(4,minmax(130px,1fr))]"
    : "min-w-[760px] grid-cols-[minmax(190px,1.4fr)_repeat(4,minmax(130px,1fr))]";

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-white shadow-sm">
      {presentation.title ? (
        <div className="border-b border-border bg-secondary/20 px-4 py-3.5">
          <p className="text-sm font-bold text-foreground">{presentation.title}</p>
        </div>
      ) : null}

      <div
        className="max-h-[min(430px,52vh)] w-full overflow-auto overscroll-contain"
        dir="rtl"
        role="region"
        aria-label={presentation.title || "جدول النتائج"}
      >
        <div className={cn("grid w-full text-xs", gridClass)} role="table">
          <div className="sticky top-0 z-20 col-span-full grid grid-cols-subgrid bg-secondary shadow-[0_1px_0_0_var(--color-border)]" role="row">
            {presentation.columns.map((column) => (
              <div
                key={column.key}
                role="columnheader"
                className={cn(
                  "flex min-h-11 items-center whitespace-nowrap border-l border-border/60 px-3 font-bold text-muted-foreground last:border-l-0 sm:px-4",
                  column.align === "number" ? "justify-end" : "justify-start",
                  column.key === "rank" && "justify-center",
                )}
              >
                {column.label}
              </div>
            ))}
          </div>

          {presentation.rows.map((row, rowIndex) => (
            <div
              key={rowIndex}
              role="row"
              className="group col-span-full grid grid-cols-subgrid border-b border-border/60 bg-white last:border-b-0 even:bg-secondary/10 hover:bg-secondary/20"
            >
              {presentation.columns.map((column) => (
                <div
                  key={column.key}
                  role="cell"
                  dir={column.align === "number" ? "ltr" : undefined}
                  className={cn(
                    "flex min-h-12 items-center whitespace-nowrap border-l border-border/40 px-3 last:border-l-0 sm:px-4",
                    column.align === "number"
                      ? "num justify-end text-end font-semibold tabular-nums"
                      : "justify-start text-start",
                    column.key === "branch" && "font-bold text-foreground",
                    column.key === "rank" &&
                      "justify-center text-center font-medium text-muted-foreground",
                  )}
                >
                  {row[column.key] ?? "—"}
                </div>
              ))}
            </div>
          ))}
        </div>
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
