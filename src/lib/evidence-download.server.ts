import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { readEvidenceDownloadToken } from "./evidence-link.server";
import { logEvent } from "./observability";
import { evidenceErrorResponse, streamTelegramFile, type EvidenceMediaRow } from "./telegram-evidence-media.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

/** Serves the file behind a signed evidence link (src/lib/evidence-link.server.ts). */
export async function handleEvidenceDownloadLink(
  request: Request,
  deps: { botToken?: () => string | undefined; fetchImpl?: typeof fetch } = {},
): Promise<Response> {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const link = token ? readEvidenceDownloadToken(token) : null;
  if (!link) return evidenceErrorResponse(403, "انتهت صلاحية رابط الدليل. اطلب رابطاً جديداً. / The evidence link expired.");

  const { data, error } = await db()
    .from("telegram_order_evidence")
    .select("id, branch_id, order_number, media_type, telegram_file_id, thumbnail_file_id")
    .eq("id", link.evidenceId)
    .eq("workspace_id", link.workspaceId)
    .maybeSingle();
  if (error) return evidenceErrorResponse(500, "تعذّر قراءة بيانات الدليل.");
  if (!data) return evidenceErrorResponse(404, "الدليل غير موجود.");

  const botToken = (deps.botToken ?? (() => process.env["TELEGRAM_BOT_TOKEN"]))()?.trim();
  if (!botToken) return evidenceErrorResponse(503, "إعدادات Telegram غير مكتملة على الخادم.");
  logEvent("evidence_link_download", { evidence_id: link.evidenceId, workspace_id: link.workspaceId });
  return streamTelegramFile({ row: data as EvidenceMediaRow, variant: "full", download: true, token: botToken, fetchImpl: deps.fetchImpl });
}
