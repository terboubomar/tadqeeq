import { beforeEach, describe, expect, mock, test } from "bun:test";

type Row = Record<string, unknown>;

const USER_ID = "00000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";
const BRANCH_ID = "00000000-0000-4000-8000-000000000003";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000004";

let existingConnection: Row | null;
let insertedRow: Row | null;
let updatedRow: Row | null;

function query(table: string) {
  let mutation: "insert" | "update" | null = null;
  const api = {
    select: () => api,
    eq: () => api,
    maybeSingle: async () => ({
      data: table === "branch_registry" ? { id: BRANCH_ID, name: "فرع الملقا" } : existingConnection,
      error: null,
    }),
    insert: (row: Row) => {
      mutation = "insert";
      insertedRow = row;
      return api;
    },
    update: (row: Row) => {
      mutation = "update";
      updatedRow = row;
      return api;
    },
    single: async () => ({
      data: {
        id: CONNECTION_ID,
        branch_id: BRANCH_ID,
        branch_key: "فرع الملقا",
        branch_name: "فرع الملقا",
        telegram_chat_id: null,
        telegram_chat_title: null,
        connected_at: null,
        last_message_at: null,
        active: true,
        connect_code_expires_at: "2026-11-26T08:24:00.000Z",
        created_at: "2026-11-26T08:00:00.000Z",
        updated_at: "2026-11-26T08:14:00.000Z",
        mutation,
      },
      error: null,
    }),
  };
  return api;
}

mock.module("./server-auth.server", () => ({
  requireWorkspacePermission: async () => ({
    client: { from: query },
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    globalBranchAccess: true,
    allowedBranchIds: [],
  }),
  assertBranchAccess: () => undefined,
}));

const { createTelegramBranchConnectionOnServer } = await import("./compensation-evidence.server");

beforeEach(() => {
  existingConnection = { id: CONNECTION_ID };
  insertedRow = null;
  updatedRow = null;
});

describe("Telegram branch connection codes", () => {
  test("renewing an existing link updates only the columns granted to signed-in users", async () => {
    const result = await createTelegramBranchConnectionOnServer(BRANCH_ID);

    expect(updatedRow).toMatchObject({
      user_id: USER_ID,
      branch_key: "فرع الملقا",
      branch_name: "فرع الملقا",
      active: true,
    });
    expect(updatedRow).not.toHaveProperty("workspace_id");
    expect(updatedRow).not.toHaveProperty("branch_id");
    expect(updatedRow?.["connect_code_hash"]).toMatch(/^[0-9a-f]{64}$/);
    expect(result.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(insertedRow).toBeNull();
  });

  test("creating a new link still stores its workspace and branch", async () => {
    existingConnection = null;

    await createTelegramBranchConnectionOnServer(BRANCH_ID);

    expect(insertedRow).toMatchObject({
      user_id: USER_ID,
      workspace_id: WORKSPACE_ID,
      branch_id: BRANCH_ID,
      branch_key: "فرع الملقا",
      active: true,
    });
    expect(updatedRow).toBeNull();
  });
});
