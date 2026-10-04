import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { WorkspaceAccessProvider } from "@/components/WorkspaceAccessProvider";
import { supabase } from "@/integrations/supabase/client";
import { isOpsHost } from "@/lib/ops";
import { NOINDEX } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated")({
  head: () => ({ meta: [NOINDEX] }),
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (isOpsHost(window.location.host)) throw redirect({ to: "/ops" });
    const { data, error } = await supabase.auth.getUser();
    // Come back to the same page after signing in (e.g. an upload link from an AI assistant).
    if (error || !data.user) throw redirect({ to: "/auth", search: location.href !== "/" ? { next: location.href } : {} });
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
