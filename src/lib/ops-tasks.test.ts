import { describe, expect, test } from "bun:test";

import { buildOpsTasks, type OpsTaskClient } from "./ops-tasks";

const now = new Date("2026-09-27T12:00:00Z");
const client = (over: Partial<OpsTaskClient>): OpsTaskClient => ({
  workspaceId: over.name ?? "w",
  name: "w",
  status: "active",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: null,
  meetingAt: null,
  contactMobile: null,
  contactEmail: null,
  archived: false,
  trialUploads: 0,
  lastLogin: "2026-09-26T00:00:00Z",
  subscription: { status: "active", endsOn: "2027-01-01" },
  ...over,
});
const kinds = (clients: OpsTaskClient[], finance = true) => buildOpsTasks(clients, now, { finance }).map((t) => `${t.name}:${t.kind}`);

describe("buildOpsTasks", () => {
  test("a healthy active client needs nothing", () => {
    expect(kinds([client({ name: "ok" })])).toEqual([]);
  });

  test("signups that used their trial upload are separated from plain signups", () => {
    expect(kinds([client({ name: "a", status: "pending_details" }), client({ name: "b", status: "pending_details", trialUploads: 1 })])).toEqual([
      "b:trial_used",
      "a:new_signup",
    ]);
  });

  test("meetings split into upcoming and missed", () => {
    expect(
      kinds([
        client({ name: "later", status: "meeting_booked", meetingAt: "2026-09-29T10:00:00Z" }),
        client({ name: "past", status: "meeting_booked", meetingAt: "2026-09-20T10:00:00Z" }),
        client({ name: "none", status: "meeting_booked" }),
      ]),
    ).toEqual(["none:meeting_missed", "past:meeting_missed", "later:meeting_upcoming"]);
  });

  test("subscription tasks only for finance roles", () => {
    const clients = [
      client({ name: "late", subscription: { status: "active", endsOn: "2026-09-01" } }),
      client({ name: "owes", subscription: { status: "overdue", endsOn: null } }),
      client({ name: "soon", subscription: { status: "active", endsOn: "2026-10-05" } }),
      client({ name: "nosub", subscription: null }),
    ];
    expect(kinds(clients)).toEqual(["owes:overdue", "late:overdue", "soon:renewal_due", "nosub:no_subscription"]);
    expect(kinds(clients, false)).toEqual([]);
  });

  test("inactive active clients, and archived clients are skipped", () => {
    expect(
      kinds([
        client({ name: "idle", lastLogin: "2026-09-01T00:00:00Z" }),
        client({ name: "never", lastLogin: null }),
        client({ name: "gone", archived: true, status: "pending_details" }),
        client({ name: "stopped", status: "suspended" }),
      ]),
    ).toEqual(["never:inactive", "idle:inactive"]);
  });
});
