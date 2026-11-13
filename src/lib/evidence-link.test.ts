import { describe, expect, test } from "bun:test";

import { EVIDENCE_LINK_TTL_SECONDS, makeEvidenceDownloadToken, readEvidenceDownloadToken } from "./evidence-link.server";

const secret = "test-secret-that-is-at-least-thirty-two-characters";
const evidence = "11111111-1111-4111-8111-111111111111";
const workspace = "22222222-2222-4222-8222-222222222222";
const now = Date.UTC(2026, 10, 13, 22, 0, 0);

describe("signed evidence download links", () => {
  test("a fresh link names its evidence and workspace", () => {
    const { token, expiresAt } = makeEvidenceDownloadToken(evidence, workspace, { now, secret });
    expect(readEvidenceDownloadToken(token, { now, secret })).toEqual({ evidenceId: evidence, workspaceId: workspace });
    expect(Date.parse(expiresAt) - now).toBe(EVIDENCE_LINK_TTL_SECONDS * 1000);
  });

  test("expires after ten minutes", () => {
    const { token } = makeEvidenceDownloadToken(evidence, workspace, { now, secret });
    expect(readEvidenceDownloadToken(token, { now: now + 9 * 60_000, secret })).not.toBeNull();
    expect(readEvidenceDownloadToken(token, { now: now + 11 * 60_000, secret })).toBeNull();
  });

  test("a changed or foreign token is refused", () => {
    const { token } = makeEvidenceDownloadToken(evidence, workspace, { now, secret });
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ p: "evidence-download", e: evidence, w: "33333333-3333-4333-8333-333333333333", x: 9_999_999_999 })).toString("base64url");
    expect(readEvidenceDownloadToken(`${forged}.${mac}`, { now, secret })).toBeNull();
    expect(readEvidenceDownloadToken(`${body}.${mac}`, { now, secret: secret + "x" })).toBeNull();
    expect(readEvidenceDownloadToken("garbage", { now, secret })).toBeNull();
  });
});
