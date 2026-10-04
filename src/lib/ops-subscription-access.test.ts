import { describe, expect, test } from "bun:test";

import { subscriptionAccessChange } from "./ops";

const change = (over: Partial<Parameters<typeof subscriptionAccessChange>[0]>) =>
  subscriptionAccessChange({ status: "active", onboardingStatus: "active", otherLiveSubscription: false, archived: false, ...over });

describe("subscriptionAccessChange", () => {
  test("an active subscription ends the free trial at any onboarding step", () => {
    for (const step of ["pending_details", "meeting_booked", "awaiting_payment", "onboarding"] as const) {
      expect(change({ onboardingStatus: step })).toBe("activate");
    }
    expect(change({ onboardingStatus: "suspended" })).toBe("activate");
    expect(change({ onboardingStatus: "active" })).toBeNull();
  });

  test("cancelling the old plan after an upgrade keeps the account open", () => {
    expect(change({ status: "cancelled", otherLiveSubscription: true })).toBeNull();
    expect(change({ status: "suspended", otherLiveSubscription: true })).toBeNull();
  });

  test("cancelling or suspending the only subscription locks the account once", () => {
    expect(change({ status: "cancelled" })).toBe("suspend");
    expect(change({ status: "suspended", onboardingStatus: "awaiting_payment" })).toBe("suspend");
    expect(change({ status: "cancelled", onboardingStatus: "suspended" })).toBeNull();
  });

  test("archived clients and overdue or trial subscriptions change nothing", () => {
    expect(change({ archived: true, onboardingStatus: "suspended" })).toBeNull();
    expect(change({ status: "overdue", onboardingStatus: "suspended" })).toBeNull();
    expect(change({ status: "trial", onboardingStatus: "pending_details" })).toBeNull();
    expect(change({ onboardingStatus: null })).toBeNull();
  });
});
