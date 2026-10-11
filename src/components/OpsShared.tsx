import { Loader2 } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";

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
import { PageHeader } from "@/components/workspace/PageKit";
import type { OpsRole } from "@/lib/ops";

export const OpsRoleContext = createContext<OpsRole | null>(null);
export const useOpsRole = () => useContext(OpsRoleContext);

export function OpsDenied() {
  return <p className="panel mx-auto mt-10 max-w-md p-8 text-center text-sm">دورك لا يسمح بفتح هذا القسم.</p>;
}

/** Ops page header in the app's PageHeader style; `children` sit at the end (search, filters, commands). */
export function OpsHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <PageHeader title={title} subtitle={sub} aside={children} />
    </div>
  );
}

/** The app's confirm dialog for destructive ops actions (instead of the browser's confirm box). */
export function OpsConfirm({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(value) => !value && onCancel()}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-start">{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription className="text-start">{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:justify-start">
          <AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            aria-busy={busy}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
