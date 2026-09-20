import type { StoredPeriod } from "@/lib/periods";

import { buildPeriodExceptions } from "@/lib/exceptions";

import {
  buildPeriodSummaryAiPacket,
  periodSummaryAiExplanationSchema,
  type PeriodSummaryAiExplanation,
  type PeriodSummaryAiResult,
} from "./period-summary-ai";

const FEATURE = "period_summary";
const PROMPT_VERSION = "period-summary-v1";
const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_HOURLY_LIMIT = 30;

interface SummarizePeriodInput {
  periodId: string;
  accessToken: string;
}

interface AuthenticatedUser {
  id: string;
}

interface OpenAiResponse {
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      name === "OPENAI_API_KEY"
        ? "خدمة Tadqeeq AI غير مفعّلة بعد. أضف OPENAI_API_KEY في أسرار بيئة النشر."
        : "إعدادات الخادم غير مكتملة لخدمة Tadqeeq AI.",
    );
  }
  return value;
}

async function authenticateUser(
  accessToken: string,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<AuthenticatedUser> {
  const response = await fetch(supabaseUrl + "/auth/v1/user", {
    headers: {
      apikey: supabaseKey,
      Authorization: "Bearer " + accessToken,
    },
  });

  if (!response.ok) {
    throw new Error("انتهت جلسة المستخدم. سجّل الدخول مرة أخرى قبل استخدام Tadqeeq AI.");
  }

  const user = (await response.json()) as Partial<AuthenticatedUser>;
  if (!user.id) throw new Error("تعذّر التحقق من هوية المستخدم.");
  return { id: user.id };
}

async function fetchOwnedPeriod(
  input: SummarizePeriodInput,
  user: AuthenticatedUser,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<StoredPeriod> {
  const url = new URL(supabaseUrl + "/rest/v1/periods");
  url.searchParams.set("id", "eq." + input.periodId);
  url.searchParams.set("user_id", "eq." + user.id);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: "Bearer " + input.accessToken,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("تعذّر قراءة فترة التدقيق من الخادم.");
  }

  const rows = (await response.json()) as StoredPeriod[];
  const period = rows[0];
  if (!period) {
    throw new Error("فترة التدقيق غير موجودة أو لا تملك صلاحية الوصول إليها.");
  }
  return period;
}

async function enforceRateLimit(
  input: SummarizePeriodInput,
  user: AuthenticatedUser,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<void> {
  const configured = Number.parseInt(
    process.env["TADQEEQ_AI_MAX_REQUESTS_PER_HOUR"] ?? "",
    10,
  );
  const limit =
    Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_HOURLY_LIMIT;
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const url = new URL(supabaseUrl + "/rest/v1/ai_usage");
  url.searchParams.set("user_id", "eq." + user.id);
  url.searchParams.set("feature", "eq." + FEATURE);
  url.searchParams.set("created_at", "gte." + since);
  url.searchParams.set("select", "id");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: "Bearer " + input.accessToken,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("تعذّر التحقق من حد استخدام Tadqeeq AI.");
  }

  const rows = (await response.json()) as Array<{ id: string }>;
  if (rows.length >= limit) {
    throw new Error(
      "تم الوصول إلى حد استخدام Tadqeeq AI لهذه الساعة. جرّب مرة أخرى لاحقاً.",
    );
  }
}

async function recordUsage(
  input: SummarizePeriodInput,
  user: AuthenticatedUser,
  model: string,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<void> {
  const response = await fetch(supabaseUrl + "/rest/v1/ai_usage", {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: "Bearer " + input.accessToken,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      user_id: user.id,
      feature: FEATURE,
      model,
      prompt_version: PROMPT_VERSION,
      period_id: input.periodId,
      exception_id: null,
    }),
  });

  if (!response.ok) {
    console.error("Failed to record Tadqeeq AI period-summary usage", response.status);
  }
}

function extractOutputText(response: OpenAiResponse): string {
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
      if (content.type === "refusal" && content.refusal) {
        throw new Error("تعذّر إنشاء الملخص الذكي لهذه الفترة.");
      }
    }
  }
  throw new Error("لم يرجع نموذج الذكاء الاصطناعي ملخصاً قابلاً للقراءة.");
}

