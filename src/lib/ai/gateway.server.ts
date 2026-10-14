const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_MAX_OUTPUT_TOKENS = 1500;
const REQUEST_TIMEOUT_MS = 30_000;

interface GatewayCallInput {
  systemPrompt: string;
  userText: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  model?: string;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  imageDataUrls?: string[];
}

interface OpenAiResponse {
  status?: "completed" | "failed" | "in_progress" | "cancelled" | "queued" | "incomplete";
  incomplete_details?: {
    reason?: string;
  } | null;
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

function extractOutputText(response: OpenAiResponse): string {
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
      if (content.type === "refusal" && content.refusal) {
        throw new Error("تعذّر إنشاء تحليل Tadqeeq AI لهذا الطلب.");
      }
    }
  }
  throw new Error("لم يرجع نموذج الذكاء الاصطناعي نتيجة قابلة للقراءة.");
}

function nextOutputTokenLimit(current: number): number {
  return Math.max(current + 1000, current * 2);
}

async function requestOpenAi(
  input: GatewayCallInput,
  apiKey: string,
  model: string,
  maxOutputTokens: number,
): Promise<OpenAiResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: input.reasoningEffort ?? "low" },
        max_output_tokens: maxOutputTokens,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: input.systemPrompt }],
          },
          {
            role: "user",
            content: [
              { type: "input_text", text: input.userText },
              ...(input.imageDataUrls ?? []).map((url) => ({
                type: "input_image",
                image_url: url,
                detail: "high",
              })),
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: input.schemaName,
            strict: true,
            schema: input.schema,
          },
        },
      }),
    });

    const payload = (await response.json()) as OpenAiResponse;
    if (!response.ok) {
      console.error("OpenAI Responses API error", response.status, payload.error?.message);
      if (response.status === 429) {
        throw new Error("تم الوصول إلى حد استخدام خدمة Tadqeeq AI. حاول مرة أخرى لاحقاً.");
      }
      throw new Error("تعذّر الاتصال بخدمة Tadqeeq AI حالياً.");
    }

    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("استغرق Tadqeeq AI وقتاً أطول من المتوقع. حاول مرة أخرى.");
    }
    if (error instanceof Error) throw error;
    throw new Error("تعذّر إنشاء تحليل Tadqeeq AI.");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Central server-only Tadqeeq AI transport.
 *
 * Uses the OpenAI Responses API directly. This intentionally avoids the
 * Lovable AI Gateway so Tadqeeq AI usage is billed only through the configured
 * OpenAI API account and never consumes Lovable AI credits.
 */
export async function callTadqeeqAi(
  input: GatewayCallInput,
): Promise<{ text: string; model: string }> {
  const apiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (!apiKey) {
    throw new Error(
      "خدمة Tadqeeq AI غير مفعّلة بعد. أضف OPENAI_API_KEY في أسرار بيئة النشر.",
    );
  }

  const model =
    input.model?.trim() ||
    process.env["TADQEEQ_AI_MODEL"]?.trim() ||
    DEFAULT_MODEL;
  const initialLimit = input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

  const first = await requestOpenAi(input, apiKey, model, initialLimit);

  if (
    first.status === "incomplete" &&
    first.incomplete_details?.reason === "max_output_tokens"
  ) {
    const retryLimit = nextOutputTokenLimit(initialLimit);
    const retry = await requestOpenAi(input, apiKey, model, retryLimit);

    if (
      retry.status === "incomplete" &&
      retry.incomplete_details?.reason === "max_output_tokens"
    ) {
      throw new Error(
        "وصل رد Tadqeeq AI إلى الحد الأقصى لطول المخرجات حتى بعد إعادة المحاولة. جرّب سؤالاً أكثر تحديداً.",
      );
    }

    if (retry.status === "incomplete") {
      throw new Error(
        "لم يتمكن Tadqeeq AI من إكمال الرد. حاول مرة أخرى أو اجعل السؤال أكثر تحديداً.",
      );
    }

    return {
      text: extractOutputText(retry),
      model,
    };
  }

  if (first.status === "incomplete") {
    throw new Error(
      "لم يتمكن Tadqeeq AI من إكمال الرد. حاول مرة أخرى أو اجعل السؤال أكثر تحديداً.",
    );
  }

  return {
    text: extractOutputText(first),
    model,
  };
}
