import { requireWorkspacePermission } from "./server-auth.server";
import { JOURNAL_ACCOUNT_ORDER, type JournalAccountKey } from "./journal-entries";

/** The workspace's chart of accounts for journal entries (migration 0047). */
export type SavedJournalAccounts = Partial<Record<JournalAccountKey, { code: string; name: string }>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the generated types predate migration 0047
type LooseClient = { from: (table: string) => any };

const TABLE_MISSING = "دليل الحسابات يحتاج تحديث قاعدة البيانات (migration 0047).";

function tableError(error: { code?: string; message: string }): Error {
  if (error.code === "42P01" || (/journal_account_settings/.test(error.message) && /does not exist|schema cache/i.test(error.message))) {
    return new Error(TABLE_MISSING);
  }
  return new Error(error.message);
}

export async function getJournalAccountsOnServer(): Promise<SavedJournalAccounts> {
  const { client, workspaceId } = await requireWorkspacePermission("financials.read");
  const { data, error } = await (client as unknown as LooseClient)
    .from("journal_account_settings")
    .select("account_key,account_code,account_name")
    .eq("workspace_id", workspaceId);
  if (error) {
    // Before the migration is run, entries simply use the default account names.
    if (tableError(error).message === TABLE_MISSING) return {};
    throw tableError(error);
  }
  const saved: SavedJournalAccounts = {};
  for (const row of (data ?? []) as Array<{ account_key: JournalAccountKey; account_code: string; account_name: string }>) {
    saved[row.account_key] = { code: row.account_code, name: row.account_name };
  }
  return saved;
}

export async function saveJournalAccountsOnServer(
  accounts: Array<{ key: JournalAccountKey; code: string; name: string }>,
): Promise<SavedJournalAccounts> {
  const { client, workspaceId, userId, actorUserId } = await requireWorkspacePermission("contracts.manage");
  const known = new Set<string>(JOURNAL_ACCOUNT_ORDER);
  const rows = accounts
    .filter((account) => known.has(account.key))
    .map((account) => ({
      workspace_id: workspaceId,
      user_id: userId,
      account_key: account.key,
      account_code: account.code.trim().slice(0, 40),
      account_name: account.name.trim().slice(0, 160),
      updated_by: actorUserId,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length) {
    const { error } = await (client as unknown as LooseClient)
      .from("journal_account_settings")
      .upsert(rows, { onConflict: "workspace_id,account_key" });
    if (error) throw tableError(error);
  }
  return getJournalAccountsOnServer();
}
