import type { StoredPeriod } from "@/lib/periods";

import {
  buildAnalystContext,
  resolveAnalystFacts,
} from "./analyst-context";
import {
  analystAiResponseSchema,
  type AnalystAiResponse,
  type AnalystChatResult,
  type AnalystHistoryMessage,
} from "./analyst-ai";
import { callTadqeeqAi } from "./gateway.server";

const FEATURE = "analyst_chat";
const PROMPT_VERSION = "ask-tadqeeq-v1";
const DEFAULT_HOURLY_LIMIT = 30;

interface AskTadqeeqInput {
  periodId: string;
  question: string;
  history: AnalystHistoryMessage[];
  accessToken: string;
}

interface AuthenticatedUser {
  id: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error("إعدادات الخادم غير مكتملة لخدمة Tadqeeq AI.");
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

async function fetchOwnedPeriods(
  input: AskTadqeeqInput,
  user: AuthenticatedUser,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<{ current: StoredPeriod; periods: StoredPeriod[] }> {
  const url = new URL(supabaseUrl + "/rest/v1/periods");
  url.searchParams.set("user_id", "eq." + user.id);
  url.searchParams.set("select", "*");
  url.searchParams.set("order", "period_end.desc.nullslast,created_at.desc");
  url.searchParams.set("limit", "100");

  const response = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: "Bearer " + input.accessToken,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("تعذّر قراءة فترات التدقيق من الخادم.");
  }

  const periods = (await response.json()) as StoredPeriod[];
  const current = periods.find((period) => period.id === input.periodId);
  if (!current) {
    throw new Error("فترة التدقيق غير موجودة أو لا تملك صلاحية الوصول إليها.");
  }
  return { current, periods };
}

async function enforceRateLimit(
  input: AskTadqeeqInput,
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
  input: AskTadqeeqInput,
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
    console.error("Failed to record Ask Tadqeeq usage", response.status);
  }
}

function fallbackUngroundedResponse(): AnalystAiResponse {
  return {
    answerability: "not_available",
    answer:
      "لا توجد في سياق Tadqeeq الموثق لهذه الفترة أدلة كافية تسمح لي بالإجابة على هذا السؤال بدقة دون افتراضات إضافية.",
    usedFactIds: [],
    limitations: [
      "لم أتمكن من ربط الإجابة بحقيقة موثقة من سجل Tadqeeq الحالي، لذلك لم يتم تقديم تقدير أو رقم بديل.",
    ],
    followUpSuggestions: [
      "ما أهم الاستثناءات المفتوحة في هذه الفترة؟",
      "أي الفروع لديها أعلى تكلفة منصة؟",
      "كيف تغيّرت المبيعات والتكلفة عن الفترة السابقة؟",
    ],
    confidence: "low",
  };
}

