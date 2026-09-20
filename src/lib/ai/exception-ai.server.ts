import type { StoredPeriod } from "@/lib/periods";
import {
  buildExceptionEvidence,
  buildPeriodExceptions,
} from "@/lib/exceptions";

import {
  buildExceptionAiPacket,
  exceptionAiExplanationSchema,
  type ExceptionAiExplanation,
  type ExceptionAiResult,
} from "./exception-ai";

const FEATURE = "exception_explainer";
const PROMPT_VERSION = "exception-explainer-v1";
const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_HOURLY_LIMIT = 30;

interface ExplainExceptionInput {
  periodId: string;
  exceptionId: string;
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
  input: ExplainExceptionInput,
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
  input: ExplainExceptionInput,
  user: AuthenticatedUser,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<void> {
  const configured = Number.parseInt(
    process.env["TADQEEQ_AI_MAX_REQUESTS_PER_HOUR"] ?? "",
    10,
  );
  const limit = Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_HOURLY_LIMIT;
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
  input: ExplainExceptionInput,
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
      exception_id: input.exceptionId,
    }),
  });

  if (!response.ok) {
    // AI explanation already succeeded. Usage logging must not hide the result.
    console.error("Failed to record Tadqeeq AI usage", response.status);
  }
}

function extractOutputText(response: OpenAiResponse): string {
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
      if (content.type === "refusal" && content.refusal) {
        throw new Error("تعذّر إنشاء الشرح لهذا الاستثناء.");
      }
    }
  }
  throw new Error("لم يرجع نموذج الذكاء الاصطناعي شرحاً قابلاً للقراءة.");
}

async function callOpenAi(
  packet: ReturnType<typeof buildExceptionAiPacket>,
): Promise<{ explanation: ExceptionAiExplanation; model: string }> {
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const model = process.env["TADQEEQ_AI_MODEL"]?.trim() || DEFAULT_MODEL;

  const systemPrompt = [
    "أنت Tadqeeq AI Analyst داخل نظام تدقيق مالي لمنصات التوصيل.",
    "أنت طبقة شرح فقط، ولست محرك المحاسبة أو مصدر الحقيقة.",
    "الـ JSON المرسل إليك هو المصدر الوحيد المسموح لك استخدامه.",
    "لا تعيد احتساب الأرقام من افتراضات خارج البيانات ولا تخترع أي رقم أو عقد أو سبب.",
    "لا تغيّر نتيجة التدقيق ولا تدّعي أن بنداً خطأ بشكل مؤكد إذا كانت البيانات تقول يحتاج مراجعة.",
    "إذا كان potentialRecovery أكبر من صفر، صفه دائماً كمبلغ استرداد محتمل وليس مؤكداً.",
    "إذا كانت الأدلة غير كافية، اذكر ذلك صراحة في limitations وخفّض confidence.",
    "اكتب بالعربية المهنية الواضحة لمدير مالي أو عمليات، وباختصار مفيد.",
    "اجعل nextSteps إجراءات تحقق عملية، ولا تقترح إغلاق الاستثناء أو إرسال مطالبة كحقيقة قبل المراجعة البشرية.",
    "لا تقدم نصيحة قانونية.",
  ].join("\n");

  const schema = {
    type: "object",
    properties: {
      summary: { type: "string" },
      whyItMatters: { type: "string" },
      financialInterpretation: { type: "string" },
      evidence: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 6,
      },
      nextSteps: {
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
      "summary",
      "whyItMatters",
      "financialInterpretation",
      "evidence",
      "nextSteps",
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
        max_output_tokens: 1200,
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
                  "اشرح الاستثناء التالي اعتماداً على البيانات المنظمة فقط:\n" +
                  JSON.stringify(packet),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "tadqeeq_exception_explanation",
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
      explanation: exceptionAiExplanationSchema.parse(parsed),
      model,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("استغرق Tadqeeq AI وقتاً أطول من المتوقع. حاول مرة أخرى.");
    }
    if (error instanceof Error) throw error;
    throw new Error("تعذّر إنشاء شرح الذكاء الاصطناعي.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function explainExceptionOnServer(
  input: ExplainExceptionInput,
): Promise<ExceptionAiResult> {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");

  const user = await authenticateUser(input.accessToken, supabaseUrl, supabaseKey);
  await enforceRateLimit(input, user, supabaseUrl, supabaseKey);

  const period = await fetchOwnedPeriod(input, user, supabaseUrl, supabaseKey);
  const item = buildPeriodExceptions(period).find(
    (candidate) => candidate.id === input.exceptionId,
  );
  if (!item) {
    throw new Error(
      "هذا الاستثناء لم يعد موجوداً في نتيجة التدقيق الحالية. حدّث الصفحة وحاول مرة أخرى.",
    );
  }

  const evidence = buildExceptionEvidence(period, item);
  const packet = buildExceptionAiPacket(item, evidence);
  const { explanation, model } = await callOpenAi(packet);

  await recordUsage(input, user, model, supabaseUrl, supabaseKey);

  return {
    explanation,
    model,
    promptVersion: PROMPT_VERSION,
  };
}
