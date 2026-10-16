import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { entryReference } from "@/components/journal/accounting-formats";
import type { BranchJournal } from "@/components/journal/journal-export";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { SendableEntry } from "@/lib/integrations/qoyod";
import { sendJournalsToQoyod } from "@/lib/integrations/qoyod.functions";

import { useIntegrationStatus } from "./use-integration-status";

/** Shown on the journal page once Qoyod is connected: posts the chosen entries (or all branches) to Qoyod. */
export function SendToQoyodButton({
  periodKey,
  periodEnd,
  journals,
  firstNumber,
  className,
}: {
  periodKey: string;
  periodEnd: string | null;
  journals: BranchJournal[];
  firstNumber: number;
  className?: string;
}) {
  const { can } = useWorkspaceAccess();
  const { data: status } = useIntegrationStatus();
  const [confirming, setConfirming] = useState(false);

  const send = useMutation({
    mutationFn: () => {
      const entries: SendableEntry[] = journals.map((journal, index) => ({
        key: journal.costCenterKey ?? journal.branch,
        reference: entryReference(journal.entry, firstNumber + index),
        description: journal.entry.description,
        date: (journal.entry.date ?? periodEnd ?? "").slice(0, 10),
        lines: journal.entry.lines.map((line) => ({
          code: line.account.code,
          name: line.account.name,
          debit: line.debit,
          credit: line.credit,
          memo: line.memo,
        })),
      }));
      return sendJournalsToQoyod({ data: { periodKey, entries } });
    },
    onSuccess: (result) => {
      const parts = [
        result.sent ? `أُرسل ${result.sent}` : "",
        result.skipped ? `${result.skipped} مُرسل سابقاً` : "",
        result.failed.length ? `تعذّر ${result.failed.length}` : "",
      ].filter(Boolean);
      const summary = parts.join(" · ") || "لا شيء للإرسال";
      if (result.failed.length) toast.error(summary, { description: result.failed[0]?.message });
      else toast.success(summary);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر الإرسال إلى قيود."),
  });

  if (!status?.qoyod || !can("contracts.manage") || !journals.length) return null;
  const dated = journals.every((journal) => journal.entry.date ?? periodEnd);

  return (
    <>
      <Button type="button" variant="outline" className={className} disabled={send.isPending || !dated} onClick={() => setConfirming(true)}>
        <Send className="size-4" />
        {send.isPending ? "جارٍ الإرسال…" : "إرسال إلى قيود"}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إرسال إلى قيود</AlertDialogTitle>
            <AlertDialogDescription>
              سيُرسل <span className="num">{journals.length}</span> {journals.length === 1 ? "قيد" : "قيود"} إلى قيود مباشرة. المُرسل سابقاً لا يتكرر.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => send.mutate()}>إرسال</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
