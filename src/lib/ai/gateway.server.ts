const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
const DEFAULT_MODEL = "openai/gpt-6-astra";

interface GatewayCallInput {
  systemPrompt: string;
  userText: string;
  schemaName: string;
  schema: Record<string, unknown>;
}

/**
 * Calls the Lovable AI Gateway Responses API with streaming (required for
 * reasoning models) and returns the final structured JSON text.
 */
export async function callTadqeeqAi(
  input: GatewayCallInput,
): Promise<{ text: string; model: string }> {
  const apiKey = process.env["LOVABLE_API_KEY"]?.trim();
  if (!apiKey) {
    throw new Error("خدمة Tadqeeq AI غير مفعّلة بعد. تواصل مع الدعم لتفعيلها.");
  }
  const model = process.env["TADQEEQ_AI_MODEL"]?.trim() || DEFAULT_MODEL;

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model,
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: [{ type: "input_text", text: input.systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: input.userText }] },
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

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    console.error("Lovable AI Gateway error", response.status, detail.slice(0, 500));
    if (response.status === 429) {
      throw new Error("ضغط مرتفع على خدمة Tadqeeq AI. حاول بعد قليل.");
    }
    if (response.status === 402) {
      throw new Error("رصيد الذكاء الاصطناعي غير كافٍ. أضف رصيداً لمتابعة استخدام Tadqeeq AI.");
    }
    throw new Error("تعذّر الاتصال بخدمة Tadqeeq AI حالياً.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let refused = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const event = JSON.parse(payload) as {
            type?: string;
            delta?: string;
            refusal?: string;
          };
          if (event.type === "response.output_text.delta" && event.delta) {
            text += event.delta;
          } else if (event.type === "response.refusal.delta") {
            refused = true;
          }
        } catch {
          // ignore keep-alive / non-JSON frames
        }
      }
    }
  }

  if (refused || !text.trim()) {
    throw new Error("لم يرجع نموذج الذكاء الاصطناعي نتيجة قابلة للقراءة.");
  }

  return { text, model };
}
