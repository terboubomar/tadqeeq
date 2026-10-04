import { describe, expect, test } from "bun:test";

import { opsMfaState } from "./ops";

describe("opsMfaState", () => {
  test("ops needs a session that passed the authenticator code", () => {
    expect(opsMfaState("aal2", true)).toBe("verified");
    expect(opsMfaState("aal1", true)).toBe("required");
    expect(opsMfaState(undefined, true)).toBe("required");
    expect(opsMfaState("AAL2", true)).toBe("required");
  });

  test("OPS_MFA_REQUIRED=false switches it off", () => {
    expect(opsMfaState("aal1", false)).toBe("off");
  });
});