async function callAnalyst(
  input: AskTadqeeqInput,
  context: ReturnType<typeof buildAnalystContext>,
): Promise<{ response: AnalystAiResponse; model: string }> {
  const systemPrompt = [
    "أنت Ask Tadqeeq، محلل مساعد داخل نظام تدقيق مالي لمنصات التوصيل.",
    "وظيفتك شرح واسترجاع النتائج التي حسبها Tadqeeq مسبقاً، وليس إنشاء نتيجة محاسبية جديدة.",
    "FACT_REGISTRY هو المصدر الوحيد المسموح للحقائق المالية والتشغيلية.",
    "لا تستخدم معرفتك العامة أو رسائل المحادثة السابقة كمصدر لرقم أو حقيقة تخص هذا التدقيق.",
    "CHAT_HISTORY مخصص فقط لفهم الضمائر والمتابعة والسياق اللغوي.",
    "لا تقم بحساب نسبة أو فرق أو ترتيب أو مجموع جديد. استخدم فقط القيم والترتيبات والدلتا المحسوبة الموجودة في FACT_REGISTRY.",
    "لا تغيّر نتائج التدقيق أو التحمّلات أو حالة الاستثناء أو potentialRecovery.",
    "potentialRecovery مبلغ محتمل فقط وليس استرداداً مؤكداً.",
    "أي تعويض مكرر مشتبه به يبقى اشتباهاً يحتاج مراجعة، وليس خصماً خاطئاً مؤكداً.",
    "إذا كان السؤال يطلب سبباً ولم توجد حقيقة موثقة تدعم السبب، قل إن السبب غير متاح ولا تخمّن.",
    "إذا كان السؤال خارج البيانات المتاحة أو عن عقد/سياسة غير موجودة في FACT_REGISTRY، استخدم answerability=not_available.",
    "عند الإجابة grounded أو partial يجب إرجاع usedFactIds التي تدعم الإجابة مباشرة.",
    "لا تذكر Fact IDs داخل نص answer؛ الواجهة ستعرض الأدلة بشكل منفصل.",
    "اكتب بالعربية المهنية الواضحة، ويمكنك فهم السؤال بالإنجليزية أو العربية.",
    "لا تقدم نصيحة قانونية ولا ترسل اعتراضاً أو تعدّل أي سجل.",
  ].join("\n");

  const schema = {
    type: "object",
    properties: {
      answerability: {
        type: "string",
        enum: ["grounded", "partial", "not_available"],
      },
      answer: { type: "string" },
      usedFactIds: {
        type: "array",
        items: { type: "string", pattern: "^F[0-9]{3}$" },
        maxItems: 12,
      },
      limitations: {
        type: "array",
        items: { type: "string" },
        maxItems: 5,
      },
      followUpSuggestions: {
        type: "array",
        items: { type: "string" },
        maxItems: 3,
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
      },
    },
    required: [
      "answerability",
      "answer",
      "usedFactIds",
      "limitations",
      "followUpSuggestions",
      "confidence",
    ],
    additionalProperties: false,
  };

  const payload = {
    QUESTION: input.question,
    CHAT_HISTORY: input.history.slice(-8),
    SCOPE: {
      platform: context.platform,
      period: context.period,
      hasPreviousPeriod: context.hasPreviousPeriod,
      coverage: context.coverage,
    },
    FACT_REGISTRY: context.facts,
  };

  const { text, model } = await callTadqeeqAi({
    systemPrompt,
    userText: JSON.stringify(payload),
    schemaName: "ask_tadqeeq_answer",
    schema,
    maxOutputTokens: 2000,
  });

  const parsed = analystAiResponseSchema.parse(JSON.parse(text) as unknown);
  const factsUsed = resolveAnalystFacts(context, parsed.usedFactIds);
  const validIds = factsUsed.map((fact) => fact.id);
  const lostReferences = validIds.length !== parsed.usedFactIds.length;

  if (parsed.answerability !== "not_available" && validIds.length === 0) {
    return { response: fallbackUngroundedResponse(), model };
  }

  return {
    response: {
      ...parsed,
      usedFactIds: validIds,
      ...(lostReferences
        ? {
            limitations: [
              ...parsed.limitations,
              "تم تجاهل مراجع أدلة غير موجودة في سجل الحقائق الموثق.",
            ].slice(0, 5),
            confidence: parsed.confidence === "high" ? "medium" : parsed.confidence,
          }
        : {}),
    },
    model,
  };
}

export async function askTadqeeqOnServer(
  input: AskTadqeeqInput,
): Promise<AnalystChatResult> {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");

  const user = await authenticateUser(input.accessToken, supabaseUrl, supabaseKey);
  await enforceRateLimit(input, user, supabaseUrl, supabaseKey);

  const { current, periods } = await fetchOwnedPeriods(
    input,
    user,
    supabaseUrl,
    supabaseKey,
  );
  const context = buildAnalystContext(current, periods);
  const { response, model } = await callAnalyst(input, context);
  const factsUsed = resolveAnalystFacts(context, response.usedFactIds);

  await recordUsage(input, user, model, supabaseUrl, supabaseKey);

  return {
    response,
    factsUsed,
    model,
    promptVersion: PROMPT_VERSION,
    scope: {
      platform: context.platform,
      start: context.period.start,
      end: context.period.end,
      hasPreviousPeriod: context.hasPreviousPeriod,
    },
  };
}
