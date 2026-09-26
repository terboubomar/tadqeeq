import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Clipboard, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { copyText, formatTimestamp, TELEGRAM_CONNECTIONS_KEY, useTelegramConnections } from "@/components/compensation/queries";
import { CompHeader } from "@/components/compensation/shared";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  configureTelegramWebhook,
  createTelegramBranchConnection,
  getBranchNameOptions,
  getTelegramIntegrationStatus,
  setTelegramBranchConnectionActive,
} from "@/lib/compensation-evidence.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/compensation/branches")({ component: BranchesPage });

function BranchesPage() {
  const { can } = useWorkspaceAccess();
  const canManage = can("telegram.manage");
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState("");
  const [connectionCode, setConnectionCode] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["telegram-integration-status"],
    queryFn: () => getTelegramIntegrationStatus({ data: {} }),
  });
  const connectionsQuery = useTelegramConnections();
  const branchOptionsQuery = useQuery({
    queryKey: ["branch-name-options"],
    queryFn: () => getBranchNameOptions({ data: {} }),
    enabled: canManage && can("branches.read"),
  });

  const webhookMutation = useMutation({
    mutationFn: () => configureTelegramWebhook({ data: {} }),
    onSuccess: async () => {
      toast.success("تم تفعيل Telegram webhook");
      await queryClient.invalidateQueries({ queryKey: ["telegram-integration-status"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const connectMutation = useMutation({
    mutationFn: (id: string) => createTelegramBranchConnection({ data: { branchId: id } }),
    onSuccess: async (result) => {
      setConnectionCode(result.code);
      setBranchId("");
      toast.success("تم إنشاء رمز ربط صالح لمدة 30 دقيقة");
      await queryClient.invalidateQueries({ queryKey: TELEGRAM_CONNECTIONS_KEY });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setTelegramBranchConnectionActive({ data: { id, active } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TELEGRAM_CONNECTIONS_KEY });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const connections = connectionsQuery.data ?? [];
  const linked = connections.filter((c) => c.active && c.chatId !== null).length;
  const status = statusQuery.data;

  return (
    <div className="space-y-5">
      <CompHeader title="ربط الفروع (Telegram)" sub="قروب خاص لكل فرع يرسل فيه الكاشير فيديو أو صورة الطلب">
        {status?.botUsername ? (
          <span className="num text-sm text-muted-foreground" dir="ltr">
            @{status.botUsername}
          </span>
        ) : null}
      </CompHeader>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">فروع مربوطة</p>
          <p className="num mt-2 text-2xl font-bold">
            {linked} <span className="text-sm font-normal text-muted-foreground">/ {connections.length}</span>
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Telegram Webhook</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-semibold",
                status?.webhookActive ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
              )}
            >
              {statusQuery.isLoading ? "…" : status?.webhookActive ? "فعال" : "غير مفعل"}
            </span>
            {status && !status.webhookActive && canManage ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={webhookMutation.isPending}
                onClick={() => webhookMutation.mutate()}
              >
                تفعيل
              </Button>
            ) : null}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">إعداد البوت</p>
          <p className={cn("mt-2 text-sm font-semibold", status?.configured ? "text-success" : "text-warning")}>
            {statusQuery.isLoading ? "…" : status?.configured ? "المفاتيح مضافة" : "مفاتيح البوت غير مضافة على الخادم"}
          </p>
        </div>
      </section>

      {canManage ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-bold">ربط فرع جديد</h2>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1">
              <span className="text-xs font-semibold text-muted-foreground">اسم الفرع</span>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="mt-2 w-full">
                  <SelectValue placeholder="اختر فرعاً من سجل الفروع" />
                </SelectTrigger>
                <SelectContent>
                  {(branchOptionsQuery.data ?? []).map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button
              type="button"
              disabled={!branchId || connectMutation.isPending}
              onClick={() => connectMutation.mutate(branchId)}
            >
              إنشاء رمز
            </Button>
          </div>
          {connectionCode ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-secondary/60 p-3">
              <code className="text-base font-bold" dir="ltr">
                /connect {connectionCode}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={() => void copyText("/connect " + connectionCode)}>
                <Clipboard className="size-3.5" />
                نسخ
              </Button>
            </div>
          ) : null}
          <ol className="mt-4 list-decimal space-y-1.5 pe-5 text-sm text-muted-foreground">
            <li>أضف البوت مشرفاً في قروب الفرع الخاص.</li>
            <li>اختر الفرع من سجل الفروع واضغط «إنشاء رمز»، ثم أرسل أمر الربط داخل القروب.</li>
            <li>بعدها أي فيديو أو صورة يرسلها الكاشير في القروب يُربط برقم طلبه تلقائياً — حتى بدون كتابة الرقم.</li>
          </ol>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <h2 className="px-5 pt-5 font-bold">الفروع</h2>
        {connectionsQuery.isLoading ? (
          <div className="p-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : connections.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">لم يُربط أي فرع بعد.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 text-start font-medium">الفرع</th>
                  <th className="px-2 py-3 text-start font-medium">القروب</th>
                  <th className="px-2 py-3 text-start font-medium">آخر رسالة</th>
                  <th className="px-2 py-3 text-start font-medium">الحالة</th>
                  {canManage ? <th className="px-2 py-3" /> : null}
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <tr key={c.id} className="border-t border-border/70">
                    <td className="px-5 py-3 font-semibold">{c.branchName}</td>
                    <td className="px-2 text-muted-foreground">{c.chatId ? c.chatTitle || String(c.chatId) : "بانتظار /connect"}</td>
                    <td className="num px-2 text-xs text-muted-foreground">
                      {c.lastMessageAt ? formatTimestamp(c.lastMessageAt) : "—"}
                    </td>
                    <td className="px-2">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          c.active && c.chatId ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {!c.active ? "موقوف" : c.chatId ? "مربوط" : "بانتظار الربط"}
                      </span>
                    </td>
                    {canManage ? (
                      <td className="px-2 text-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={activeMutation.isPending}
                          onClick={() => activeMutation.mutate({ id: c.id, active: !c.active })}
                        >
                          {c.active ? "إيقاف" : "تفعيل"}
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
