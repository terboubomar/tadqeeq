const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-luna";

interface GatewayCallInput {
  systemPrompt: string;
  userText: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  model?: string;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

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
        max_output_tokens: input.maxOutputTokens ?? 1500,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: input.systemPrompt }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: input.userText }],
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

    return {
      text: extractOutputText(payload),
      model,
    };
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
