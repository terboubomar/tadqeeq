import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { ONBOARDING_STATUS_LABELS } from "@/lib/onboarding";
import { opsCan } from "@/lib/ops";
import { listOpsClients } from "@/lib/ops.functions";
import { ClientRow } from "@/components/OpsClientRow";
import { OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";

export const Route = createFileRoute("/ops/clients")({ component: Clients });

function Clients() {
  const role = useOpsRole();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const q = useQuery({ queryKey: ["ops-clients"], queryFn: () => listOpsClients({ data: {} }), enabled: opsCan(role, "clients") });
  if (!opsCan(role, "clients")) return <OpsDenied />;
  const current = (q.data ?? []).filter((c) => !c.archived);
  const archivedCount = (q.data ?? []).length - current.length;
  const rows = current.filter((c) => {
    const text = `${c.name} ${c.legalName ?? ""} ${c.crNumber ?? ""} ${c.contactEmail ?? ""} ${c.ownerEmail ?? ""}`.toLowerCase();
    return (filter === "all" || c.status === filter) && text.includes(search.toLowerCase());
  });
  return (
    <div>
      <OpsHeader title="العملاء" sub={`${current.length} شركة`}>
        <div className="flex gap-2">
          <Input placeholder="بحث بالاسم، السجل، البريد" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-md border border-input bg-background px-2 text-sm">
            <option value="all">كل الحالات</option>
            {Object.entries(ONBOARDING_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </OpsHeader>
      {archivedCount > 0 ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {archivedCount} عميل مؤرشف في{" "}
          <Link to="/ops/archive" className="font-semibold text-foreground underline underline-offset-4">الأرشيف والمحذوفة</Link>
        </p>
      ) : null}
      {q.isLoading ? <Loader2 className="size-5 animate-spin" /> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : (
        <div className="space-y-2">{rows.map((c) => <ClientRow key={c.workspaceId} c={c} canEdit={role !== "support"} canDelete={role === "owner"} />)}</div>
      )}
    </div>
  );
}
