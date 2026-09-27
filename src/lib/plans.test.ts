import { describe, expect, test } from "bun:test";

import { featureForPermission, isTrialStatus, resolvePlanAccess, TRIAL_UPLOAD_LIMIT } from "./plans";
import { ROLE_PERMISSIONS } from "./workspace-access";

const owner = ROLE_PERMISSIONS.owner;
const base = { rolePermissions: owner, isPlatformAdmin: false, planFeatures: null, uploadLimit: null, uploadsThisMonth: 3, trialUploads: 0 };

describe("resolvePlanAccess", () => {
  test("a signed-up, not activated workspace runs as a trial limited to analysis", () => {
    const access = resolvePlanAccess({ ...base, onboardingStatus: "pending_details", trialUploads: 0 });
    expect(access.trial).toBe(true);
    for (const allowed of ["reports.read", "financials.read", "imports.create", "periods.read", "branches.manage"] as const) {
      expect(access.permissions).toContain(allowed);
    }
    for (const locked of ["exceptions.read", "compensation.read", "contracts.read", "ai.use", "users.manage"] as const) {
      expect(access.permissions).not.toContain(locked);
      expect(access.planLockedPermissions).toContain(locked);
    }
    expect(access.uploadLimit).toBe(TRIAL_UPLOAD_LIMIT);
    expect(access.uploadsUsed).toBe(0);
  });

  test("trial counts all-time uploads, not this month", () => {
    const access = resolvePlanAccess({ ...base, onboardingStatus: "meeting_booked", uploadsThisMonth: 0, trialUploads: 1 });
    expect(access.uploadsUsed).toBe(1);
    expect(access.uploadsUsed >= (access.uploadLimit ?? Infinity)).toBe(true);
  });

  test("an active workspace without a plan keeps every role permission", () => {
    const access = resolvePlanAccess({ ...base, onboardingStatus: "active" });
    expect(access.trial).toBe(false);
    expect(access.permissions).toEqual([...owner]);
    expect(access.planLockedPermissions).toEqual([]);
    expect(access.uploadsUsed).toBe(3);
  });

  test("an active plan locks the features it does not include", () => {
    const access = resolvePlanAccess({ ...base, onboardingStatus: "active", planFeatures: ["invoice_audit", "exceptions"], uploadLimit: 10 });
    expect(access.permissions).toContain("exceptions.read");
    expect(access.planLockedPermissions).toContain("compensation.read");
    expect(access.planLockedPermissions).toContain("ai.use");
    expect(access.planLockedPermissions).not.toContain("users.manage");
    expect(access.uploadLimit).toBe(10);
  });

  test("platform admins and suspended workspaces are never trials", () => {
    expect(resolvePlanAccess({ ...base, onboardingStatus: "pending_details", isPlatformAdmin: true }).trial).toBe(false);
    expect(isTrialStatus("suspended")).toBe(false);
    expect(isTrialStatus("active")).toBe(false);
  });

  test("role limits are not shown as plan locks", () => {
    const viewer = ROLE_PERMISSIONS.viewer ?? [];
    const access = resolvePlanAccess({ ...base, rolePermissions: viewer, onboardingStatus: "active", planFeatures: ["invoice_audit"] });
    expect(access.planLockedPermissions.every((p) => viewer.includes(p))).toBe(true);
  });
});

describe("featureForPermission", () => {
  test("maps permissions to the plan feature that unlocks them", () => {
    expect(featureForPermission("compensation.read")).toBe("compensation");
    expect(featureForPermission("ai.use")).toBe("ai");
    expect(featureForPermission("reports.read")).toBeNull();
  });
});
