import type { StoredPeriod } from "@/lib/periods";

import { aiSupabaseHeaders, type AiServerAuth } from "./auth.server";
import { buildPeriodComparison } from "@/lib/period-intelligence";

import { callTadqeeqAi } from "./gateway.server";
import { runWithAiUsageReservation } from "./usage.server";
import {
  buildPeriodIntelligenceAiPacket,
  periodIntelligenceAiSchema,
  type PeriodIntelligenceAiExplanation,
  type PeriodIntelligenceAiResult,
} from "./period-intelligence-ai";

const FEATURE = "period_intelligence";
const PROMPT_VERSION = "period-intelligence-v1";
const DEFAULT_MODEL = "gpt-5.6-luna";

interface AnalyzePeriodIntelligenceInput {
  currentPeriodId: string;
  previousPeriodId: string;
}

async function fetchOwnedPeriod(
  periodId: string,
  auth: AiServerAuth,
): Promise<StoredPeriod> {
  const url = new URL(auth.supabaseUrl + "/rest/v1/periods");
  url.searchParams.set("id", "eq." + periodId);
  url.searchParams.set("user_id", "eq." + auth.userId);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: aiSupabaseHeaders(auth),
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
  auth: AiServerAuth,
): Promise<PeriodIntelligenceAiResult> {
  const [current, previous] = await Promise.all([
    fetchOwnedPeriod(input.currentPeriodId, auth),
    fetchOwnedPeriod(input.previousPeriodId, auth),
  ]);

  const comparison = buildPeriodComparison(current, previous);
  const packet = buildPeriodIntelligenceAiPacket(comparison);
  const expectedModel =
    process.env["TADQEEQ_AI_MODEL"]?.trim() || DEFAULT_MODEL;
  const { explanation, model } = await runWithAiUsageReservation(
    {
      accessToken: auth.accessToken,
      userId: auth.userId,
      feature: FEATURE,
      expectedModel,
      promptVersion: PROMPT_VERSION,
      periodId: input.currentPeriodId,
      exceptionId: null,
      supabaseUrl: auth.supabaseUrl,
      supabaseKey: auth.supabaseKey,
    },
    () => callOpenAi(packet),
  );

  return {
    explanation,
    model,
    promptVersion: PROMPT_VERSION,
  };
}
