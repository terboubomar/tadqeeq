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
import { sendJournals } from "@/lib/integrations/connections.functions";
import type { AccountingProvider, SendableEntry } from "@/lib/integrations/sendable";

import { ACCOUNTING_PROVIDER_KEYS, ACCOUNTING_PROVIDERS } from "./providers";
import { useIntegrationStatus } from "./use-integration-status";

interface SendProps {
  periodKey: string;
  periodEnd: string | null;
  journals: BranchJournal[];
  firstNumber: number;
  className?: string;
}

/** One send button per connected accounting system, for people who may send entries. */
export function SendJournalsButtons(props: SendProps) {
  const { can } = useWorkspaceAccess();
  const { data: status } = useIntegrationStatus();
  if (!can("contracts.manage") || !props.journals.length) return null;
  return (
    <>
      {ACCOUNTING_PROVIDER_KEYS.filter((provider) => status?.[provider]).map((provider) => (
        <SendJournalsButton key={provider} provider={provider} {...props} />
      ))}
    </>
  );
}

/** Posts the chosen entries (or all branches) to one connected system, after a confirm. */
function SendJournalsButton({
  provider,
  periodKey,
  periodEnd,
  journals,
  firstNumber,
  className,
}: SendProps & { provider: AccountingProvider }) {
  const { name } = ACCOUNTING_PROVIDERS[provider];
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
      return sendJournals({ data: { provider, periodKey, entries } });
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
    onError: (error) => toast.error(error instanceof Error ? error.message : `تعذّر الإرسال إلى ${name}.`),
  });

  const dated = journals.every((journal) => journal.entry.date ?? periodEnd);

  return (
    <>
      <Button type="button" variant="outline" className={className} disabled={send.isPending || !dated} onClick={() => setConfirming(true)}>
        <Send className="size-4" />
        {send.isPending ? "جارٍ الإرسال…" : `إرسال إلى ${name}`}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إرسال إلى {name}</AlertDialogTitle>
            <AlertDialogDescription>
              سيُرسل <span className="num">{journals.length}</span> {journals.length === 1 ? "قيد" : "قيود"} إلى {name} مباشرة. المُرسل سابقاً لا يتكرر.
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