async function callOpenAi(
  packet: ReturnType<typeof buildPeriodSummaryAiPacket>,
): Promise<{ explanation: PeriodSummaryAiExplanation; model: string }> {
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const model = process.env["TADQEEQ_AI_MODEL"]?.trim() || DEFAULT_MODEL;

  const systemPrompt = [
    "أنت Tadqeeq AI Analyst داخل نظام تدقيق مالي لمنصات التوصيل.",
    "أنت طبقة تفسير إداري فقط. محرك Tadqeeq الحتمي هو مصدر الحقيقة للأرقام والاستثناءات.",
    "الـ JSON المرسل إليك هو المصدر الوحيد المسموح لك استخدامه.",
    "لا تعيد احتساب الأرقام ولا تخترع نسبة أو سبباً أو عقداً أو حدثاً غير موجود في البيانات.",
    "أي مبلغ potentialRecovery هو استرداد محتمل فقط وليس مطالبة مؤكدة.",
    "لا تصف استثناءً بأنه خطأ مؤكد إذا كانت البيانات لا تثبت ذلك.",
    "لا تدّعي وجود مقارنة زمنية أو اتجاه شهري لأن الحزمة تخص فترة واحدة فقط.",
    "ركّز على أهم التعرضات المالية والاستثناءات والفروع الواردة في الحزمة، بدون تكرار كل الأرقام.",
    "اجعل recommendedActions خطوات مراجعة بشرية عملية، ولا تقترح إرسال اعتراض تلقائياً أو إغلاق استثناء.",
    "إذا كانت الأدلة أو التغطية محدودة فاذكر ذلك في limitations وخفّض confidence.",
    "اكتب بالعربية المهنية الواضحة لمدير مالي أو عمليات.",
    "لا تقدم نصيحة قانونية.",
  ].join("\n");

  const schema = {
    type: "object",
    properties: {
      executiveSummary: { type: "string" },
      financialReadout: { type: "string" },
      attentionItems: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 6,
      },
      positiveSignals: {
        type: "array",
        items: { type: "string" },
        maxItems: 5,
      },
      recommendedActions: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 5,
      },
      limitations: {
        type: "array",
        items: { type: "string" },
        maxItems: 4,
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
      },
    },
    required: [
      "executiveSummary",
      "financialReadout",
      "attentionItems",
      "positiveSignals",
      "recommendedActions",
      "limitations",
      "confidence",
    ],
    additionalProperties: false,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 1500,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "أنشئ ملخصاً تنفيذياً للفترة اعتماداً على بيانات Tadqeeq المنظمة فقط:\n" +
                  JSON.stringify(packet),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "tadqeeq_period_summary",
            strict: true,
            schema,
          },
        },
      }),
    });

    const payload = (await response.json()) as OpenAiResponse;
    if (!response.ok) {
      console.error("OpenAI Responses API error", response.status, payload.error?.message);
      throw new Error("تعذّر الاتصال بخدمة Tadqeeq AI حالياً.");
    }

    const parsed = JSON.parse(extractOutputText(payload)) as unknown;
    return {
      explanation: periodSummaryAiExplanationSchema.parse(parsed),
      model,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("استغرق Tadqeeq AI وقتاً أطول من المتوقع. حاول مرة أخرى.");
    }
    if (error instanceof Error) throw error;
    throw new Error("تعذّر إنشاء ملخص Tadqeeq AI.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function summarizePeriodOnServer(
  input: SummarizePeriodInput,
): Promise<PeriodSummaryAiResult> {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");

  const user = await authenticateUser(input.accessToken, supabaseUrl, supabaseKey);
  await enforceRateLimit(input, user, supabaseUrl, supabaseKey);

  const period = await fetchOwnedPeriod(input, user, supabaseUrl, supabaseKey);
  const exceptions = buildPeriodExceptions(period);
  const packet = buildPeriodSummaryAiPacket(period, exceptions);
  const { explanation, model } = await callOpenAi(packet);

  await recordUsage(input, user, model, supabaseUrl, supabaseKey);

  return {
    explanation,
    model,
    promptVersion: PROMPT_VERSION,
  };
}
