import type { StoredPeriod } from "@/lib/periods";

import { buildPeriodExceptions } from "@/lib/exceptions";

import { callTadqeeqAi } from "./gateway.server";
import { runWithAiUsageReservation } from "./usage.server";

import {
  buildPeriodSummaryAiPacket,
  periodSummaryAiExplanationSchema,
  type PeriodSummaryAiExplanation,
  type PeriodSummaryAiResult,
} from "./period-summary-ai";

const FEATURE = "period_summary";
const PROMPT_VERSION = "period-summary-v1";
const DEFAULT_MODEL = "gpt-5.6-luna";

interface SummarizePeriodInput {
  periodId: string;
  accessToken: string;
}

interface AuthenticatedUser {
  id: string;
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

async function callOpenAi(
  packet: ReturnType<typeof buildPeriodSummaryAiPacket>,
): Promise<{ explanation: PeriodSummaryAiExplanation; model: string }> {


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

  const { text, model } = await callTadqeeqAi({
    systemPrompt,
    userText:
      "أنشئ ملخصاً تنفيذياً للفترة اعتماداً على بيانات Tadqeeq المنظمة فقط:\n" +
      JSON.stringify(packet),
    schemaName: "tadqeeq_period_summary",
    schema,
  });

  const parsed = JSON.parse(text) as unknown;
  return {
    explanation: periodSummaryAiExplanationSchema.parse(parsed),
    model,
  };
}

export async function summarizePeriodOnServer(
  input: SummarizePeriodInput,
): Promise<PeriodSummaryAiResult> {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");

  const user = await authenticateUser(input.accessToken, supabaseUrl, supabaseKey);

  const period = await fetchOwnedPeriod(input, user, supabaseUrl, supabaseKey);
  const exceptions = buildPeriodExceptions(period);
  const packet = buildPeriodSummaryAiPacket(period, exceptions);
  const expectedModel =
    process.env["TADQEEQ_AI_MODEL"]?.trim() || DEFAULT_MODEL;
  const { explanation, model } = await runWithAiUsageReservation(
    {
      accessToken: input.accessToken,
      userId: user.id,
      feature: FEATURE,
      expectedModel,
      promptVersion: PROMPT_VERSION,
      periodId: input.periodId,
      exceptionId: null,
      supabaseUrl,
      supabaseKey,
    },
    () => callOpenAi(packet),
  );

  return {
    explanation,
    model,
    promptVersion: PROMPT_VERSION,
  };
}
