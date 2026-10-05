/**
 * Optional two-step sign-in (authenticator app, Supabase TOTP) for client users.
 *
 * A user who turned it on must reach Supabase assurance level aal2 (password + 6-digit code) before the app,
 * the server functions or the database let them in. OAuth tokens issued to Claude / ChatGPT (they carry a
 * `client_id` claim and stay at aal1) are accepted: approving the connection already required the code.
 */

export const MFA_REQUIRED_MESSAGE = "أدخل رمز التحقق من تطبيق المصادقة لإكمال تسجيل الدخول.";

export interface TokenClaims {
  aal?: string;
  clientId?: string;
}

/** Reads the claims of an already verified Supabase access token (no signature check here). */
export function tokenClaims(token: string): TokenClaims {
  try {
    const part = (token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
    const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)))) as Record<string, unknown>;
    return {
      ...(typeof json["aal"] === "string" ? { aal: json["aal"] } : {}),
      ...(typeof json["client_id"] === "string" && json["client_id"] ? { clientId: json["client_id"] } : {}),
    };
  } catch {
    return {};
  }
}

/** Same rule as private.mfa_satisfied in the database (migration 0044). */
export function mfaSatisfied(claims: TokenClaims, hasVerifiedFactor: boolean): boolean {
  return !hasVerifiedFactor || claims.aal === "aal2" || Boolean(claims.clientId);
}

/** From supabase.auth.mfa.getAuthenticatorAssuranceLevel(): the session still needs the 6-digit code. */
export function needsMfaCode(levels: { currentLevel: string | null; nextLevel: string | null } | null | undefined): boolean {
  return levels?.nextLevel === "aal2" && levels.currentLevel !== "aal2";
}

export function hasVerifiedFactor(factors: { status?: string }[] | null | undefined): boolean {
  return (factors ?? []).some((factor) => factor.status === "verified");
}
