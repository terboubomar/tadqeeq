import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { callTadqeeqAi } from "./gateway.server";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env["OPENAI_API_KEY"];

function gatewayInput(maxOutputTokens = 1000) {
  return {
    systemPrompt: "system",
    userText: "user",
    schemaName: "test_schema",
    schema: {
      type: "object",
      properties: {
        answer: { type: "string" },
      },
      required: ["answer"],
      additionalProperties: false,
    },
    maxOutputTokens,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Tadqeeq AI gateway incomplete responses", () => {
  beforeEach(() => {
    process.env["OPENAI_API_KEY"] = "test-key";
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_KEY === undefined) {
      delete process.env["OPENAI_API_KEY"];
    } else {
      process.env["OPENAI_API_KEY"] = ORIGINAL_KEY;
    }
  });

  test("retries max_output_tokens once with a larger output budget", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let calls = 0;

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);

      if (calls === 1) {
        return jsonResponse({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: '{"answer":"truncated"}' }],
            },
          ],
        });
      }

      return jsonResponse({
        status: "completed",
        incomplete_details: null,
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: '{"answer":"ok"}' }],
          },
        ],
      });
    }) as typeof fetch;

    const result = await callTadqeeqAi(gatewayInput(1000));

    expect(calls).toBe(2);
    expect(bodies[0]?.["max_output_tokens"]).toBe(1000);
    expect(bodies[1]?.["max_output_tokens"]).toBe(2000);
    expect(result.text).toBe('{"answer":"ok"}');
  });

  test("throws a clear error when the retry is still truncated", async () => {
    let calls = 0;

    globalThis.fetch = (async () => {
      calls += 1;
      return jsonResponse({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: '{"answer":"truncated"}' }],
          },
        ],
      });
    }) as typeof fetch;

    await expect(callTadqeeqAi(gatewayInput(1200))).rejects.toThrow(
      "وصل رد Tadqeeq AI إلى الحد الأقصى لطول المخرجات حتى بعد إعادة المحاولة.",
    );
    expect(calls).toBe(2);
  });

  test("does not treat another incomplete reason as readable output", async () => {
    globalThis.fetch = (async () =>
      jsonResponse({
        status: "incomplete",
        incomplete_details: { reason: "content_filter" },
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: '{"answer":"partial"}' }],
          },
        ],
      })) as typeof fetch;

    await expect(callTadqeeqAi(gatewayInput())).rejects.toThrow(
      "لم يتمكن Tadqeeq AI من إكمال الرد.",
    );
  });
});
