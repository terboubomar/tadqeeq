import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { connectAccounting, disconnectAccounting, startSignInConnect } from "@/lib/integrations/connections.functions";
import type { AccountingProvider } from "@/lib/integrations/sendable";

import { ACCOUNTING_PROVIDERS } from "./providers";
import { INTEGRATION_STATUS_KEY, useIntegrationStatus } from "./use-integration-status";

/** Connect an accounting system with its API key (and Daftra's site), or see and remove the connection. */
export function AccountingDialog({
  provider,
  open,
  onOpenChange,
}: {
  provider: AccountingProvider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const config = ACCOUNTING_PROVIDERS[provider];
  const { can } = useWorkspaceAccess();
  const canManage = can("contracts.manage");
  const queryClient = useQueryClient();
  const { data } = useIntegrationStatus();
  const connection = data?.[provider] ?? null;
  const [apiKey, setApiKey] = useState("");
  const [site, setSite] = useState("");
  const [database, setDatabase] = useState("");
  const [login, setLogin] = useState("");
  const ready = Boolean(apiKey.trim()) && (!config.needsSite || Boolean(site.trim())) && (!config.needsLogin || Boolean(login.trim()));

  const signIn = useMutation({
    mutationFn: () => {
      if (provider !== "zoho" && provider !== "quickbooks") throw new Error("هذا النظام يُربط بمفتاح API.");
      return startSignInConnect({ data: { provider } });
    },
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر بدء الربط."),
  });
  const connect = useMutation({
    mutationFn: () => {
      if (provider === "zoho" || provider === "quickbooks") throw new Error(`${config.name} يُربط بتسجيل الدخول.`);
      return connectAccounting({
        data: { provider, apiKey, ...(config.needsSite ? { site } : {}), ...(config.needsLogin ? { database, login } : {}) },
      });
    },
    onSuccess: (status) => {
      queryClient.setQueryData(INTEGRATION_STATUS_KEY, status);
      setApiKey("");
      setSite("");
      setDatabase("");
      setLogin("");
      toast.success(`رُبط ${config.name}.`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر الربط."),
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectAccounting({ data: { provider } }),
    onSuccess: (status) => {
      queryClient.setQueryData(INTEGRATION_STATUS_KEY, status);
      toast.success(`فُصل ${config.name}.`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر الفصل."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{connection ? "أرسل القيود من صفحة القيود المحاسبية." : config.keyHelp}</DialogDescription>
        </DialogHeader>

        {connection ? (
          <div className="space-y-3">
            <p className="rounded-xl border border-border bg-surface-raised px-3 py-2.5 text-[13px]">
              متصل · {config.hintLabel} <span className="num font-semibold">{connection.hint}</span>
              {connection.site && !config.signIn ? (
                <>
                  {" "}
                  · <span dir="ltr" className="num">{connection.site}</span>
                </>
              ) : null}
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
        ) : canManage && config.signIn ? (
          <Button type="button" className="w-full rounded-full" disabled={signIn.isPending} onClick={() => signIn.mutate()}>
            {signIn.isPending ? "جارٍ التحويل…" : provider === "quickbooks" ? "اربط عبر Intuit" : "اربط عبر Zoho"}
          </Button>
        ) : canManage ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (ready) connect.mutate();
            }}
          >
            {config.needsSite ? (
              <Input
                dir="ltr"
                autoComplete="off"
                inputMode="url"
                aria-label={`عنوان موقعك في ${config.name}`}
                placeholder={config.sitePlaceholder}
                value={site}
                onChange={(event) => setSite(event.target.value)}
              />
            ) : null}
            {config.needsLogin ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  dir="ltr"
                  autoComplete="off"
                  aria-label={`اسم الدخول إلى ${config.name}`}
                  placeholder="البريد أو اسم الدخول"
                  value={login}
                  onChange={(event) => setLogin(event.target.value)}
                />
                <Input
                  dir="ltr"
                  autoComplete="off"
                  aria-label={`قاعدة بيانات ${config.name}`}
                  placeholder="قاعدة البيانات (اختياري)"
                  value={database}
                  onChange={(event) => setDatabase(event.target.value)}
                />
              </div>
            ) : null}
            <Input
              type="password"
              dir="ltr"
              autoComplete="off"
              aria-label={`مفتاح API من ${config.name}`}
              placeholder="مفتاح API"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <Button type="submit" className="w-full rounded-full" disabled={!ready || connect.isPending}>
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
