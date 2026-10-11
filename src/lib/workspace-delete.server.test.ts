import { beforeEach, describe, expect, mock, test } from "bun:test";

/** An owner deleting one of their companies, with the database and the delete helpers replaced by fakes. */
type Row = Record<string, unknown>;
const OWNER = "owner-1";
let workspaces: Row[] = [];
let contracts = 0;
let activeWorkspace = "w2";
const calls: string[] = [];

function query(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let patch: Row | null = null;
  const rows = () => (table === "workspaces" ? workspaces : []).filter((row) => filters.every((f) => f(row)));
  const api = {
    select: () => api,
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      if (patch) calls.push(`update ${table} ${column}=${String(value)} -> ${JSON.stringify(patch)}`);
      return patch ? Promise.resolve({ error: null }) : api;
    },
    neq: (column: string, value: unknown) => {
      filters.push((row) => row[column] !== value);
      return api;
    },
    order: () => api,
    update: (next: Row) => {
      patch = next;
      return api;
    },
    insert: async (row: Row) => {
      calls.push(`insert ${table} ${String(row["event_type"])} in ${String(row["workspace_id"])}`);
      return { error: null };
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows(), error: null }),
  };
  return api;
}

mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: query } }));
mock.module("./server-auth.server", () => ({
  requireServerUserAnyStatus: async () => ({ actorUserId: OWNER, workspaceId: activeWorkspace, client: {} }),
}));
mock.module("./workspace-deletion.server", () => ({
  WORKSPACE_FILES: [["audit_source_files", "storage_path", "source-files"], ["payments", "receipt_path", "ops-receipts"]],
  countWorkspaceContracts: async () => contracts,
  collectWorkspaceFiles: async (_id: string, files: Array<[string]>) => {
    calls.push(`files ${files.map(([table]) => table).join(",")}`);
    return new Map();
  },
  deleteWorkspaceRows: async (id: string) => {
    calls.push(`delete ${id}`);
  },
  removeWorkspaceFiles: async () => 0,
}));

const { deleteAccountWorkspaceOnServer } = await import("./workspace-management.server");

beforeEach(() => {
  workspaces = [
    { id: "w1", name: "Main", owner_user_id: OWNER, created_at: "2026-01-01" },
    { id: "w2", name: "Second brand", owner_user_id: OWNER, created_at: "2026-05-01" },
    { id: "x1", name: "Someone else", owner_user_id: "other", created_at: "2026-02-01" },
  ];
  contracts = 0;
  activeWorkspace = "w2";
  calls.length = 0;
});

describe("deleteAccountWorkspaceOnServer", () => {
  test("refuses a company the user does not own", async () => {
    await expect(deleteAccountWorkspaceOnServer("x1", "Someone else")).rejects.toThrow("مالك الشركة فقط");
    expect(calls).toEqual([]);
  });

  test("refuses when the typed name does not match", async () => {
    await expect(deleteAccountWorkspaceOnServer("w2", "Second")).rejects.toThrow("لا يطابق");
    expect(calls).toEqual([]);
  });

  test("refuses the owner's only company", async () => {
    workspaces = workspaces.filter((w) => w.id !== "w1");
    await expect(deleteAccountWorkspaceOnServer("w2", "Second brand")).rejects.toThrow("شركتك الوحيدة");
    expect(calls).toEqual([]);
  });

  test("refuses a company with saved platform contracts before deleting anything", async () => {
    contracts = 2;
    await expect(deleteAccountWorkspaceOnServer("w2", "Second brand")).rejects.toThrow("عقود منصات");
    expect(calls).toEqual([]);
  });

  test("moves the account's subscription to the oldest remaining company, deletes, and switches there", async () => {
    const result = await deleteAccountWorkspaceOnServer("w2", "  Second brand ");
    expect(result).toEqual({ switchedTo: "w1" });
    expect(calls).toEqual([
      'update subscriptions workspace_id=w2 -> {"workspace_id":"w1"}',
      'update payments workspace_id=w2 -> {"workspace_id":"w1"}',
      'update client_notes workspace_id=w2 -> {"workspace_id":"w1"}',
      "files audit_source_files",
      "delete w2",
      'update profiles id=owner-1 -> {"active_workspace_id":"w1"}',
      "insert workspace_audit_events workspace.deleted in w1",
    ]);
  });

  test("deleting a company other than the active one keeps the user where they are", async () => {
    activeWorkspace = "w1";
    const result = await deleteAccountWorkspaceOnServer("w2", "Second brand");
    expect(result).toEqual({ switchedTo: null });
    expect(calls.some((c) => c.startsWith("update profiles"))).toBe(false);
  });
});
