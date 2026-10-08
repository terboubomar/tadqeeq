import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronDown, Loader2, Pencil, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { WORKSPACE_ROLE_LABELS } from "@/lib/workspace-access";
import { companiesLabel } from "@/lib/workspace-labels";
import {
  createAccountWorkspace,
  listMyWorkspaces,
  renameAccountWorkspace,
  switchMyWorkspace,
} from "@/lib/workspace-management.functions";

const WORKSPACES_KEY = ["account-workspaces"];
const CHANNEL = "tadqeeq-workspace";
const SWITCHED_NOTE = "tadqeeq-workspace-switched";

/** Tells the other open tabs which company this browser now works in. */
function announceSwitch(workspaceId: string) {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ workspaceId });
    channel.close();
  } catch {
    // Older browsers: the focus check below still catches the change.
  }
}

/** Reloads a tab whose company changed elsewhere, so it never shows one company while saving to another. */
function reloadInto(note: string) {
  try {
    sessionStorage.setItem(SWITCHED_NOTE, note);
  } catch {
    // Storage blocked: reload without the note.
  }
  window.location.assign("/dashboard");
}

function useWorkspaceTabSync(currentWorkspaceId: string) {
  const queryClient = useQueryClient();
  const lastCheck = useRef(0);

  useEffect(() => {
    try {
      const note = sessionStorage.getItem(SWITCHED_NOTE);
      if (note) {
        sessionStorage.removeItem(SWITCHED_NOTE);
        toast.info(note);
      }
    } catch {
      // Storage blocked: nothing to show.
    }

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (event: MessageEvent<{ workspaceId?: string }>) => {
        if (event.data?.workspaceId && event.data.workspaceId !== currentWorkspaceId) {
          reloadInto("تم تحديث الصفحة لأنك غيّرت الشركة في نافذة أخرى.");
        }
      };
    } catch {
      channel = null;
    }

    async function checkOnReturn() {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck.current < 10_000) return;
      lastCheck.current = Date.now();
      try {
        const list = await queryClient.fetchQuery({ queryKey: WORKSPACES_KEY, queryFn: () => listMyWorkspaces({ data: {} }), staleTime: 0 });
        const active = list.find((workspace) => workspace.active);
        if (active && active.id !== currentWorkspaceId) {
          reloadInto("تم تحديث الصفحة لأن الشركة الحالية تغيّرت من نافذة أخرى.");
        }
      } catch {
        // Offline or signed out: the next request will say so.
      }
    }

    document.addEventListener("visibilitychange", checkOnReturn);
    window.addEventListener("focus", checkOnReturn);
    return () => {
      channel?.close();
      document.removeEventListener("visibilitychange", checkOnReturn);
      window.removeEventListener("focus", checkOnReturn);
    };
  }, [currentWorkspaceId, queryClient]);
}

