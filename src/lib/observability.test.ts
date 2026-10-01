import { afterEach, describe, expect, test } from "bun:test";

import { ParseError } from "./analysis/parse";
import { UnsupportedFormatError } from "./analysis/formats/types";
import { classifyError, logEvent, redactLogFields, setLogSink, TadqeeqError } from "./observability";
import { PublicOriginConfigError } from "./public-origin.server";
import { handleEvidenceMediaRequest } from "./telegram-evidence-media.server";

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

function capture(): Array<Record<string, unknown>> {
  const lines: Array<Record<string, unknown>> = [];
  restore = setLogSink((line) => lines.push(JSON.parse(line) as Record<string, unknown>));
  return lines;
}

describe("error categories", () => {
  test("each failure type is told apart", () => {
    expect(classifyError(new PublicOriginConfigError("x"))).toBe("configuration");
    expect(classifyError(new ParseError("Amount is not a number", "abc"))).toBe("financial_validation");
    expect(
      classifyError(
        new UnsupportedFormatError({ platform: "hungerstation", source: "orders", formatId: "hs-orders", missing: ["Order ID"] }),
      ),
    ).toBe("data_format");
    expect(classifyError(new Error("ليس لديك صلاحية لتنفيذ هذا الإجراء."))).toBe("authorization");
    expect(classifyError(new TypeError("fetch failed"))).toBe("external_provider");
    expect(classifyError(new TadqeeqError("temporary", "try again"))).toBe("temporary");
    expect(classifyError("weird")).toBe("unknown");
  });
});

describe("structured logs", () => {
  test("secrets, binary data and long text never reach the log", () => {
    const redacted = redactLogFields({
      evidence_id: "e1",
      token: "123:ABC",
      headers: { authorization: "Bearer xyz", "x-telegram-bot-api-secret-token": "s" },
      SUPABASE_SERVICE_ROLE_KEY: "service",
      body: new Uint8Array(10),
      note: "x".repeat(500),
    }) as Record<string, unknown>;
    const text = JSON.stringify(redacted);
    expect(text).not.toContain("123:ABC");
    expect(text).not.toContain("Bearer xyz");
    expect(text).not.toContain("service\"");
    expect(redacted["body"]).toBe("[binary 10 bytes]");
    expect((redacted["note"] as string).length).toBeLessThanOrEqual(201);
    expect(redacted["evidence_id"]).toBe("e1");
  });

  test("a log line is JSON with event, level and error category", () => {
    const lines = capture();
    logEvent("analysis_failed", { workspace_id: "w1", error: new ParseError("bad amount", "x") }, "error");
    expect(lines[0]).toMatchObject({ event: "analysis_failed", level: "error", workspace_id: "w1", error_kind: "financial_validation" });
    expect(typeof lines[0]!["ts"]).toBe("string");
  });

  test("logging never throws, even with circular data", () => {
    restore = setLogSink(() => {
      throw new Error("sink down");
    });
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    expect(() => logEvent("ai_request_failed", { circular })).not.toThrow();
  });
});

describe("evidence streaming is observable", () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  const row = {
    id: ID,
    branch_id: "b1",
    order_number: "HS-1",
    media_type: "video",
    telegram_file_id: "f",
    thumbnail_file_id: null,
  };
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  const authorize = async () =>
    ({ client: { from: () => query }, workspaceId: "w1", actorUserId: "u1", globalBranchAccess: true, allowedBranchIds: [] }) as never;
  const fetchImpl = (async (url: string | URL | Request) =>
    String(url).endsWith("/getFile")
      ? new Response(JSON.stringify({ ok: true, result: { file_path: "videos/a.mp4" } }))
      : new Response(new Uint8Array([1, 2, 3]))) as typeof fetch;

  test("started and completed (with the byte count) are logged, without the bot token", async () => {
    const lines = capture();
    const response = await handleEvidenceMediaRequest(new Request(`https://tadqeeq.app/api/compensation/evidence/${ID}/media`), ID, {
      authorize,
      botToken: () => "123:SECRET",
      fetchImpl,
    });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(lines.map((line) => line["event"])).toEqual(["telegram_evidence_stream_started", "telegram_evidence_stream_completed"]);
    expect(lines[1]).toMatchObject({ evidence_id: ID, bytes: 3 });
    expect(JSON.stringify(lines)).not.toContain("SECRET");
  });

  test("an unauthorised request is logged as permission_denied", async () => {
    const lines = capture();
    await handleEvidenceMediaRequest(new Request("https://tadqeeq.app/x"), ID, {
      authorize: async () => {
        throw new Error("ليس لديك صلاحية لتنفيذ هذا الإجراء.");
      },
    });
    expect(lines[0]).toMatchObject({ event: "permission_denied", error_kind: "authorization" });
  });
});
