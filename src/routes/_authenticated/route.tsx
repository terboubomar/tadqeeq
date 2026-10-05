import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { WorkspaceAccessProvider } from "@/components/WorkspaceAccessProvider";
import { loadSupabase } from "@/integrations/supabase/lazy-client";
import { getEmailCodeStatus } from "@/lib/email-signin.functions";
import { needsMfaCode } from "@/lib/mfa";
import { isOpsHost } from "@/lib/ops";
import { NOINDEX } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated")({
  head: () => ({ meta: [NOINDEX] }),
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (isOpsHost(window.location.host)) throw redirect({ to: "/ops" });
    const supabase = await loadSupabase();
    const { data, error } = await supabase.auth.getUser();
    // Come back to the same page after signing in (e.g. an upload link from an AI assistant).
    const back = location.href !== "/" ? { next: location.href } : {};
    if (error || !data.user) throw redirect({ to: "/auth", search: back });
    // Optional two-step sign-in: accounts that turned it on finish the code step on /auth first.
    const { data: levels } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (needsMfaCode(levels)) throw redirect({ to: "/auth", search: back });
    // Password sign-ins also confirm the code emailed to the account (finished on /auth).
    const emailCode = await getEmailCodeStatus().catch(() => ({ needed: false }));
    if (emailCode.needed) throw redirect({ to: "/auth", search: back });
    return { user: data.user };
  },
  component: () => (
    <WorkspaceAccessProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </WorkspaceAccessProvider>
  ),
});
