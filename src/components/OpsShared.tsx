import { createContext, useContext, type ReactNode } from "react";

import type { OpsRole } from "@/lib/ops";

export const OpsRoleContext = createContext<OpsRole | null>(null);
export const useOpsRole = () => useContext(OpsRoleContext);

export function OpsDenied() {
  return <p className="panel mx-auto mt-10 max-w-md p-8 text-center text-sm">دورك لا يسمح بفتح هذا القسم.</p>;
}

export function OpsHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {sub ? <p className="mt-1 text-sm text-muted-foreground">{sub}</p> : null}
      </div>
      {children}
    </div>
  );
}
