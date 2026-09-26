import { createFileRoute } from "@tanstack/react-router";

import { CompensationFileScanner } from "@/components/CompensationFileScanner";
import { formatTimestamp } from "@/components/compensation/queries";
import { CompHeader, EvidenceActions } from "@/components/compensation/shared";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";

export const Route = createFileRoute("/compensation/scanner")({ component: ScannerPage });

function ScannerPage() {
  const { can } = useWorkspaceAccess();
  return (
    <div>
      <CompHeader
        title="فحص ملف التعويضات"
        sub="ارفع ملف تعويضات المنصة لمطابقة كل طلب مع أدلة الفروع"
      />
      <CompensationFileScanner
        renderEvidence={(item) => (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {item.branchName} · {formatTimestamp(item.capturedAt)}
            </span>
            {can("telegram.read") ? <EvidenceActions id={item.id} /> : null}
          </div>
        )}
      />
    </div>
  );
}
