import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getMyWorkspaceContext } from "@/lib/workspace-access.functions";
import type { WorkspaceClientContext } from "@/lib/workspace-access.server";
import type { WorkspacePermission } from "@/lib/workspace-access";

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

  if (query.isLoading) {
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
