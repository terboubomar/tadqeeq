import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getMyWorkspaceContext } from "@/lib/workspace-access.functions";
import type { WorkspaceClientContext } from "@/lib/workspace-access.server";
import type { WorkspacePermission } from "@/lib/workspace-access";
import { EMAIL_CODE_REQUIRED_MESSAGE, MFA_REQUIRED_MESSAGE } from "@/lib/mfa";

interface WorkspaceAccessValue {
  context: WorkspaceClientContext;
  can: (permission: WorkspacePermission) => boolean;
}

const WorkspaceAccessContext = createContext<WorkspaceAccessValue | null>(null);

export function WorkspaceAccessProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["workspace-context"],
    queryFn: () => getMyWorkspaceContext({ data: {} }),
    staleTime: 60_000,
  });

  const value = useMemo<WorkspaceAccessValue | null>(() => {
    if (!query.data) return null;
    const permissions = new Set(query.data.permissions);
    return {
      context: query.data,
      can: (permission) => permissions.has(permission),
    };
  }, [query.data]);

  // The session still needs its sign-in code (e.g. the authenticator app was just turned on):
  // send the user to finish the code step instead of showing an error screen.
  const codeStep =
    query.error instanceof Error &&
    (query.error.message === MFA_REQUIRED_MESSAGE || query.error.message === EMAIL_CODE_REQUIRED_MESSAGE);
  useEffect(() => {
    if (!codeStep) return;
    const next = window.location.pathname + window.location.search;
    window.location.href = `/auth?next=${encodeURIComponent(next)}`;
  }, [codeStep]);

  if (query.isLoading || codeStep) {
    return (
      <div className="grid min-h-screen place-items-center bg-background" dir="rtl">
        <p className="text-sm text-muted-foreground">جارٍ تحميل صلاحيات الحساب…</p>
      </div>
    );
  }

  if (query.error || !value) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4" dir="rtl">
        <div className="panel max-w-md p-7 text-center">
          <h1 className="text-lg font-bold">لا يوجد حساب Tadqeeq نشط</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {query.error instanceof Error
              ? query.error.message
              : "لا توجد مساحة عمل نشطة مرتبطة بهذا المستخدم."}
          </p>
          <Button
            className="mt-5"
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/auth";
            }}
          >
            تسجيل الخروج
          </Button>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceAccessContext.Provider value={value}>
      {children}
    </WorkspaceAccessContext.Provider>
  );
}

export function useWorkspaceAccess(): WorkspaceAccessValue {
  const value = useContext(WorkspaceAccessContext);
  if (!value) {
    throw new Error("WorkspaceAccessProvider is missing.");
  }
  return value;
}
