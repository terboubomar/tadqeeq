import { describe, expect, test } from "bun:test";

import { emailCodeRequired } from "./mfa";

describe("email sign-in code after the password", () => {
  test("password sign-in needs the email code", () => {
    expect(emailCodeRequired({ amr: ["password"], aal: "aal1" }, false)).toBe(true);
  });
  test("Google / Apple sign-in does not", () => {
    expect(emailCodeRequired({ amr: ["oauth"], aal: "aal1" }, false)).toBe(false);
  });
  test("authenticator-app users enter that code instead", () => {
    expect(emailCodeRequired({ amr: ["password"], aal: "aal1" }, true)).toBe(false);
  });
  test("AI assistant tokens are not asked", () => {
    expect(emailCodeRequired({ amr: ["password"], clientId: "abc" }, false)).toBe(false);
  });
});
