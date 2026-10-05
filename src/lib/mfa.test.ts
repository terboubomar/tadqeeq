import { describe, expect, test } from "bun:test";

import { hasVerifiedFactor, mfaSatisfied, needsMfaCode, tokenClaims } from "./mfa";

const token = (payload: Record<string, unknown>) =>
  `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;

describe("tokenClaims", () => {
  test("reads aal and client_id from a JWT payload", () => {
    expect(tokenClaims(token({ aal: "aal2", sub: "u" }))).toEqual({ aal: "aal2" });
    expect(tokenClaims(token({ aal: "aal1", client_id: "mcp", name: "مطعم" }))).toEqual({ aal: "aal1", clientId: "mcp" });
    expect(tokenClaims("not-a-token")).toEqual({});
  });
});

describe("mfaSatisfied", () => {
  test("only users with a verified factor need aal2 or an OAuth token", () => {
    expect(mfaSatisfied({ aal: "aal1" }, false)).toBe(true);
    expect(mfaSatisfied({ aal: "aal1" }, true)).toBe(false);
    expect(mfaSatisfied({}, true)).toBe(false);
    expect(mfaSatisfied({ aal: "aal2" }, true)).toBe(true);
    expect(mfaSatisfied({ aal: "aal1", clientId: "mcp" }, true)).toBe(true);
  });

  test("an unfinished setup does not count", () => {
    expect(hasVerifiedFactor([{ status: "unverified" }])).toBe(false);
    expect(hasVerifiedFactor([{ status: "verified" }])).toBe(true);
    expect(hasVerifiedFactor(undefined)).toBe(false);
  });
});

describe("needsMfaCode", () => {
  test("asks for the code only when the account has it and the session has not passed it", () => {
    expect(needsMfaCode({ currentLevel: "aal1", nextLevel: "aal2" })).toBe(true);
    expect(needsMfaCode({ currentLevel: "aal2", nextLevel: "aal2" })).toBe(false);
    expect(needsMfaCode({ currentLevel: "aal1", nextLevel: "aal1" })).toBe(false);
    expect(needsMfaCode(null)).toBe(false);
  });
});
