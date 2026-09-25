import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { Button } from "@/components/ui/button";
import {
  ONBOARDING_STATUS_LABELS,
  type OnboardingRecord,
  type OnboardingStatus,
} from "@/lib/onboarding";
import { listTenants, setTenantStatus } from "@/lib/onboarding.functions";

export const Route = createFileRoute("/_authenticated/tenants")({
  head: () => ({
    meta: [
      { title: "إدارة العملاء · تدقيق" },
      { name: "description", content: "متابعة تسجيل الشركات الجديدة وتفعيل حساباتها." },
      { property: "og:title", content: "إدارة العملاء · تدقيق" },
      { property: "og:description", content: "متابعة تسجيل الشركات الجديدة وتفعيل حساباتها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TenantsPage,
});

function TenantsPage() {
  const { context } = useWorkspaceAccess();
  const query = useQuery({
    queryKey: ["tenants"],
    queryFn: () => listTenants({ data: {} }),
    enabled: context.isPlatformAdmin,
  });

  if (!context.isPlatformAdmin) {
    return <p className="panel mx-auto mt-10 max-w-md p-8 text-center">هذه الصفحة لمالك المنصة فقط.</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">إدارة العملاء</h1>
        <p className="text-sm text-muted-foreground">الشركات المسجلة، بياناتها، ومواعيد اجتماعاتها وحالة التفعيل.</p>
      </div>
      {query.isLoading ? (
        <Loader2 className="size-5 animate-spin" />
      ) : query.error ? (
        <p className="text-sm text-destructive">{(query.error as Error).message}</p>
      ) : (
        <div className="grid gap-3">
          {(query.data ?? []).map((t) => (
            <TenantCard key={t.workspaceId} tenant={t} isSelf={t.workspaceId === context.workspaceId} />
          ))}
        </div>
      )}
    </div>
  );
}

function formatRiyadh(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    timeZone: "Asia/Riyadh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

const ACTIONS: Array<{ status: OnboardingStatus; label: string }> = [
  { status: "awaiting_payment", label: "تم الاتفاق — بانتظار التحويل" },
  { status: "onboarding", label: "تم استلام التحويل — بدء التهيئة" },
  { status: "active", label: "تفعيل الحساب" },
  { status: "suspended", label: "إيقاف" },
];

function TenantCard({ tenant, isSelf }: { tenant: OnboardingRecord; isSelf: boolean }) {
  const queryClient = useQueryClient();
  const mutate = useMutation({
    mutationFn: (status: OnboardingStatus) =>
      setTenantStatus({ data: { workspaceId: tenant.workspaceId, status } }),
    onSuccess: async () => {
      toast.success("تم تحديث حالة الشركة.");
      await queryClient.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows: Array<[string, string | number | null]> = [
    ["الاسم القانوني", tenant.legalName],
    ["السجل التجاري", tenant.crNumber],
    ["الرقم الضريبي", tenant.vatNumber],
    ["عدد الفروع", tenant.branchCount],
    ["المسؤول", tenant.contactName],
    ["الجوال", tenant.contactMobile],
    ["الهوية/الإقامة", tenant.contactNationalId],
    ["البريد", tenant.contactEmail],
    ["الاجتماع", formatRiyadh(tenant.meetingAt)],
    ["ملاحظة العميل", tenant.meetingNote],
  ];

  return (
    <article className="panel p-5">
      <div className="flex flex-wrap items-center gap-3">
        {tenant.logoUrl ? (
          <img src={tenant.logoUrl} alt="" className="size-12 rounded-[8px] border border-border object-contain" />
        ) : (
          <span className="grid size-12 place-items-center rounded-[8px] bg-secondary font-bold text-primary">
            {(tenant.brandName ?? tenant.workspaceName).slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{tenant.brandName ?? tenant.workspaceName}{isSelf ? " (أنت)" : ""}</p>
          <p className="text-xs text-muted-foreground">سُجّل {formatRiyadh(tenant.createdAt)}</p>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
          {ONBOARDING_STATUS_LABELS[tenant.status]}
        </span>
      </div>
      {tenant.submittedAt ? (
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="text-muted-foreground">{k}:</dt>
              <dd className="font-medium" dir="auto">{v ?? "—"}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">لم يكمل بيانات الشركة بعد.</p>
      )}
      {!isSelf ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {ACTIONS.filter((a) => a.status !== tenant.status).map((a) => (
            <Button
              key={a.status}
              size="sm"
              variant={a.status === "active" ? "default" : a.status === "suspended" ? "ghost" : "outline"}
              disabled={mutate.isPending}
              onClick={() => mutate.mutate(a.status)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
    </article>
  );
}
