import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { APP_URL, requireMcpAccess } from "../access";
import { loadCase } from "../compensation";
import { supabaseForUser } from "../supabase";

/** Images above this are not sent into the chat (the download link still works). */
const MAX_INLINE_BYTES = 3 * 1024 * 1024;

type EvidenceRow = {
  id: string;
  workspace_id: string;
  branch_id: string | null;
  order_number: string;
  media_type: string;
  telegram_file_id: string;
  thumbnail_file_id: string | null;
  captured_at: string;
  sender_name: string | null;
};

export default defineTool({
  name: "get_evidence",
  title: "See a case's evidence",
  description:
    "Show the branch evidence for a compensation case or an evidence id: the photo itself (or a video's preview frame) so you can check it, plus a download link valid for 10 minutes that a browser can open without signing in to Tadqeeq, to attach the file when filing the appeal on the platform.",
  inputSchema: {
    case_id: z.string().uuid().optional().describe("Case id from list_compensation_cases."),
    evidence_id: z.string().uuid().optional().describe("Evidence id from find_order_evidence."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ case_id, evidence_id }, ctx) => {
    await requireMcpAccess(ctx);
    let evidenceId = evidence_id ?? null;
    if (!evidenceId && case_id) evidenceId = (await loadCase(ctx, case_id)).evidenceId;
    if (!evidenceId) throw new ToolError("لا يوجد دليل مرفق بهذه الحالة. / This case has no evidence attached.");

    // The user's own token: row access rules keep this to their workspace and branches.
    const { data, error } = await supabaseForUser(ctx)
      .from("telegram_order_evidence")
      .select("id, workspace_id, branch_id, order_number, media_type, telegram_file_id, thumbnail_file_id, captured_at, sender_name")
      .eq("id", evidenceId)
      .maybeSingle();
    if (error) throw new ToolError(error.message);
    if (!data) throw new ToolError("الدليل غير موجود أو خارج صلاحياتك. / Evidence not found.");
    const row = data as unknown as EvidenceRow;

    const { makeEvidenceDownloadToken } = await import("@/lib/evidence-link.server");
    const { streamTelegramFile } = await import("@/lib/telegram-evidence-media.server");
    const { logEvent } = await import("@/lib/observability");

    let downloadUrl: string | null = null;
    let expiresAt: string | null = null;
    try {
      const link = makeEvidenceDownloadToken(row.id, row.workspace_id);
      downloadUrl = `${APP_URL}/api/public/evidence-download?t=${encodeURIComponent(link.token)}`;
      expiresAt = link.expiresAt;
    } catch {
      // Without the signing secret there is no link; the image below still shows.
    }

    const content: Array<{ type: "image"; data: string; mimeType: string } | { type: "text"; text: string }> = [];
    let imageNote: string | null = null;
    const botToken = process.env["TELEGRAM_BOT_TOKEN"]?.trim();
    if (botToken) {
      const response = await streamTelegramFile({ row, variant: "thumb", download: false, token: botToken });
      const mimeType = response.headers.get("content-type") ?? "";
      if (response.ok && mimeType.startsWith("image/")) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength <= MAX_INLINE_BYTES) content.push({ type: "image", data: Buffer.from(bytes).toString("base64"), mimeType });
        else imageNote = "image too large to show here; use download_url";
      } else {
        imageNote = "no preview available; use download_url";
      }
    } else {
      imageNote = "Telegram is not configured on the server";
    }
    logEvent("mcp_evidence_viewed", { evidence_id: row.id, workspace_id: row.workspace_id, link: Boolean(downloadUrl) });

    const details = {
      evidence_id: row.id,
      order_number: row.order_number,
      media: row.media_type,
      captured_at: row.captured_at,
      sent_by: row.sender_name,
      shown: content.length ? (row.media_type === "photo" || row.media_type === "image_document" ? "photo" : "video preview frame") : null,
      ...(imageNote ? { note: imageNote } : {}),
      download_url: downloadUrl,
      download_expires_at: expiresAt,
    };
    const text = JSON.stringify(details);
    content.push({ type: "text", text });
    return { content, structuredContent: JSON.parse(text) };
  },
});
