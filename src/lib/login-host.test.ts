import { describe, expect, test } from "bun:test";

import {
  appOriginFor,
  emailInToken,
  handoffUrl,
  isLoginHost,
  loginOriginFor,
  loginUrl,
  parseHandoff,
  safeState,
  usesLoginSubdomain,
} from "./login-host";

const token = (payload: Record<string, unknown>) =>
  `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.c2lnbmF0dXJl`;
const STATE = "6f1c2a9e-1b2c-4d5e-8f90-123456789abc";

describe("login subdomain", () => {
  test("only the production app forwards /auth, and only when switched on", () => {
    expect(usesLoginSubdomain("tadqeeq.app", true)).toBe(true);
    expect(usesLoginSubdomain("www.tadqeeq.app", true)).toBe(true);
    expect(usesLoginSubdomain("tadqeeq.app", false)).toBe(false);
    for (const host of ["login.tadqeeq.app", "ops.tadqeeq.app", "localhost:4173", "id-preview--x.lovable.app"]) {
      expect(usesLoginSubdomain(host, true)).toBe(false);
    }
  });

  test("hosts map between the app and the login subdomain", () => {
    expect(isLoginHost("login.tadqeeq.app")).toBe(true);
    expect(isLoginHost("tadqeeq.app")).toBe(false);
    expect(loginOriginFor("www.tadqeeq.app")).toBe("https://login.tadqeeq.app");
    expect(appOriginFor("login.tadqeeq.app")).toBe("https://tadqeeq.app");
    expect(appOriginFor("login.localhost:4173", "http:")).toBe("http://localhost:4173");
  });

  test("the login address keeps the tab, the return path and the state", () => {
    expect(loginUrl("tadqeeq.app", { mode: "signup", next: "/import?x=1", state: STATE })).toBe(
      `https://login.tadqeeq.app/auth?mode=signup&next=%2Fimport%3Fx%3D1&state=${STATE}`,
    );
    expect(loginUrl("tadqeeq.app", {})).toBe("https://login.tadqeeq.app/auth");
  });
});

describe("handoff", () => {
  const at = token({ email: "owner@example.com", sub: "u" });

  test("round-trips through the fragment, under names the Supabase client does not read", () => {
    const url = handoffUrl("https://tadqeeq.app", { accessToken: at, refreshToken: "r3fresh-token", next: "/trends", state: STATE });
    expect(url.startsWith("https://tadqeeq.app/auth-handoff#")).toBe(true);
    expect(url).not.toContain("access_token");
    expect(parseHandoff(new URL(url).hash)).toEqual({ accessToken: at, refreshToken: "r3fresh-token", next: "/trends", state: STATE });
  });

  test("refuses malformed tokens and drops an unsafe next or state", () => {
    expect(parseHandoff("#at=nope&rt=r3fresh-token")).toBeNull();
    expect(parseHandoff(`#at=${at}`)).toBeNull();
    expect(parseHandoff(`#at=${at}&rt=r3fresh-token&next=https://evil.example&state=bad`)).toEqual({ accessToken: at, refreshToken: "r3fresh-token" });
    expect(safeState("x")).toBeUndefined();
    expect(safeState(STATE)).toBe(STATE);
  });

  test("reads the email for the confirm step", () => {
    expect(emailInToken(at)).toBe("owner@example.com");
    expect(emailInToken("a.b.c")).toBeNull();
  });
});
