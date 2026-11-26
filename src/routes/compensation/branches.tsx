import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Clipboard, Loader2, Plus, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { copyText, TELEGRAM_CONNECTIONS_KEY, useTelegramConnections } from "@/components/compensation/queries";
import { CompHeader, Timestamp } from "@/components/compensation/shared";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import {
  configureTelegramWebhook,
  createBranchWithTelegramConnection,
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
  const canAddBranch = canManage && can("branches.manage");
  const [mode, setMode] = useState<"new" | "existing">(canAddBranch ? "new" : "existing");
  const [branchId, setBranchId] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [connectionCode, setConnectionCode] = useState<{ code: string; branchName: string } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

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
      setConnectionCode({ code: result.code, branchName: result.connection.branchName });
      setBranchId("");
      setPanelOpen(true);
      toast.success("تم إنشاء رمز ربط صالح لمدة 30 دقيقة");
      await queryClient.invalidateQueries({ queryKey: TELEGRAM_CONNECTIONS_KEY });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createBranchMutation = useMutation({
    mutationFn: (name: string) => createBranchWithTelegramConnection({ data: { name } }),
    onSuccess: async (result) => {
      setConnectionCode({ code: result.code, branchName: result.branch.name });
      setNewBranchName("");
      toast.success("تمت إضافة الفرع وإنشاء رمز الربط");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TELEGRAM_CONNECTIONS_KEY }),
        queryClient.invalidateQueries({ queryKey: ["branch-name-options"] }),
      ]);
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

  const share = connections.length ? Math.round((linked / connections.length) * 100) : 0;
  const systemReady = Boolean(status?.configured && status.webhookActive);
  const openPanel = () => {
    setConnectionCode(null);
    setPanelOpen(true);
  };

  return (
    <div className="space-y-5">
      <CompHeader title="ربط الفروع (Telegram)" sub="قروب خاص لكل فرع يرسل فيه الكاشير فيديو أو صورة الطلب">
        {status?.botUsername ? (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-[12.5px] text-muted-foreground">
            <Send className="size-3.5 text-primary-text" />
            <span className="font-mono" dir="ltr">@{status.botUsername}</span>
          </span>
        ) : null}
        {canManage ? (
          <Button type="button" size="sm" onClick={openPanel}>
            <Plus className="size-4" />
            إضافة أو ربط فرع
          </Button>
        ) : null}
      </CompHeader>

      <section aria-label="تقدم الربط" className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm">
            <span className="num text-2xl font-bold">{linked}</span>{" "}
            <span className="text-muted-foreground">
              من <span className="num">{connections.length}</span> فروع مربوطة
            </span>
          </p>
          <p className={cn("text-xs font-semibold", statusQuery.isLoading ? "text-muted-foreground" : systemReady ? "text-success" : "text-warning")}>
            {statusQuery.isLoading ? "…" : systemReady ? "✓ Telegram جاهز لاستقبال الأدلة" : "Telegram يحتاج إعداداً"}
          </p>
        </div>
        <div aria-hidden className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-2 rounded-full bg-success transition-[width]" style={{ width: `${share}%` }} />
        </div>
        {status && !systemReady ? (
          <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <span>
              {!status.configured ? "مفاتيح البوت غير مضافة على الخادم." : "Telegram webhook غير مفعل، فلن تصل الأدلة."}
            </span>
            {status.configured && !status.webhookActive && canManage ? (
              <Button type="button" size="sm" variant="outline" disabled={webhookMutation.isPending} onClick={() => webhookMutation.mutate()}>
                تفعيل
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="branches-list" className="overflow-hidden rounded-xl border border-border bg-card">
        <h2 id="branches-list" className="px-4 pt-4 font-bold sm:px-5">
          الفروع
        </h2>
        {connectionsQuery.isLoading ? (
          <div className="p-6">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        ) : connections.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">لم يُربط أي فرع بعد.</p>
            {canManage ? (
              <Button type="button" size="sm" className="mt-3" onClick={openPanel}>
                <Plus className="size-4" />
                اربط أول فرع
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border/70 border-t border-border">
            {connections.map((c) => {
              const isLinked = c.active && c.chatId !== null;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full",
                      isLinked ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isLinked ? <Check className="size-4" /> : <Send className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{c.branchName}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {c.chatId ? c.chatTitle || String(c.chatId) : "بانتظار أمر الربط في القروب"}
                      {c.lastMessageAt ? (
                        <>
                          {" · آخر دليل "}
                          <Timestamp value={c.lastMessageAt} />
                        </>
                      ) : null}
                    </span>
                  </span>
                  <ConnectionBadge active={c.active} linked={Boolean(c.chatId)} />
                  {canManage ? (
                    <div className="flex w-full justify-end gap-2 sm:w-auto">
                      {!c.chatId || !c.active ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={connectMutation.isPending}
                          onClick={() => connectMutation.mutate(c.branchId)}
                        >
                          اربط
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={activeMutation.isPending}
                        onClick={() => activeMutation.mutate({ id: c.id, active: !c.active })}
                      >
                        {c.active ? "إيقاف" : "تفعيل"}
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        {/* Opens from the left, the end side in RTL. */}
        <SheetContent
          side="left"
          dir="rtl"
          className="flex w-full flex-col gap-5 overflow-y-auto p-5 sm:max-w-md [&>button]:left-4 [&>button]:right-auto"
        >
          <SheetHeader className="space-y-1 p-0 pe-8 text-start">
            <SheetTitle className="text-start">{connectionCode ? "أرسل أمر الربط في القروب" : "إضافة أو ربط فرع"}</SheetTitle>
            <SheetDescription className="text-start text-xs">
              {connectionCode ? `قروب ${connectionCode.branchName} · الرمز صالح 30 دقيقة` : "قروب Telegram خاص لكل فرع"}
            </SheetDescription>
          </SheetHeader>

          {connectionCode ? (
            <div className="rounded-lg border border-primary/30 bg-secondary/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <code className="text-lg font-bold" dir="ltr">
                  /connect {connectionCode.code}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={() => void copyText("/connect " + connectionCode.code)}>
                  <Clipboard className="size-3.5" />
                  نسخ
                </Button>
              </div>
            </div>
          ) : canManage ? (
            <div className="space-y-4">
              <div role="tablist" aria-label="نوع الفرع" className="flex rounded-lg bg-muted p-1">
                {canAddBranch ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "new"}
                    onClick={() => setMode("new")}
                    className={cn("flex-1 rounded-md px-3 py-1.5 text-xs", mode === "new" ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
                  >
                    فرع جديد
                  </button>
                ) : null}
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "existing"}
                  onClick={() => setMode("existing")}
                  className={cn("flex-1 rounded-md px-3 py-1.5 text-xs", mode === "existing" ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
                >
                  فرع موجود
                </button>
              </div>

              {mode === "new" && canAddBranch ? (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (newBranchName.trim()) createBranchMutation.mutate(newBranchName.trim());
                  }}
                >
                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground">اسم الفرع الجديد</span>
                    <Input
                      value={newBranchName}
                      onChange={(event) => setNewBranchName(event.target.value)}
                      placeholder="مثال: فرع الملقا"
                      className="mt-2"
                      maxLength={160}
                    />
                  </label>
                  <Button type="submit" className="w-full" disabled={!newBranchName.trim() || createBranchMutation.isPending} aria-busy={createBranchMutation.isPending}>
                    {createBranchMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    إضافة الفرع وإنشاء رمز
                  </Button>
                </form>
              ) : (
                <div className="space-y-3">
                  <label className="block">
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
                    className="w-full"
                    disabled={!branchId || connectMutation.isPending}
                    onClick={() => connectMutation.mutate(branchId)}
                    aria-busy={connectMutation.isPending}
                  >
                    {connectMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    إنشاء رمز
                  </Button>
                </div>
              )}
              {!canAddBranch ? <p className="text-xs text-muted-foreground">إضافة فروع جديدة متاحة للمالك والمدير فقط.</p> : null}
            </div>
          ) : null}

          <ol className="space-y-2 text-sm">
            {[
              "أضف البوت مشرفاً في قروب الفرع الخاص.",
              connectionCode ? "أرسل أمر الربط أعلاه داخل القروب." : "أنشئ رمز الربط، ثم أرسل الأمر داخل القروب.",
              "بعدها أي فيديو أو صورة يرسلها الكاشير يُربط برقم طلبه تلقائياً.",
            ].map((text, index) => (
              <li key={text} className="flex gap-2.5">
                <span className="num flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs text-muted-foreground">
                  {index + 1}
                </span>
                <span className="text-muted-foreground">{text}</span>
              </li>
            ))}
          </ol>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ConnectionBadge({ active, linked }: { active: boolean; linked: boolean }) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
        active && linked ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
      )}
    >
      {!active ? "موقوف" : linked ? "مربوط" : "بانتظار الربط"}
    </span>
  );
}