export function WorkspaceSwitcher() {
  const { context } = useWorkspaceAccess();
  const [dialog, setDialog] = useState<null | "create" | "rename">(null);
  const [name, setName] = useState("");
  const queryClient = useQueryClient();
  useWorkspaceTabSync(context.workspaceId);

  const workspaces = useQuery({ queryKey: WORKSPACES_KEY, queryFn: () => listMyWorkspaces({ data: {} }), staleTime: 60_000 });
  const switchWorkspace = useMutation({
    mutationFn: (workspaceId: string) => switchMyWorkspace({ data: { workspaceId } }),
    onSuccess: (workspaceId) => {
      announceSwitch(workspaceId);
      window.location.assign("/dashboard");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر تغيير الشركة."),
  });
  const createWorkspace = useMutation({
    mutationFn: (workspaceName: string) => createAccountWorkspace({ data: { name: workspaceName } }),
    onSuccess: (workspaceId) => {
      setName("");
      announceSwitch(workspaceId);
      window.location.assign("/dashboard");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر إنشاء الشركة."),
  });
  const renameWorkspace = useMutation({
    mutationFn: (workspaceName: string) => renameAccountWorkspace({ data: { workspaceId: context.workspaceId, name: workspaceName } }),
    onSuccess: async () => {
      setDialog(null);
      await queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY });
      toast.success("تم تغيير اسم الشركة.");
      window.location.reload();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر تغيير اسم الشركة."),
  });

  const list = workspaces.data ?? [];
  const isOwner = context.role === "owner";
  const canCreate = isOwner && !context.trial && context.planId !== null &&
    (context.workspaceLimit === null || context.workspaceCount < context.workspaceLimit);
  const allowance = context.trial || context.planId === null
    ? "إضافة شركة متاحة بعد تفعيل الاشتراك"
    : context.workspaceLimit === null
      ? `${companiesLabel(context.workspaceCount)} · بلا حدود في باقتك`
      : `${context.workspaceCount} من ${context.workspaceLimit} في باقتك`;

  function openDialog(kind: "create" | "rename") {
    setName(kind === "rename" ? context.workspaceName : "");
    setDialog(kind);
  }

  function submit() {
    const value = name.trim();
    if (!value) return;
    if (dialog === "create" && !createWorkspace.isPending) createWorkspace.mutate(value);
    if (dialog === "rename" && !renameWorkspace.isPending) renameWorkspace.mutate(value);
  }

  // The trial is account-level: no switcher, unless the person also belongs to another company.
  if (context.trial && list.length <= 1) return null;

  const pending = createWorkspace.isPending || renameWorkspace.isPending;

  return (
    <>
      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 max-w-[210px] gap-1.5 bg-card px-2.5 font-medium" aria-label="تغيير الشركة">
            <Building2 className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">{context.workspaceName}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 text-start">
          <DropdownMenuLabel className="pb-0.5 text-xs text-muted-foreground">الشركات</DropdownMenuLabel>
          <p className="px-2 pb-2 text-[11px] text-muted-foreground">{allowance}</p>
          <DropdownMenuSeparator />
          {workspaces.isLoading ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> جارٍ التحميل…</div>
          ) : list.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              disabled={workspace.active || switchWorkspace.isPending}
              onSelect={() => switchWorkspace.mutate(workspace.id)}
              className="justify-between gap-2 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate">{workspace.name}</span>
                {!workspace.owned ? (
                  <span className="block text-[11px] text-muted-foreground">مدعو · {WORKSPACE_ROLE_LABELS[workspace.role]}</span>
                ) : null}
              </span>
              {workspace.active ? <Check className="size-4 shrink-0 text-primary" /> : null}
            </DropdownMenuItem>
          ))}
          {isOwner ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => openDialog("rename")} className="py-2">
                <Pencil className="size-4" /> تغيير اسم «{context.workspaceName}»
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canCreate} onSelect={() => openDialog("create")} className="py-2 text-primary-text">
                <Plus className="size-4" /> إضافة شركة
              </DropdownMenuItem>
              {!canCreate && !context.trial && context.planId !== null ? (
                <p className="px-2 pb-1 text-[11px] leading-5 text-muted-foreground">وصلت إلى حد الشركات في باقتك. رقِّ الباقة لإضافة المزيد.</p>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader className="text-start sm:text-start">
            <DialogTitle>{dialog === "rename" ? "تغيير اسم الشركة" : "إضافة شركة"}</DialogTitle>
            <DialogDescription>
              {dialog === "rename"
                ? "يظهر الاسم الجديد لكل أعضاء الشركة. البيانات والتقارير لا تتغير."
                : "ستكون بيانات الشركة وملفاتها وتقاريرها منفصلة بالكامل عن الشركات الأخرى، وتشترك في باقة حسابك."}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            maxLength={160}
            placeholder="اسم الشركة أو العلامة التجارية"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
          />
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button variant="ghost" onClick={() => setDialog(null)}>إلغاء</Button>
            <Button disabled={!name.trim() || pending || (dialog === "rename" && name.trim() === context.workspaceName)} onClick={submit}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {dialog === "rename" ? "حفظ الاسم" : "إنشاء الشركة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
