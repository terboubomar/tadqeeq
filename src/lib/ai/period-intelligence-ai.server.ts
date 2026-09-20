import type { StoredPeriod } from "@/lib/periods";
import { buildPeriodComparison } from "@/lib/period-intelligence";

import { callTadqeeqAi } from "./gateway.server";
import {
  buildPeriodIntelligenceAiPacket,
  periodIntelligenceAiSchema,
  type PeriodIntelligenceAiExplanation,
  type PeriodIntelligenceAiResult,
} from "./period-intelligence-ai";

const FEATURE = "period_intelligence";
const PROMPT_VERSION = "period-intelligence-v1";
const DEFAULT_HOURLY_LIMIT = 30;

interface AnalyzePeriodIntelligenceInput {
  currentPeriodId: string;
  previousPeriodId: string;
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

async function fetchOwnedPeriod(
  periodId: string,
  accessToken: string,
  user: AuthenticatedUser,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<StoredPeriod> {
  const url = new URL(supabaseUrl + "/rest/v1/periods");
  url.searchParams.set("id", "eq." + periodId);
  url.searchParams.set("user_id", "eq." + user.id);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: "Bearer " + accessToken,
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
  input: AnalyzePeriodIntelligenceInput,
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
  input: AnalyzePeriodIntelligenceInput,
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
      period_id: input.currentPeriodId,
      exception_id: null,
    }),
  });

  if (!response.ok) {
    console.error("Failed to record Tadqeeq AI period-intelligence usage", response.status);
  }
}

async function callOpenAi(
  packet: ReturnType<typeof buildPeriodIntelligenceAiPacket>,
): Promise<{ explanation: PeriodIntelligenceAiExplanation; model: string }> {
  const systemPrompt = [
    "أنت Tadqeeq AI Analyst داخل نظام تدقيق مالي لمنصات التوصيل.",
    "أنت تفسّر مقارنة حتمية بين فترتين ولا تقوم بأي احتساب مالي جديد.",
    "الـ JSON المرسل إليك هو المصدر الوحيد المسموح استخدامه.",
    "كل current و previous و delta و relativeChangePct و deltaPercentagePoints محسوبة مسبقاً بواسطة Tadqeeq؛ لا تعيد حسابها ولا تستبدلها.",
    "ميّز بوضوح بين التغير النسبي بالنسبة المئوية والتغير بالنقاط المئوية.",
    "لا تنسب سبباً لتغير إلا إذا كان مدعوماً مباشرة بمقاييس الفروع أو الاستثناءات أو التحذيرات في الحزمة.",
    "إذا كان طول الفترتين أو عدد الفروع مختلفاً، اعتبر ذلك قيداً مهماً ولا تستنتج سبباً مؤكداً من القيم المطلقة.",
    "potentialRecovery هو استرداد محتمل فقط وليس مطالبة مؤكدة.",
    "لا تدّعي وجود خطأ مؤكد أو مخالفة عقدية دون دليل صريح في الحزمة.",
    "recommendedActions يجب أن تكون خطوات تحقق بشرية عملية، بدون اعتراض أو إغلاق تلقائي.",
    "اكتب بالعربية المهنية الواضحة لمدير مالي أو عمليات.",
    "لا تقدم نصيحة قانونية.",
  ].join("\n");

  const schema = {
    type: "object",
    properties: {
      executiveSummary: { type: "string" },
      keyChanges: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 6,
      },
      riskSignals: {
        type: "array",
        items: { type: "string" },
        maxItems: 6,
      },
      improvements: {
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
        maxItems: 5,
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
      },
    },
    required: [
      "executiveSummary",
      "keyChanges",
      "riskSignals",
      "improvements",
      "recommendedActions",
      "limitations",
      "confidence",
    ],
    additionalProperties: false,
  };

  const { text, model } = await callTadqeeqAi({
    systemPrompt,
    userText:
      "فسّر مقارنة الفترتين التالية اعتماداً على المقاييس المحسوبة فقط:\n" +
      JSON.stringify(packet),
    schemaName: "tadqeeq_period_intelligence",
    schema,
    maxOutputTokens: 1600,
  });

  const parsed = JSON.parse(text) as unknown;
  return {
    explanation: periodIntelligenceAiSchema.parse(parsed),
    model,
  };
}

export async function analyzePeriodIntelligenceOnServer(
  input: AnalyzePeriodIntelligenceInput,
): Promise<PeriodIntelligenceAiResult> {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");

  const user = await authenticateUser(input.accessToken, supabaseUrl, supabaseKey);
  await enforceRateLimit(input, user, supabaseUrl, supabaseKey);

  const [current, previous] = await Promise.all([
    fetchOwnedPeriod(
      input.currentPeriodId,
      input.accessToken,
      user,
      supabaseUrl,
      supabaseKey,
    ),
    fetchOwnedPeriod(
      input.previousPeriodId,
      input.accessToken,
      user,
      supabaseUrl,
      supabaseKey,
    ),
  ]);

  const comparison = buildPeriodComparison(current, previous);
  const packet = buildPeriodIntelligenceAiPacket(comparison);
  const { explanation, model } = await callOpenAi(packet);

  await recordUsage(input, user, model, supabaseUrl, supabaseKey);

  return {
    explanation,
    model,
    promptVersion: PROMPT_VERSION,
  };
}
