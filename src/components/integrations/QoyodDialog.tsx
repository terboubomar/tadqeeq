import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { connectQoyod, disconnectQoyod } from "@/lib/integrations/qoyod.functions";

import { INTEGRATION_STATUS_KEY, useIntegrationStatus } from "./use-integration-status";

/** Connect Qoyod with its API key, or see and remove the connection. */
export function QoyodDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { can } = useWorkspaceAccess();
  const canManage = can("contracts.manage");
  const queryClient = useQueryClient();
  const { data } = useIntegrationStatus();
  const connection = data?.qoyod ?? null;
  const [apiKey, setApiKey] = useState("");

  const connect = useMutation({
    mutationFn: () => connectQoyod({ data: { apiKey } }),
    onSuccess: (status) => {
      queryClient.setQueryData(INTEGRATION_STATUS_KEY, status);
      setApiKey("");
      toast.success("رُبط قيود.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر الربط."),
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectQoyod({ data: {} }),
    onSuccess: (status) => {
      queryClient.setQueryData(INTEGRATION_STATUS_KEY, status);
      toast.success("فُصل قيود.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر الفصل."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>قيود Qoyod</DialogTitle>
          <DialogDescription>
            {connection ? "أرسل القيود من صفحة القيود المحاسبية." : "من قيود: الإعدادات ‹ الإعدادات العامة ‹ مفتاح API."}
          </DialogDescription>
        </DialogHeader>

        {connection ? (
          <div className="space-y-3">
            <p className="rounded-xl border border-border bg-surface-raised px-3 py-2.5 text-[13px]">
              متصل · المفتاح ينتهي بـ <span className="num font-semibold">{connection.hint}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className="rounded-full">
                <Link to="/journal">القيود المحاسبية</Link>
              </Button>
              {canManage ? (
                <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
                  افصل
                </Button>
              ) : null}
            </div>
          </div>
        ) : canManage ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (apiKey.trim()) connect.mutate();
            }}
          >
            <Input
              type="password"
              dir="ltr"
              autoComplete="off"
              aria-label="مفتاح API من قيود"
              placeholder="مفتاح API"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <Button type="submit" className="w-full rounded-full" disabled={!apiKey.trim() || connect.isPending}>
              {connect.isPending ? "جارٍ التحقق…" : "اربط"}
            </Button>
          </form>
        ) : (
          <p className="text-[13px] text-muted-foreground">يربطه من يملك صلاحية إدارة الحسابات في مساحة العمل.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
