import { describe, expect, test } from "bun:test";

import {
  featureForPermission,
  featuresWithAddons,
  isPlanAddon,
  isTrialStatus,
  orderBasedPlans,
  ordersMonthLabel,
  planIncludesAddon,
  recommendPlan,
  resolvePlanAccess,
  TRIAL_UPLOAD_LIMIT,
  type PublicPlan,
} from "./plans";
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

describe("order-based plans", () => {
  const plan = (code: string | null, orderLimit: number | null, customPrice = false): PublicPlan => ({
    id: code ?? "old",
    name: code ?? "old",
    price: 100,
    cycle: "monthly",
    features: [],
    uploadLimit: null,
    description: null,
    highlighted: false,
    code,
    orderLimit,
    priceYearly: 1000,
    customPrice,
  });
  const plans = [plan("start", 3000), plan("growth", 10000), plan("scale", 30000), plan("groups", 75000), plan("enterprise", null, true), plan(null, null)];

  test("recommends the smallest plan sized for the month's orders", () => {
    expect(recommendPlan(plans, 0)?.code).toBe("start");
    expect(recommendPlan(plans, 3000)?.code).toBe("start");
    expect(recommendPlan(plans, 3001)?.code).toBe("growth");
    expect(recommendPlan(plans, 60000)?.code).toBe("groups");
    expect(recommendPlan(plans, 80000)?.code).toBe("enterprise");
  });

  test("above every limit, the unlimited plan comes before the one priced by agreement", () => {
    const three = [plan("start", 15000), plan("growth", 45000), plan("unlimited", null), plan("enterprise", null, true)];
    expect(recommendPlan(three, 15000)?.code).toBe("start");
    expect(recommendPlan(three, 15001)?.code).toBe("growth");
    expect(recommendPlan(three, 45001)?.code).toBe("unlimited");
  });

  test("a plan with compensation and AI already includes the add-on", () => {
    expect(planIncludesAddon(["invoice_audit", "exceptions", "contracts", "compensation", "ai"], "compensation_ai")).toBe(true);
    expect(planIncludesAddon(["invoice_audit", "compensation"], "compensation_ai")).toBe(false);
  });

  test("names the month monthly orders are counted from", () => {
    expect(ordersMonthLabel("2026-09-01")).toBe("طلبات سبتمبر");
    expect(ordersMonthLabel(null)).toBe("طلبات آخر شهر");
  });

  test("older plans without a code are left out of the order-based list", () => {
    expect(orderBasedPlans(plans).map((p) => p.code)).toEqual(["start", "growth", "scale", "groups", "enterprise"]);
  });

  test("the add-on package opens the compensation center and Tadqeeq AI", () => {
    expect(featuresWithAddons(["invoice_audit", "exceptions", "contracts"], ["compensation_ai"])?.sort()).toEqual(
      ["ai", "compensation", "contracts", "exceptions", "invoice_audit"],
    );
    expect(featuresWithAddons(["invoice_audit"], [])).toEqual(["invoice_audit"]);
    // No plan means everything is open; add-ons do not narrow it.
    expect(featuresWithAddons(null, ["compensation_ai"])).toBeNull();
    expect(isPlanAddon("compensation_ai")).toBe(true);
    expect(isPlanAddon("ai")).toBe(false);
  });
});
