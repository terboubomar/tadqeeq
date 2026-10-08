import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { createAccountWorkspace, listMyWorkspaces, switchMyWorkspace } from "@/lib/workspace-management.functions";

export function WorkspaceSwitcher() {
  const { context } = useWorkspaceAccess();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const workspaces = useQuery({ queryKey: ["account-workspaces"], queryFn: () => listMyWorkspaces({ data: {} }), staleTime: 60_000, enabled: !context.trial });
  const switchWorkspace = useMutation({
    mutationFn: (workspaceId: string) => switchMyWorkspace({ data: { workspaceId } }),
    onSuccess: () => window.location.assign("/dashboard"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر تغيير مساحة العمل."),
  });
  const createWorkspace = useMutation({
    mutationFn: (workspaceName: string) => createAccountWorkspace({ data: { name: workspaceName } }),
    onSuccess: () => window.location.assign("/dashboard"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر إنشاء مساحة العمل."),
  });

  const canCreate = context.role === "owner" && !context.trial && context.planId !== null &&
    (context.workspaceLimit === null || context.workspaceCount < context.workspaceLimit);
  const allowance = context.trial
    ? "تتوفر مساحات العمل بعد تفعيل الاشتراك"
    : context.workspaceLimit === null
      ? `${context.workspaceCount} مساحة · بلا حدود`
      : `${context.workspaceCount} من ${context.workspaceLimit} مساحة`;

  function submit() {
    const value = name.trim();
    if (value && !createWorkspace.isPending) createWorkspace.mutate(value);
  }

  // The trial is account-level and has no customer-facing workspace entitlement.
  if (context.trial) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 max-w-[210px] gap-1.5 bg-card px-2.5 font-medium" aria-label="تغيير مساحة العمل">
            <Building2 className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">{context.workspaceName}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 text-right">
          <DropdownMenuLabel className="pb-0.5 text-xs text-muted-foreground">مساحات العمل</DropdownMenuLabel>
          <p className="px-2 pb-2 text-[11px] text-muted-foreground">{allowance}</p>
          <DropdownMenuSeparator />
          {workspaces.isLoading ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> جارٍ التحميل…</div>
          ) : (workspaces.data ?? []).map((workspace) => (
            <DropdownMenuItem key={workspace.id} disabled={workspace.active || switchWorkspace.isPending} onSelect={() => switchWorkspace.mutate(workspace.id)} className="justify-between py-2">
              <span className="min-w-0 truncate">{workspace.name}</span>
              {workspace.active ? <Check className="size-4 text-primary" /> : null}
            </DropdownMenuItem>
          ))}
          {context.role === "owner" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!canCreate} onSelect={() => setDialogOpen(true)} className="py-2 text-primary-text">
                <Plus className="size-4" /> إضافة شركة
              </DropdownMenuItem>
              {!canCreate ? <p className="px-2 pb-1 text-[11px] leading-5 text-muted-foreground">{context.trial ? "فعّل اشتراكك أولاً لإضافة شركة." : "وصلت إلى عدد مساحات العمل في باقتك."}</p> : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>إضافة شركة</DialogTitle>
            <DialogDescription>ستكون بيانات الشركة وملفاتها وتقاريرها منفصلة بالكامل عن مساحات العمل الأخرى.</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={name} maxLength={160} placeholder="اسم الشركة أو العلامة التجارية" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} />
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button disabled={!name.trim() || createWorkspace.isPending} onClick={submit}>
              {createWorkspace.isPending ? <Loader2 className="size-4 animate-spin" /> : null} إنشاء مساحة العمل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
