import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Loader2, Plus, Shield, Trash2, UserCheck, UserX } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getWorkspaceMembers,
  inviteWorkspaceMember,
  removeWorkspaceMember,
  setWorkspaceMemberPassword,
  updateWorkspaceMember,
} from "@/lib/workspace-admin.functions";
import type {
  WorkspaceMemberRecord,
  WorkspaceMembersBundle,
} from "@/lib/workspace-admin.server";
import {
  ASSIGNABLE_WORKSPACE_ROLES,
  ROLE_PERMISSIONS,
  WORKSPACE_ROLE_LABELS,
  roleHasGlobalBranchAccess,
  type WorkspaceRole,
} from "@/lib/workspace-access";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "المستخدمون والصلاحيات · تدقيق" },
      {
        name: "description",
        content: "إدارة مستخدمي Tadqeeq والأدوار وصلاحيات الفروع.",
      },
    ],
  }),
  component: TeamPage,
});

type AssignableRole = Exclude<WorkspaceRole, "owner">;

function TeamPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["workspace-members"],
    queryFn: () => getWorkspaceMembers({ data: {} }),
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AssignableRole>("compensation");
  const [branchIds, setBranchIds] = useState<string[]>([]);

  const invite = useMutation({
    mutationFn: () =>
      inviteWorkspaceMember({
        data: { fullName, email, password, role, branchIds },
      }),
    onSuccess: async () => {
      toast.success("تمت إضافة المستخدم — يمكنه تسجيل الدخول الآن.");
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("compensation");
      setBranchIds([]);
      setInviteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ تحميل المستخدمين…</p>;
  }

  if (error || !data) {
    return (
      <div className="panel p-6">
        <h1 className="text-lg font-bold">تعذّر تحميل المستخدمين</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "أعد المحاولة."}
        </p>
      </div>
    );
  }

  const restricted = !roleHasGlobalBranchAccess(role);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="audit-heading">المستخدمون والصلاحيات</h1>
          <p className="audit-subtitle">
            لكل موظف تسجيل دخول مستقل، ودور واضح، ونطاق فروع عند الحاجة.
          </p>
        </div>
        <Button onClick={() => setInviteOpen((value) => !value)}>
          <Plus className="size-4" />
          إضافة مستخدم
        </Button>
      </header>

      {inviteOpen ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">إضافة مستخدم</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            يُنشأ الحساب مباشرة بكلمة المرور التي تحددها. إذا كان البريد مسجلاً مسبقاً يُربط الحساب ويحتفظ بكلمة مروره.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">الاسم الكامل</span>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">البريد الإلكتروني</span>
              <Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">كلمة المرور (8 أحرف على الأقل)</span>
              <Input dir="ltr" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">الدور</span>
              <Select
                value={role}
                onValueChange={(value) => {
                  const next = value as AssignableRole;
                  setRole(next);
                  if (roleHasGlobalBranchAccess(next)) setBranchIds([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_WORKSPACE_ROLES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {WORKSPACE_ROLE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">نطاق الدور</p>
              <p className="mt-1 leading-5">{roleSummary(role)}</p>
            </div>
          </div>

          {restricted ? (
            <BranchPicker
              branches={data.branches}
              selected={branchIds}
              onChange={setBranchIds}
              className="mt-4"
            />
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              إلغاء
            </Button>
            <Button
              disabled={invite.isPending || !fullName.trim() || !email.trim() || password.length < 8 || (restricted && branchIds.length === 0)}
              onClick={() => invite.mutate()}
            >
              {invite.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              إضافة المستخدم
            </Button>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{data.members.length} مستخدم</p>
        </div>
        <div className="divide-y divide-border">
          {data.members.map((member) => (
            <MemberRow key={member.id} member={member} data={data} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MemberRow({
  member,
  data,
}: {
  member: WorkspaceMemberRecord;
  data: WorkspaceMembersBundle;
}) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<AssignableRole>(
    member.role === "owner" ? "admin" : member.role,
  );
  const [branchIds, setBranchIds] = useState(member.branchIds);

  const update = useMutation({
    mutationFn: (status: "active" | "suspended") =>
      updateWorkspaceMember({
        data: {
          membershipId: member.id,
          role,
          status,
          branchIds,
        },
      }),
    onSuccess: async () => {
      toast.success("تم تحديث صلاحيات المستخدم.");
      await queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () =>
      removeWorkspaceMember({ data: { membershipId: member.id } }),
    onSuccess: async () => {
      toast.success("تمت إزالة المستخدم من حساب الشركة.");
      await queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPassword = useMutation({
    mutationFn: (password: string) =>
      setWorkspaceMemberPassword({ data: { membershipId: member.id, password } }),
    onSuccess: () => toast.success("تم تعيين كلمة المرور — يمكنه تسجيل الدخول الآن."),
    onError: (e: Error) => toast.error(e.message),
  });

  const isOwner = member.role === "owner";
  const restricted = !roleHasGlobalBranchAccess(role);
  const branchNames = useMemo(
    () =>
      member.branchIds
        .map((id) => data.branches.find((branch) => branch.id === id)?.name)
        .filter(Boolean)
        .join("، "),
    [data.branches, member.branchIds],
  );

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[220px]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{member.fullName || "بدون اسم"}</p>
            {member.isCurrentUser ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">أنت</span>
            ) : null}
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px]">
              {WORKSPACE_ROLE_LABELS[member.role]}
            </span>
            <span
              className={
                "rounded-full px-2 py-0.5 text-[10px] " +
                (member.status === "active"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-muted text-muted-foreground")
              }
            >
              {member.status === "active" ? "نشط" : member.status === "suspended" ? "موقوف" : "مدعو"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
            {member.email || "—"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {roleHasGlobalBranchAccess(member.role)
              ? "كل الفروع"
              : branchNames || "لا توجد فروع مخصصة"}
          </p>
        </div>

        {!isOwner && !member.isCurrentUser ? (
          <div className="flex flex-1 flex-col gap-3 md:max-w-[620px]">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={role}
                onValueChange={(value) => {
                  const next = value as AssignableRole;
                  setRole(next);
                  if (roleHasGlobalBranchAccess(next)) setBranchIds([]);
                }}
              >
                <SelectTrigger className="w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_WORKSPACE_ROLES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {WORKSPACE_ROLE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={update.isPending || (restricted && branchIds.length === 0)}
                onClick={() => update.mutate("active")}
              >
                <Shield className="size-3.5" />
                حفظ الصلاحيات
              </Button>
              {member.status === "active" ? (
                <Button size="sm" variant="outline" onClick={() => update.mutate("suspended")}>
                  <UserX className="size-3.5" />
                  إيقاف
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => update.mutate("active")}>
                  <UserCheck className="size-3.5" />
                  إعادة تفعيل
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={setPassword.isPending}
                onClick={() => {
                  const next = window.prompt("كلمة المرور الجديدة (8 أحرف على الأقل):");
                  if (next === null) return;
                  if (next.length < 8) {
                    toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");
                    return;
                  }
                  setPassword.mutate(next);
                }}
              >
                <KeyRound className="size-3.5" />
                تعيين كلمة المرور
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm("إزالة هذا المستخدم من حساب الشركة؟")) remove.mutate();
                }}
              >
                <Trash2 className="size-3.5" />
                إزالة
              </Button>
            </div>
            {restricted ? (
              <BranchPicker
                branches={data.branches}
                selected={branchIds}
                onChange={setBranchIds}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BranchPicker({
  branches,
  selected,
  onChange,
  className = "",
}: {
  branches: WorkspaceMembersBundle["branches"];
  selected: string[];
  onChange: (value: string[]) => void;
  className?: string;
}) {
  const active = branches.filter((branch) => branch.active);
  return (
    <div className={className}>
      <p className="mb-2 text-xs font-medium">الفروع المسموحة</p>
      {active.length ? (
        <div className="flex flex-wrap gap-2">
          {active.map((branch) => {
            const checked = selected.includes(branch.id);
            return (
              <label
                key={branch.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? selected.filter((id) => id !== branch.id)
                        : [...selected, branch.id],
                    )
                  }
                />
                {branch.name}
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-destructive">
          لا توجد فروع بعد. تُضاف الفروع تلقائياً عند رفع ملفات أي منصة، أو عند ربط فرع بـ Telegram.
        </p>
      )}
    </div>
  );
}

function roleSummary(role: WorkspaceRole): string {
  if (role === "owner") return "صلاحية كاملة وإدارة المالك.";
  if (role === "admin") return "إدارة تشغيلية كاملة، بما فيها المستخدمون والإعدادات.";
  if (role === "auditor") return "التدقيق، التقارير، العقود، الاستثناءات، التعويضات والاسترداد.";
  if (role === "compensation") return "التعويضات وTelegram والاسترداد للفروع المخصصة.";
  if (role === "branch_manager") return "قراءة تقارير وأدلة وتعويضات الفروع المخصصة فقط.";
  const count = ROLE_PERMISSIONS.viewer.length;
  return "قراءة فقط للأقسام المسموحة (" + count + " صلاحيات قراءة).";
}
