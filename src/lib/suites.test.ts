import { describe, expect, test } from "bun:test";

import { startDestination, suiteAccess } from "./suites";
import { ROLE_PERMISSIONS, type WorkspacePermission, type WorkspaceRole } from "./workspace-access";

const access = (role: WorkspaceRole, over: { onboardingStatus?: string; trial?: boolean; isPlatformAdmin?: boolean; without?: WorkspacePermission[] } = {}) =>
  suiteAccess({
    onboardingStatus: over.onboardingStatus ?? "active",
    trial: over.trial ?? false,
    isPlatformAdmin: over.isPlatformAdmin ?? false,
    can: (p) => ROLE_PERMISSIONS[role].includes(p) && !(over.without ?? []).includes(p),
  });

describe("platform picker", () => {
  test("a subscribed owner, admin, auditor or viewer picks between ميزان and استرداد", () => {
    for (const role of ["owner", "admin", "auditor", "viewer"] as const) expect(startDestination(access(role))).toBeNull();
  });

  test("roles that only reach compensation go straight to استرداد", () => {
    expect(startDestination(access("compensation"))).toBe("/compensation");
    expect(startDestination(access("branch_manager"))).toBe("/compensation");
  });

  test("a trial or unsubscribed account goes to the main app as before", () => {
    expect(startDestination(access("owner", { trial: true }))).toBe("/dashboard");
    expect(startDestination(access("owner", { onboardingStatus: "pending_details" }))).toBe("/dashboard");
  });

  test("a plan without compensation goes straight to ميزان", () => {
    expect(startDestination(access("owner", { without: ["compensation.read"] }))).toBe("/dashboard");
  });
});
