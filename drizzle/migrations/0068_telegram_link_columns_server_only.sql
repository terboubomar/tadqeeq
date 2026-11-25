-- 0068: only the server links a branch to a Telegram group.
--
-- Why: the row rules let a member with telegram.manage insert or update any column of their own
-- telegram_branch_chats row, including telegram_chat_id. That links a branch to a group without the
-- /connect code being sent in it. The group link columns are now written only by the Telegram webhook
-- (service role). The app still creates rows, issues connect codes and turns links on or off as the user.
--
-- Must be applied to production. Re-runnable, no data changes, row rules unchanged.

REVOKE INSERT, UPDATE ON public.telegram_branch_chats FROM authenticated;

GRANT INSERT (id, user_id, workspace_id, branch_id, branch_key, branch_name, connect_code_hash,
              connect_code_expires_at, active, created_at, updated_at)
  ON public.telegram_branch_chats TO authenticated;

GRANT UPDATE (user_id, branch_key, branch_name, connect_code_hash, connect_code_expires_at, active, updated_at)
  ON public.telegram_branch_chats TO authenticated;
