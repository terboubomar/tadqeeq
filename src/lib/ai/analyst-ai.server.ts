import type { StoredPeriod } from "@/lib/periods";

import { aiSupabaseHeaders, type AiServerAuth } from "./auth.server";

import { buildAnalystContext, resolveAnalystFacts } from "./analyst-context";
import {
  analystAiResponseSchema,
  type AnalystAiResponse,
  type AnalystChatResult,
  type AnalystHistoryMessage,
} from "./analyst-ai";
import {
  enforceAnalystNumericGrounding,
  userOnlyAnalystHistory,
} from "./analyst-grounding";
import { buildAnalystPresentation } from "./analyst-presentation";
import { selectAnalystFacts } from "./analyst-retrieval";
import { callTadqeeqAi } from "./gateway.server";
import { runWithAiUsageReservation } from "./usage.server";

const FEATURE = "analyst_chat";
const PROMPT_VERSION = "ask-tadqeeq-v4-intent-retrieval";
const DEFAULT_ANALYST_MODEL = "gpt-5.6-terra";

interface AskTadqeeqInput {
  periodId: string;
  question: string;
  currentRoute: string;
  history: AnalystHistoryMessage[];
}

async function fetchOwnedPeriods(
  input: AskTadqeeqInput,
  auth: AiServerAuth,
): Promise<{ current: StoredPeriod; periods: StoredPeriod[] }> {
  const url = new URL(auth.supabaseUrl + "/rest/v1/periods");
  url.searchParams.set("user_id", "eq." + auth.userId);
  url.searchParams.set("select", "*");
  url.searchParams.set("order", "period_end.desc.nullslast,created_at.desc");
  url.searchParams.set("limit", "100");

  const response = await fetch(url, {
    headers: aiSupabaseHeaders(auth),
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

function fallbackUngroundedResponse(): AnalystAiResponse {
  return {
    answerability: "not_available",
    answer:
      "لا توجد في سياق Tadqeeq الموثق لهذه الفترة أدلة كافية تسمح لي بالإجابة على هذا السؤال بدقة دون افتراضات إضافية.",
    usedFactIds: [],
    presentation: {
      type: "text",
      title: "",
      factIds: [],
    },
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
    "FACT_REGISTRY هو المصدر الوحيد المسموح للحقائق المالية والتشغيلية ومعرفة واجهات Tadqeeq.",
    "حقائق kind=app تشرح الشاشات، معنى كل صفحة، مصدرها، وحدودها. إذا قال المستخدم هذه الصفحة أو هنا، استخدم currentScreen=true وCURRENT_ROUTE لفهم المقصود.",
    "حقائق kind=invoice_check تمثل دفتر مطابقة الفاتورة، kind=daily تمثل الصفوف اليومية الفعلية، kind=breakdown/status تمثل تفصيل البنود وحالات الطلبات، وkind=history تمثل الفترات المحفوظة.",
    "لا تستخدم معرفتك العامة أو رسائل المحادثة السابقة كمصدر لرقم أو حقيقة تخص هذا التدقيق.",
    "CHAT_HISTORY يحتوي فقط رسائل المستخدم السابقة ومخصص لفهم الضمائر والمتابعة والسياق اللغوي.",
    "أي رقم تكتبه في answer يجب أن يكون موجوداً من حيث القيمة في إحدى الحقائق التي تضع معرفها داخل usedFactIds؛ لا تحسب أو تقرّب أو تستنتج رقماً جديداً.",
    "لا تقم بحساب نسبة أو فرق أو ترتيب أو مجموع جديد. استخدم فقط القيم والترتيبات والدلتا المحسوبة الموجودة في FACT_REGISTRY.",
    "لا تغيّر نتائج التدقيق أو التحمّلات أو حالة الاستثناء أو potentialRecovery.",
    "potentialRecovery مبلغ محتمل فقط وليس استرداداً مؤكداً.",
    "أي تعويض مكرر مشتبه به يبقى اشتباهاً يحتاج مراجعة، وليس خصماً خاطئاً مؤكداً.",
    "إذا كان السؤال يطلب سبباً ولم توجد حقيقة موثقة تدعم السبب، قل إن السبب غير متاح ولا تخمّن.",
    "إذا كان السؤال خارج البيانات المتاحة أو عن عقد/سياسة غير موجودة في FACT_REGISTRY، استخدم answerability=not_available.",
    "عند الإجابة grounded أو partial يجب إرجاع usedFactIds التي تدعم الإجابة مباشرة.",
    "اختر presentation.type حسب طبيعة السؤال: branch_table للفروع؛ exception_table للاستثناءات؛ comparison_table لمقارنة فترتين؛ invoice_table لمطابقة الفاتورة؛ daily_table للتقرير اليومي؛ breakdown_table لتفصيل البنود؛ history_table للفترات السابقة؛ وtext لباقي الحالات.",
    "في presentation.factIds أرسل فقط معرفات الحقائق التي يحتاجها العرض. عند branch_table يمكن إرسال حقيقة ranking المناسبة، وسيبني الخادم تفاصيل الصفوف من حقائق الفروع الموثقة.",
    "لا تكتب جدول Markdown أو تسرد كل صف داخل answer. اجعل answer خلاصة قصيرة، لأن الخادم سيبني الجدول من البيانات الحتمية.",
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
        items: { type: "string", pattern: "^F[0-9]{3,5}$" },
        maxItems: 12,
      },
      presentation: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "text",
              "branch_table",
              "exception_table",
              "comparison_table",
              "invoice_table",
              "daily_table",
              "breakdown_table",
              "history_table",
            ],
          },
          title: { type: "string", maxLength: 160 },
          factIds: {
            type: "array",
            items: { type: "string", pattern: "^F[0-9]{3,5}$" },
            maxItems: 40,
          },
        },
        required: ["type", "title", "factIds"],
        additionalProperties: false,
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
      "presentation",
      "limitations",
      "followUpSuggestions",
      "confidence",
    ],
    additionalProperties: false,
  };

  const retrievedFacts = selectAnalystFacts(context, input.question);

  const payload = {
    QUESTION: input.question,
    CHAT_HISTORY: userOnlyAnalystHistory(input.history),
    SCOPE: {
      platform: context.platform,
      currentRoute: context.currentRoute,
      period: context.period,
      hasPreviousPeriod: context.hasPreviousPeriod,
      coverage: context.coverage,
    },
    RETRIEVAL: {
      includedFacts: retrievedFacts.length,
      totalFacts: context.facts.length,
    },
    FACT_REGISTRY: retrievedFacts,
  };

  const { text, model } = await callTadqeeqAi({
    systemPrompt,
    userText: JSON.stringify(payload),
    schemaName: "ask_tadqeeq_answer",
    schema,
    maxOutputTokens: 2400,
    model:
      process.env["TADQEEQ_ANALYST_MODEL"]?.trim() ||
      DEFAULT_ANALYST_MODEL,
    reasoningEffort: "medium",
  });

  const parsed = analystAiResponseSchema.parse(JSON.parse(text) as unknown);
  const factsUsed = resolveAnalystFacts(context, parsed.usedFactIds);
  const validIds = factsUsed.map((fact) => fact.id);
  const validPresentationIds = resolveAnalystFacts(context, parsed.presentation.factIds).map(
    (fact) => fact.id,
  );
  const lostReferences =
    validIds.length !== parsed.usedFactIds.length ||
    validPresentationIds.length !== parsed.presentation.factIds.length;

  if (parsed.answerability !== "not_available" && validIds.length === 0) {
    return { response: fallbackUngroundedResponse(), model };
  }

  const normalizedResponse: AnalystAiResponse = {
    ...parsed,
    usedFactIds: validIds,
    presentation: {
      ...parsed.presentation,
      factIds: validPresentationIds,
    },
    ...(lostReferences
      ? {
          limitations: [
            ...parsed.limitations,
            "تم تجاهل مراجع أدلة غير موجودة في سجل الحقائق الموثق.",
          ].slice(0, 5),
          confidence: parsed.confidence === "high" ? "medium" : parsed.confidence,
        }
      : {}),
  };

  const groundedResponse = enforceAnalystNumericGrounding(
    normalizedResponse,
    factsUsed,
    fallbackUngroundedResponse(),
  );

  return {
    response: groundedResponse,
    model,
  };
}

export async function askTadqeeqOnServer(
  input: AskTadqeeqInput,
  auth: AiServerAuth,
): Promise<AnalystChatResult> {
  const { current, periods } = await fetchOwnedPeriods(input, auth);
  const context = buildAnalystContext(current, periods, input.currentRoute);
  const expectedModel =
    process.env["TADQEEQ_ANALYST_MODEL"]?.trim() || DEFAULT_ANALYST_MODEL;
  const { response, model } = await runWithAiUsageReservation(
    {
      accessToken: auth.accessToken,
      userId: auth.userId,
      feature: FEATURE,
      expectedModel,
      promptVersion: PROMPT_VERSION,
      periodId: input.periodId,
      exceptionId: null,
      supabaseUrl: auth.supabaseUrl,
      supabaseKey: auth.supabaseKey,
    },
    () => callAnalyst(input, context),
  );
  const factsUsed = resolveAnalystFacts(context, response.usedFactIds).map(
    ({ id, kind, label, displayValue }) => ({ id, kind, label, displayValue }),
  );
  const presentation = buildAnalystPresentation(context, response);

  return {
    response,
    factsUsed,
    presentation,
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
