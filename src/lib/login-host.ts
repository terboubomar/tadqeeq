/**
 * Sign-in and sign-up live on login.tadqeeq.app; the app stays on tadqeeq.app.
 *
 * Supabase keeps the session in the browser per origin, so after signing in (password, then the emailed code or
 * the authenticator code) login.tadqeeq.app hands the session to tadqeeq.app once: it opens
 * tadqeeq.app/auth-handoff with the tokens in the URL fragment (never sent to a server), drops its own copy, and
 * the app stores the session and opens the dashboard. Email links (confirm, reset) still point at tadqeeq.app.
 */
import { safeNextPath } from "./redirects";

/** Sends tadqeeq.app/auth to login.tadqeeq.app. Turn on once login.tadqeeq.app is connected to the project. */
export const LOGIN_SUBDOMAIN_LIVE = false;

/** The production hosts whose /auth moves to the login subdomain. Previews and local dev keep /auth in place. */
const MAIN_HOSTS = ["tadqeeq.app", "www.tadqeeq.app"];

const hostname = (host: string) => host.toLowerCase().split(":")[0] ?? "";

export function isLoginHost(host: string): boolean {
  return hostname(host).startsWith("login.");
}

/** Whether /auth on this host should forward to the login subdomain. */
export function usesLoginSubdomain(host: string, live = LOGIN_SUBDOMAIN_LIVE): boolean {
  return live && MAIN_HOSTS.includes(hostname(host));
}

/** login.tadqeeq.app for tadqeeq.app or www.tadqeeq.app. */
export function loginOriginFor(host: string): string {
  return `https://login.${hostname(host).replace(/^www\./, "")}`;
}

/** The app a login host hands over to: login.tadqeeq.app → https://tadqeeq.app (keeping a dev port). */
export function appOriginFor(loginHost: string, protocol = "https:"): string {
  return `${protocol}//${loginHost.toLowerCase().replace(/^login\./, "")}`;
}

export interface LoginSearch {
  mode?: "signup" | "reset";
  next?: string;
  /** One-time value the app keeps in sessionStorage, returned with the handoff. */
  state?: string;
}

export function loginUrl(host: string, search: LoginSearch): string {
  const params = new URLSearchParams();
  if (search.mode) params.set("mode", search.mode);
  if (search.next) params.set("next", search.next);
  if (search.state) params.set("state", search.state);
  const query = params.toString();
  return `${loginOriginFor(host)}/auth${query ? `?${query}` : ""}`;
}

export interface Handoff {
  accessToken: string;
  refreshToken: string;
  next?: string;
  state?: string;
}

export function handoffUrl(appOrigin: string, handoff: Handoff): string {
  // Not access_token / refresh_token: the Supabase client would pick those up from the URL by itself, before
  // the app checks where the handoff came from.
  const params = new URLSearchParams({ at: handoff.accessToken, rt: handoff.refreshToken });
  if (handoff.next) params.set("next", handoff.next);
  if (handoff.state) params.set("state", handoff.state);
  return `${appOrigin}/auth-handoff#${params.toString()}`;
}

const STATE = /^[A-Za-z0-9-]{16,64}$/;

/** Reads a handoff fragment; anything malformed is refused. */
export function parseHandoff(hash: string): Handoff | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const accessToken = params.get("at") ?? "";
  const refreshToken = params.get("rt") ?? "";
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(accessToken) || !/^[\w-]{6,512}$/.test(refreshToken)) return null;
  const next = safeNextPath(params.get("next"));
  const state = params.get("state") ?? "";
  return { accessToken, refreshToken, ...(next ? { next } : {}), ...(STATE.test(state) ? { state } : {}) };
}

export function safeState(raw: unknown): string | undefined {
  return typeof raw === "string" && STATE.test(raw) ? raw : undefined;
}

/** The signed-in email inside an access token, for the "continue as" check. Display only; not verified here. */
export function emailInToken(accessToken: string): string | null {
  try {
    const part = accessToken.split(".")[1] ?? "";
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof json.email === "string" ? json.email : null;
  } catch {
    return null;
  }
}

/** sessionStorage key on the app for the state it sent to the login host. */
export const HANDOFF_STATE_KEY = "tadqeeq-login-state";
