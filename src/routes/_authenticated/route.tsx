import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { WorkspaceAccessProvider } from "@/components/WorkspaceAccessProvider";
import { supabase } from "@/integrations/supabase/client";
import { isOpsHost } from "@/lib/ops";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (isOpsHost(window.location.host)) throw redirect({ to: "/ops" });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
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
