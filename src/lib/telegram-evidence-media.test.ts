import { describe, expect, test } from "bun:test";

import {
  handleEvidenceMediaRequest,
  streamTelegramFile,
  telegramFileIdFor,
  TELEGRAM_GET_FILE_LIMIT_BYTES,
  type EvidenceMediaRow,
} from "./telegram-evidence-media.server";

const TOKEN = "123456:SECRET-BOT-TOKEN";

const video: EvidenceMediaRow = {
  id: "11111111-1111-4111-8111-111111111111",
  branch_id: "b1",
  order_number: "HS-88214073",
  media_type: "video",
  telegram_file_id: "video-file-id",
  thumbnail_file_id: "thumb-file-id",
};

/** Fake Telegram: getFile answers with `info`, the file URL answers with `bytes`. */
function fakeTelegram(info: unknown, bytes = new Uint8Array([1, 2, 3, 4])) {
  const calls: Array<{ url: string; body?: string }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    calls.push({ url: href, body: typeof init?.body === "string" ? init.body : undefined });
    if (href.endsWith("/getFile")) return new Response(JSON.stringify(info));
    return new Response(bytes, { headers: { "content-length": String(bytes.byteLength) } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

async function bodyText(response: Response): Promise<string> {
  return new TextDecoder().decode(await response.arrayBuffer());
}

describe("Telegram evidence media proxy", () => {
  test("streams the original from Telegram with no-store headers for preview", async () => {
    const { fetchImpl, calls } = fakeTelegram({ ok: true, result: { file_path: "videos/file_7.mp4", file_size: 4 } });
    const response = await streamTelegramFile({ row: video, variant: "full", download: false, token: TOKEN, fetchImpl });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("cache-control")).toBe("no-store, private, max-age=0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="order-HS-88214073.mp4"');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(JSON.parse(calls[0]!.body!)).toEqual({ file_id: "video-file-id" });
  });

  test("download asks the browser to save the file", async () => {
    const { fetchImpl } = fakeTelegram({ ok: true, result: { file_path: "photos/file_1.jpg" } });
    const response = await streamTelegramFile({ row: video, variant: "full", download: true, token: TOKEN, fetchImpl });
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="order-HS-88214073.jpg"');
  });

  test("never exposes the bot token in headers or body", async () => {
    const { fetchImpl } = fakeTelegram({ ok: true, result: { file_path: "videos/file_7.mp4" } });
    const ok = await streamTelegramFile({ row: video, variant: "full", download: false, token: TOKEN, fetchImpl });
    const headers = JSON.stringify([...ok.headers.entries()]);
    expect(headers).not.toContain("SECRET-BOT-TOKEN");
    expect(await bodyText(ok)).not.toContain("SECRET-BOT-TOKEN");

    const failed = await streamTelegramFile({
      row: video,
      variant: "full",
      download: false,
      token: TOKEN,
      fetchImpl: fakeTelegram({ ok: false, description: "Bad Request: invalid file_id" }).fetchImpl,
    });
    expect(await bodyText(failed)).not.toContain("SECRET-BOT-TOKEN");
  });

  test("evidence deleted from Telegram is reported unavailable, not served from a copy", async () => {
    const { fetchImpl, calls } = fakeTelegram({ ok: false, description: "Bad Request: file not found" });
    const response = await streamTelegramFile({ row: video, variant: "full", download: false, token: TOKEN, fetchImpl });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store, private, max-age=0");
    expect((await response.json()) as { error: string }).toEqual({ error: "الدليل غير متاح من Telegram (ربما حُذفت الرسالة)." });
    expect(calls).toHaveLength(1);
  });

  test("files over the 20 MB Bot API limit are refused with a clear message", async () => {
    const tooBig = await streamTelegramFile({
      row: video,
      variant: "full",
      download: false,
      token: TOKEN,
      fetchImpl: fakeTelegram({ ok: false, description: "Bad Request: file is too big" }).fetchImpl,
    });
    expect(tooBig.status).toBe(413);

    const declared = await streamTelegramFile({
      row: video,
      variant: "full",
      download: false,
      token: TOKEN,
      fetchImpl: fakeTelegram({
        ok: true,
        result: { file_path: "videos/big.mp4", file_size: TELEGRAM_GET_FILE_LIMIT_BYTES + 1 },
      }).fetchImpl,
    });
    expect(declared.status).toBe(413);
  });

  test("Telegram outage returns a temporary error", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const response = await streamTelegramFile({ row: video, variant: "full", download: false, token: TOKEN, fetchImpl });
    expect(response.status).toBe(502);
  });

  test("thumbnail uses the Telegram thumbnail, or the photo itself", () => {
    expect(telegramFileIdFor(video, "thumb")).toBe("thumb-file-id");
    expect(telegramFileIdFor({ ...video, thumbnail_file_id: null, media_type: "photo" }, "thumb")).toBe("video-file-id");
    expect(telegramFileIdFor({ ...video, thumbnail_file_id: null }, "thumb")).toBeNull();
  });

  test("unsafe characters in the order number never reach the filename header", async () => {
    const { fetchImpl } = fakeTelegram({ ok: true, result: { file_path: "photos/a.jpg" } });
    const response = await streamTelegramFile({
      row: { ...video, order_number: 'A"; evil=1\r\nX' },
      variant: "full",
      download: true,
      token: TOKEN,
      fetchImpl,
    });
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="order-Aevil1X.jpg"');
  });
});

describe("evidence media endpoint authorization", () => {
  const ID = video.id;
  const request = new Request(`https://tadqeeq.app/api/compensation/evidence/${ID}/media`);

  /** A signed-in context whose database only returns rows of its own workspace. */
  function context(options: {
    workspaceId: string;
    rows: Array<EvidenceMediaRow & { workspace_id: string }>;
    allowedBranchIds?: string[];
  }) {
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (column: string, value: string) => {
        filters[column] = value;
        return query;
      },
      maybeSingle: async () => ({
        data:
          options.rows.find((row) => row.id === filters["id"] && row.workspace_id === filters["workspace_id"]) ?? null,
        error: null,
      }),
    };
    return {
      filters,
      authorize: async () =>
        ({
          client: { from: () => query },
          workspaceId: options.workspaceId,
          globalBranchAccess: !options.allowedBranchIds,
          allowedBranchIds: options.allowedBranchIds ?? [],
        }) as never,
    };
  }

  const ok = fakeTelegram({ ok: true, result: { file_path: "videos/file_7.mp4" } });

  test("a signed-out or unauthorised user gets 401 and Telegram is never called", async () => {
    const { fetchImpl, calls } = fakeTelegram({ ok: true, result: { file_path: "x.mp4" } });
    const response = await handleEvidenceMediaRequest(request, ID, {
      authorize: async () => {
        throw new Error("الجلسة منتهية، سجّل الدخول مرة أخرى.");
      },
      botToken: () => TOKEN,
      fetchImpl,
    });
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  test("a guessed id from another workspace is not found and nothing is streamed", async () => {
    const { fetchImpl, calls } = fakeTelegram({ ok: true, result: { file_path: "x.mp4" } });
    const user = context({ workspaceId: "workspace-a", rows: [{ ...video, workspace_id: "workspace-b" }] });
    const response = await handleEvidenceMediaRequest(request, ID, {
      authorize: user.authorize,
      botToken: () => TOKEN,
      fetchImpl,
    });
    expect(response.status).toBe(404);
    expect(user.filters["workspace_id"]).toBe("workspace-a");
    expect(calls).toHaveLength(0);
  });

  test("a branch-restricted user cannot stream another branch's evidence", async () => {
    const { fetchImpl, calls } = fakeTelegram({ ok: true, result: { file_path: "x.mp4" } });
    const user = context({
      workspaceId: "workspace-a",
      rows: [{ ...video, branch_id: "branch-2", workspace_id: "workspace-a" }],
      allowedBranchIds: ["branch-1"],
    });
    const response = await handleEvidenceMediaRequest(request, ID, {
      authorize: user.authorize,
      botToken: () => TOKEN,
      fetchImpl,
    });
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  test("an allowed user gets the file streamed", async () => {
    const user = context({
      workspaceId: "workspace-a",
      rows: [{ ...video, branch_id: "branch-1", workspace_id: "workspace-a" }],
      allowedBranchIds: ["branch-1"],
    });
    const response = await handleEvidenceMediaRequest(request, ID, {
      authorize: user.authorize,
      botToken: () => TOKEN,
      fetchImpl: ok.fetchImpl,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private, max-age=0");
  });

  test("invalid ids and a missing bot token fail safely", async () => {
    expect((await handleEvidenceMediaRequest(request, "../etc/passwd")).status).toBe(400);
    const user = context({ workspaceId: "workspace-a", rows: [{ ...video, workspace_id: "workspace-a" }] });
    const response = await handleEvidenceMediaRequest(request, ID, {
      authorize: user.authorize,
      botToken: () => undefined,
      fetchImpl: ok.fetchImpl,
    });
    expect(response.status).toBe(503);
  });
});
