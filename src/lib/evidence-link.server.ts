import { signState, verifyState } from "./integrations/secret-box.server";

/**
 * A short-lived download link for one piece of evidence, so a browser agent filing an appeal can save the file
 * without signing in to Tadqeeq (which asks for the authenticator code). The token is signed with the server
 * secret (HMAC-SHA256), names one evidence item and its workspace, and expires after ten minutes. Only the MCP,
 * after its own access checks, issues one.
 */

export const EVIDENCE_LINK_TTL_SECONDS = 600;
const PURPOSE = "evidence-download";

export function makeEvidenceDownloadToken(
  evidenceId: string,
  workspaceId: string,
  options: { now?: number; secret?: string } = {},
): { token: string; expiresAt: string } {
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  const expires = now + EVIDENCE_LINK_TTL_SECONDS;
  return {
    token: signState({ p: PURPOSE, e: evidenceId, w: workspaceId, x: expires }, options.secret),
    expiresAt: new Date(expires * 1000).toISOString(),
  };
}

export function readEvidenceDownloadToken(
  token: string,
  options: { now?: number; secret?: string } = {},
): { evidenceId: string; workspaceId: string } | null {
  let payload: Record<string, string | number> | null;
  try {
    payload = verifyState(token, options.secret);
  } catch {
    return null;
  }
  if (!payload || payload["p"] !== PURPOSE) return null;
  const expires = Number(payload["x"]);
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  if (!Number.isFinite(expires) || expires < now) return null;
  const evidenceId = String(payload["e"] ?? "");
  const workspaceId = String(payload["w"] ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(evidenceId) || !/^[0-9a-f-]{36}$/i.test(workspaceId)) return null;
  return { evidenceId, workspaceId };
}
