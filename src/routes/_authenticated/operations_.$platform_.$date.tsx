import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PlatformIcon } from "@/components/brand/PlatformLogo";
import { ErrorNotice, HistoryRow, OrderLedger } from "@/components/operations/DayLedger";
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
import { PageHeader } from "@/components/workspace/PageKit";
import { count } from "@/lib/format";
import { operationPlatformLabel } from "@/lib/operations/catalog";
import { isIncompleteDay } from "@/lib/operations/completeness";
import { deleteOperationImport, getOperationMonth } from "@/lib/operations/operations.functions";
import type { OperationImportHistoryItem, OperationPlatform } from "@/lib/operations/types";

const PLATFORM_IDS = new Set<OperationPlatform>(["hungerstation", "keeta", "jahez"]);

export const Route = createFileRoute("/_authenticated/operations_/$platform_/$date")({
  head: () => ({ meta: [{ title: "طلبات اليوم · العمليات اليومية · تدقيق" }] }),
  component: DayPage,
});

function DayPage() {
  const params = Route.useParams();
  const platform = PLATFORM_IDS.has(params.platform as OperationPlatform) ? (params.platform as OperationPlatform) : null;
  if (!platform || !/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm">اليوم المطلوب غير موجود.</p>
        <Link to="/operations" className="mt-3 inline-block text-sm font-semibold text-primary">
          العودة إلى العمليات اليومية
        </Link>
      </div>
    );
  }
  return <DayWorkspace key={platform + params.date} platform={platform} date={params.date} />;
}

/** One day of one platform: its files, the orders of the chosen file, and the neighbouring uploaded days. */
function DayWorkspace({ platform, date }: { platform: OperationPlatform; date: string }) {
  const { can } = useWorkspaceAccess();
  const canDelete = can("imports.create");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const month = date.slice(0, 7);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OperationImportHistoryItem | null>(null);

  const monthQuery = useQuery({
    queryKey: ["operation-month", month],
    queryFn: () => getOperationMonth({ data: { month } }),
  });
  const platformFiles = useMemo(
    () => (monthQuery.data?.imports ?? []).filter((item) => item.platform === platform),
    [monthQuery.data?.imports, platform],
  );
  const files = platformFiles.filter((item) => item.businessDate === date);
  const current = files
    .filter((item) => item.current)
    .sort((a, b) => Number(a.sourceKind === "jahez_adjustments") - Number(b.sourceKind === "jahez_adjustments"));
  const replaced = files.filter((item) => !item.current);
  const selected = files.find((item) => item.id === chosenId) ?? current[0] ?? null;

  const uploadedDays = [...new Set(platformFiles.filter((item) => item.current).map((item) => item.businessDate))].sort();
  const position = uploadedDays.indexOf(date);
  const previousDay = position > 0 ? uploadedDays[position - 1] : undefined;
  const nextDay = position >= 0 && position < uploadedDays.length - 1 ? uploadedDays[position + 1] : undefined;
  const label = operationPlatformLabel(platform);

  const removeImport = useMutation({
    mutationFn: (importId: string) => deleteOperationImport({ data: { importId } }),
    onSuccess: async (_, importId) => {
      setDeleteTarget(null);
      if (chosenId === importId) setChosenId(null);
      await queryClient.invalidateQueries({ queryKey: ["operation-month"] });
      toast.success("حُذف الملف وبياناته التشغيلية.");
      if (files.length <= 1) void navigate({ to: "/operations/$platform", params: { platform }, search: { month } });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر حذف ملف العمليات."),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[
          { label: "الرئيسية", to: "/dashboard" },
          { label: "العمليات اليومية", to: "/operations" },
          { label },
          { label: date },
        ]}
        title={
          <span className="inline-flex items-center gap-2.5">
            <PlatformIcon platform={platform} className="size-8 rounded-lg" />
            <span>
              {label} · <span className="num">{date}</span>
            </span>
          </span>
        }
        subtitle="ملفات هذا اليوم وطلباته، مع البحث والتصفية حسب الفرع والملغاة والشكاوى."
        aside={
          <div className="flex items-center gap-1.5">
            <Button asChild variant="outline" size="sm">
              <Link to="/operations/$platform" params={{ platform }} search={{ month }}>
                عودة إلى {label}
              </Link>
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="اليوم السابق"
              disabled={!previousDay}
              onClick={() => previousDay && void navigate({ to: "/operations/$platform/$date", params: { platform, date: previousDay } })}
            >
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="اليوم التالي"
              disabled={!nextDay}
              onClick={() => nextDay && void navigate({ to: "/operations/$platform/$date", params: { platform, date: nextDay } })}
            >
              <ChevronLeft />
            </Button>
          </div>
        }
      />

      {monthQuery.isError ? <ErrorNotice error={monthQuery.error} retry={() => void monthQuery.refetch()} /> : null}
      {monthQuery.isLoading ? (
        <div className="grid min-h-48 place-items-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {!monthQuery.isLoading && !files.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center text-[12.5px] text-muted-foreground">
          لا توجد ملفات {label} ليوم <span className="num">{date}</span>.
        </div>
      ) : null}

      {files.length ? (
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="font-display text-[14px] font-bold">{current.length > 1 ? "ملفات اليوم" : "ملف اليوم"}</h2>
          {current.map((item) => (
            <HistoryRow
              key={item.id}
              item={item}
              active={selected?.id === item.id}
              canDelete={canDelete}
              onOpen={setChosenId}
              onDelete={setDeleteTarget}
            />
          ))}
          {!current.length ? <p className="text-[11.5px] text-muted-foreground">لا يوجد ملف معتمد لهذا اليوم (حُذف الملف الأحدث).</p> : null}
          {replaced.length ? (
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                {count(replaced.length)} {replaced.length === 1 ? "ملف مستبدل" : "ملفات مستبدلة"} لا تدخل في المؤشرات
              </summary>
              <div className="mt-1.5 space-y-1.5 opacity-75">
                {replaced.map((item) => (
                  <HistoryRow
                    key={item.id}
                    item={item}
                    active={selected?.id === item.id}
                    canDelete={canDelete}
                    onOpen={setChosenId}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {selected && selected.sourceKind !== "jahez_adjustments" && isIncompleteDay(selected.summary) ? (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/15 px-5 py-3 text-[12px] leading-6">
          <AlertTriangle className="mt-1 size-4 shrink-0 text-warning" />
          <p>
            هذا الملف يبدو غير مكتمل: {count(selected.summary.unsettledOrderCount ?? 0)} من {count(selected.summary.orderCount)} طلب
            بلا عمولة أو أرباح، غالباً لأنه صُدّر قبل أن تحسبها المنصة، فتكلفة المنصة لهذا اليوم أقل من الحقيقة. أعد تصديره من
            بوابة المنصة بعد يوم أو يومين وارفعه من صفحة {label}؛ يحل محل هذا الملف تلقائياً.
          </p>
        </div>
      ) : null}

      {selected ? <OrderLedger key={selected.id} importId={selected.id} selected={selected} platform={platform} /> : null}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !removeImport.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف ملف العمليات؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيُحذف «{deleteTarget?.originalName}» وكل صفوفه التشغيلية
              {deleteTarget?.current ? "، ويصبح يوم " + deleteTarget.businessDate + " بلا ملف" : ""}. لا يؤثر ذلك في محرك
              المحاسبة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeImport.isPending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeImport.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) removeImport.mutate(deleteTarget.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeImport.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} حذف الملف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
