import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  BadgePercent,
  Calculator,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/AppShell";
import { AdsRoiPanel } from "@/components/ads-roi/AdsRoiPanel";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deletePromotionAudit,
  getPromotionAudits,
  savePromotionAudit,
} from "@/lib/promotion-audit.functions";
import type { PromotionAuditRecord } from "@/lib/promotion-audit.server";
import {
  buildPromotionCostSuggestions,
  calculatePromotionAudit,
  type PromotionAuditInputs,
  type PromotionFundingStatus,
  type PromotionSuggestedField,
} from "@/lib/promotion-audit";
import { percent, sar } from "@/lib/format";
import { useSelectedPeriod } from "@/lib/use-period";

export const Route = createFileRoute("/_authenticated/promotions")({
  head: () => ({
    meta: [
      { title: "عائد الإعلانات الحقيقي · تدقيق" },
      {
        name: "description",
        content:
          "ارفع تقرير إعلانات هنقرستيشن لمعرفة الربح الحقيقي لكل حملة وفرع بعد الضريبة والعمولة وتكلفة الطعام وعرض التوصيل.",
      },
    ],
  }),
  component: PromotionsPage,
});

function PromotionsPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold text-primary-text">تحليل الإعلانات · هنقرستيشن</p>
        <h1 className="audit-heading">عائد الإعلانات الحقيقي</h1>
        <p className="audit-subtitle">
          ارفع تقرير الإعلانات من بوابة هنقرستيشن: كم صرفت، كم جاب الإعلان، وكم بقي لك بعد الضريبة والعمولة وتكلفة الطعام وعرض التوصيل.
        </p>
      </header>

      <AdsRoiPanel />

      <details className="group rounded-[14px] border border-border bg-card px-5 py-4">
        <summary className="cursor-pointer text-[13.5px] font-bold">إدخال يدوي لحملة خارج هنقرستيشن</summary>
        <p className="mt-1 text-xs text-muted-foreground">
          لحملات كيتا وجاهز أو أي عرض لا يوجد له تقرير. مرتبط بفترة التدقيق المختارة.
        </p>
        <div className="mt-5">
          <PromotionAuditPage />
        </div>
      </details>
    </div>
  );
}

interface PromotionFormState {
  id?: string;
  name: string;
  campaignRevenue: string;
  organicBaseline: string;
  restaurantFundedDiscount: string;
  platformFundedDiscount: string;
  unknownFundedDiscount: string;
  advertisingSpend: string;
  commissionFees: string;
  paymentFees: string;
  deliveryCampaignFees: string;
  otherMarketplaceFees: string;
  cogsAmount: string;
  platformRoas: string;
  notes: string;
}

const EMPTY_FORM: PromotionFormState = {
  name: "",
  campaignRevenue: "",
  organicBaseline: "",
  restaurantFundedDiscount: "",
  platformFundedDiscount: "",
  unknownFundedDiscount: "",
  advertisingSpend: "",
  commissionFees: "",
  paymentFees: "",
  deliveryCampaignFees: "",
  otherMarketplaceFees: "",
  cogsAmount: "",
  platformRoas: "",
  notes: "",
};

const FUNDING_LABELS: Record<PromotionFundingStatus, string> = {
  restaurant: "تمويل المطعم",
  platform: "تمويل المنصة",
  shared: "تمويل مشترك",
  unknown: "تمويل غير محسوم",
};

function amount(value: string): number {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function optionalAmount(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function formToInput(form: PromotionFormState): PromotionAuditInputs {
  return {
    name: form.name.trim(),
    campaignRevenue: amount(form.campaignRevenue),
    organicBaseline: amount(form.organicBaseline),
    restaurantFundedDiscount: amount(form.restaurantFundedDiscount),
    platformFundedDiscount: amount(form.platformFundedDiscount),
    unknownFundedDiscount: amount(form.unknownFundedDiscount),
    advertisingSpend: amount(form.advertisingSpend),
    commissionFees: amount(form.commissionFees),
    paymentFees: amount(form.paymentFees),
    deliveryCampaignFees: amount(form.deliveryCampaignFees),
    otherMarketplaceFees: amount(form.otherMarketplaceFees),
    cogsAmount: amount(form.cogsAmount),
    platformRoas: optionalAmount(form.platformRoas),
    notes: form.notes.trim() || null,
  };
}

function recordToForm(record: PromotionAuditRecord): PromotionFormState {
  return {
    id: record.id,
    name: record.name,
    campaignRevenue: String(record.campaignRevenue),
    organicBaseline: String(record.organicBaseline),
    restaurantFundedDiscount: String(record.restaurantFundedDiscount),
    platformFundedDiscount: String(record.platformFundedDiscount),
    unknownFundedDiscount: String(record.unknownFundedDiscount),
    advertisingSpend: String(record.advertisingSpend),
    commissionFees: String(record.commissionFees),
    paymentFees: String(record.paymentFees),
    deliveryCampaignFees: String(record.deliveryCampaignFees),
    otherMarketplaceFees: String(record.otherMarketplaceFees),
    cogsAmount: String(record.cogsAmount),
    platformRoas: record.platformRoas == null ? "" : String(record.platformRoas),
    notes: record.notes ?? "",
  };
}

function ratio(value: number | null): string {
  return value == null ? "—" : value.toFixed(2) + "×";
}

function PromotionAuditPage() {
  const { selected, isLoading } = useSelectedPeriod();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PromotionFormState>(EMPTY_FORM);

  const periodId = selected?.id ?? "";
  const suggestions = useMemo(
    () => (selected ? buildPromotionCostSuggestions(selected) : null),
    [selected],
  );

  const auditsQuery = useQuery({
    queryKey: ["promotion-audits", periodId],
    queryFn: () => getPromotionAudits({ data: { periodId } }),
    enabled: Boolean(selected),
  });

  useEffect(() => {
    setForm(EMPTY_FORM);
  }, [periodId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("اختر فترة تدقيق أولاً.");
      const input = formToInput(form);
      const numericValues = [
        input.campaignRevenue,
        input.organicBaseline,
        input.restaurantFundedDiscount,
        input.platformFundedDiscount,
        input.unknownFundedDiscount,
        input.advertisingSpend,
        input.commissionFees,
        input.paymentFees,
        input.deliveryCampaignFees,
        input.otherMarketplaceFees,
        input.cogsAmount,
        ...(input.platformRoas == null ? [] : [input.platformRoas]),
      ];
      if (numericValues.some((value) => !Number.isFinite(value) || value < 0)) {
        throw new Error("راجع القيم المالية؛ لا يمكن حفظ قيمة سالبة أو غير صالحة.");
      }

      return savePromotionAudit({
        data: {
          id: form.id,
          periodId: selected.id,
          ...input,
        },
      });
    },
    onSuccess: async () => {
      toast.success(form.id ? "تم تحديث تحليل الحملة" : "تم حفظ تحليل الحملة");
      setForm(EMPTY_FORM);
      await queryClient.invalidateQueries({
        queryKey: ["promotion-audits", periodId],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (record: PromotionAuditRecord) => {
      if (!selected) throw new Error("اختر فترة تدقيق أولاً.");
      return deletePromotionAudit({
        data: { id: record.id, periodId: selected.id },
      });
    },
    onSuccess: async () => {
      toast.success("تم حذف تحليل الحملة");
      setForm(EMPTY_FORM);
      await queryClient.invalidateQueries({
        queryKey: ["promotion-audits", periodId],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        جارٍ التحميل…
      </p>
    );
  }

  if (!selected || !suggestions) {
    return (
      <EmptyState
        title="لا توجد فترة تدقيق"
        body="ارفع بيانات منصة أولاً حتى يمكن ربط تحليل العروض بنتيجة تدقيق موثقة."
      />
    );
  }

  const audits = auditsQuery.data ?? [];
  const preview = calculatePromotionAudit(formToInput(form));

  const applySuggestion = (
    key:
      | "campaignRevenue"
      | "restaurantFundedDiscount"
      | "platformFundedDiscount"
      | "unknownFundedDiscount"
      | "advertisingSpend"
      | "commissionFees"
      | "paymentFees"
      | "deliveryCampaignFees",
    value: number,
  ) => {
    setForm((current) => ({ ...current, [key]: value.toFixed(2) }));
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-base font-bold">تحليل العروض و True ROI</h2>
        <p className="audit-subtitle">
          {selected.label} · قياس الزيادة الحقيقية والمساهمة بعد الخصومات
          والإعلانات ورسوم المنصة و COGS.
        </p>
      </header>

      <section className="rounded-xl border border-primary/20 bg-secondary/20 p-4">
        <div className="flex items-start gap-3">
          <Calculator className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <h2 className="text-sm font-bold">قاعدة الحساب</h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              لا ينسب Tadqeeq رسوم الفترة تلقائياً إلى حملة. القيم الموثقة أدناه
              مجرد اقتراحات من خريطة الرسوم، ويجب تأكيد استخدامها عندما تكون
              الحملة تغطي نفس الفترة أو عندما يكون لديك توزيع موثوق.
            </p>
          </div>
        </div>
      </section>

      {suggestions.unmappedExposure > 0.05 ? (
        <section className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p className="text-xs leading-6 text-muted-foreground">
              يوجد {sar(suggestions.unmappedExposure)} غير مصنف في خريطة رسوم
              الفترة. لا يدخل هذا المبلغ تلقائياً في ROI حتى يتم تصنيفه.
            </p>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold">قيم موثقة متاحة من الفترة</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            استخدمها فقط إذا كانت تخص الحملة فعلاً.
          </p>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
          <SuggestionCard
            label="مبيعات الفترة"
            field={{ amount: suggestions.periodRevenue, lineIds: [], labels: ["ملخص الفترة"] }}
            onUse={() => applySuggestion("campaignRevenue", suggestions.periodRevenue)}
          />
          <SuggestionCard
            label="خصم ممول من المطعم"
            field={suggestions.restaurantFundedDiscount}
            onUse={() =>
              applySuggestion(
                "restaurantFundedDiscount",
                suggestions.restaurantFundedDiscount.amount,
              )
            }
          />
          <SuggestionCard
            label="خصم ممول من المنصة"
            field={suggestions.platformFundedDiscount}
            onUse={() =>
              applySuggestion(
                "platformFundedDiscount",
                suggestions.platformFundedDiscount.amount,
              )
            }
          />
          <SuggestionCard
            label="خصم بتمويل غير محسوم"
            field={suggestions.unknownFundedDiscount}
            onUse={() =>
              applySuggestion(
                "unknownFundedDiscount",
                suggestions.unknownFundedDiscount.amount,
              )
            }
          />
          <SuggestionCard
            label="إنفاق إعلاني / CPC"
            field={suggestions.advertisingSpend}
            onUse={() =>
              applySuggestion("advertisingSpend", suggestions.advertisingSpend.amount)
            }
          />
          <SuggestionCard
            label="العمولة"
            field={suggestions.commissionFees}
            onUse={() =>
              applySuggestion("commissionFees", suggestions.commissionFees.amount)
            }
          />
          <SuggestionCard
            label="رسوم الدفع"
            field={suggestions.paymentFees}
            onUse={() =>
              applySuggestion("paymentFees", suggestions.paymentFees.amount)
            }
          />
          <SuggestionCard
            label="تكلفة حملة التوصيل"
            field={suggestions.deliveryCampaignFees}
            onUse={() =>
              applySuggestion(
                "deliveryCampaignFees",
                suggestions.deliveryCampaignFees.amount,
              )
            }
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">
              {form.id ? "تعديل تحليل الحملة" : "إضافة حملة"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              المدخلات هنا بشرية ومقصودة؛ الحسابات الناتجة فقط هي الحتمية.
            </p>
          </div>
          {form.id ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setForm(EMPTY_FORM)}
            >
              <Plus className="size-3.5" />
              حملة جديدة
            </Button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <TextField
            label="اسم الحملة"
            value={form.name}
            onChange={(value) => setForm((current) => ({ ...current, name: value }))}
            placeholder="مثال: حملة التوصيل المجاني - سبتمبر"
          />
          <MoneyField
            label="مبيعات الحملة"
            value={form.campaignRevenue}
            onChange={(value) =>
              setForm((current) => ({ ...current, campaignRevenue: value }))
            }
          />
          <MoneyField
            label="خط الأساس العضوي"
            value={form.organicBaseline}
            onChange={(value) =>
              setForm((current) => ({ ...current, organicBaseline: value }))
            }
            hint="المبيعات المتوقعة بدون الحملة لنفس النطاق."
          />
          <MoneyField
            label="خصم ممول من المطعم"
            value={form.restaurantFundedDiscount}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                restaurantFundedDiscount: value,
              }))
            }
          />
          <MoneyField
            label="خصم ممول من المنصة"
            value={form.platformFundedDiscount}
            onChange={(value) =>
              setForm((current) => ({ ...current, platformFundedDiscount: value }))
            }
          />
          <MoneyField
            label="خصم بتمويل غير محسوم"
            value={form.unknownFundedDiscount}
            onChange={(value) =>
              setForm((current) => ({ ...current, unknownFundedDiscount: value }))
            }
          />
          <MoneyField
            label="الإنفاق الإعلاني / CPC"
            value={form.advertisingSpend}
            onChange={(value) =>
              setForm((current) => ({ ...current, advertisingSpend: value }))
            }
          />
          <MoneyField
            label="العمولة المنسوبة للحملة"
            value={form.commissionFees}
            onChange={(value) =>
              setForm((current) => ({ ...current, commissionFees: value }))
            }
          />
          <MoneyField
            label="رسوم الدفع المنسوبة للحملة"
            value={form.paymentFees}
            onChange={(value) =>
              setForm((current) => ({ ...current, paymentFees: value }))
            }
          />
          <MoneyField
            label="رسوم / دعم التوصيل"
            value={form.deliveryCampaignFees}
            onChange={(value) =>
              setForm((current) => ({ ...current, deliveryCampaignFees: value }))
            }
          />
          <MoneyField
            label="رسوم منصة أخرى"
            value={form.otherMarketplaceFees}
            onChange={(value) =>
              setForm((current) => ({ ...current, otherMarketplaceFees: value }))
            }
          />
          <MoneyField
            label="COGS للحملة"
            value={form.cogsAmount}
            onChange={(value) =>
              setForm((current) => ({ ...current, cogsAmount: value }))
            }
            hint="مبلغ COGS الفعلي/المعتمد، وليس نسبة مفترضة."
          />
          <NumberField
            label="Platform ROAS"
            value={form.platformRoas}
            onChange={(value) =>
              setForm((current) => ({ ...current, platformRoas: value }))
            }
            hint="اختياري: أدخل ROAS كما تعرضه المنصة للمقارنة فقط."
          />
          <label className="lg:col-span-2">
            <span className="text-xs font-semibold">ملاحظات / مصدر الافتراضات</span>
            <Textarea
              className="mt-1.5 min-h-24 bg-white"
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="مثال: baseline من متوسط 4 أسابيع قبل الحملة، COGS من ERP."
            />
          </label>
        </div>

        <div className="mt-5 grid gap-0 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="الزيادة في المبيعات"
            value={sar(preview.incrementalRevenue)}
            icon={TrendingUp}
            tone={preview.incrementalRevenue >= 0 ? "positive" : "negative"}
          />
          <StatCard
            label="المساهمة الإضافية"
            value={sar(preview.incrementalContribution)}
            icon={Calculator}
            tone={preview.incrementalContribution >= 0 ? "positive" : "negative"}
          />
          <StatCard
            label="Revenue ROI"
            value={ratio(preview.revenueRoi)}
            hint="Incremental Revenue ÷ Promotion Investment"
            icon={BadgePercent}
          />
          <StatCard
            label="Profit ROI"
            value={ratio(preview.profitRoi)}
            hint="Incremental Contribution ÷ Promotion Investment"
            icon={Megaphone}
            tone={
              preview.profitRoi != null && preview.profitRoi < 0
                ? "negative"
                : "default"
            }
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {FUNDING_LABELS[preview.fundingStatus]}
            </span>
            {" · "}
            إجمالي رسوم المنصة المنسوبة: {sar(preview.marketplaceFees)}
            {" · "}
            استثمار العرض: {sar(preview.promotionInvestment)}
          </div>
          <Button
            type="button"
            disabled={saveMutation.isPending || !form.name.trim()}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending
              ? "جارٍ الحفظ…"
              : form.id
                ? "حفظ التعديلات"
                : "حفظ تحليل الحملة"}
          </Button>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">الحملات المحفوظة</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              كل حملة مرتبطة بنسخة فترة التدقيق الحالية.
            </p>
          </div>
          <Badge variant="outline">{audits.length} حملة</Badge>
        </div>

        {auditsQuery.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            جارٍ تحميل الحملات…
          </p>
        ) : audits.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {audits.map((record) => (
              <PromotionAuditCard
                key={record.id}
                record={record}
                onEdit={() => setForm(recordToForm(record))}
                onDelete={() => {
                  if (
                    window.confirm(
                      "حذف تحليل هذه الحملة؟ لن يتم حذف فترة التدقيق أو بيانات المنصة.",
                    )
                  ) {
                    deleteMutation.mutate(record);
                  }
                }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            لا توجد حملات محفوظة لهذه الفترة بعد.
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-white p-4">
        <h2 className="text-sm font-bold">الصيغ المستخدمة</h2>
        <div className="mt-3 grid gap-2 text-xs leading-6 text-muted-foreground md:grid-cols-2">
          <p>
            <strong className="text-foreground">Incremental Revenue</strong>
            {" = "}Campaign Revenue − Organic Baseline
          </p>
          <p>
            <strong className="text-foreground">Marketplace Fees</strong>
            {" = "}Commission + Payment Fees + Delivery Campaign Fees + Other Fees
          </p>
          <p>
            <strong className="text-foreground">Incremental Contribution</strong>
            {" = "}Incremental Revenue − Restaurant Discount − Ad Spend − Marketplace Fees − COGS
          </p>
          <p>
            <strong className="text-foreground">Promotion Investment</strong>
            {" = "}Restaurant Discount + Ad Spend + Delivery Campaign Fees
          </p>
          <p>
            <strong className="text-foreground">Revenue ROI</strong>
            {" = "}Incremental Revenue ÷ Promotion Investment
          </p>
          <p>
            <strong className="text-foreground">Profit ROI</strong>
            {" = "}Incremental Contribution ÷ Promotion Investment
          </p>
        </div>
      </section>
    </div>
  );
}

function SuggestionCard({
  label,
  field,
  onUse,
}: {
  label: string;
  field: PromotionSuggestedField;
  onUse: () => void;
}) {
  return (
    <div className="bg-white p-3.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="num mt-1 text-base font-semibold">{sar(field.amount)}</p>
      <p className="mt-1 min-h-5 text-[10.5px] leading-5 text-muted-foreground">
        {field.labels.length ? field.labels.join(" · ") : "ملخص الفترة"}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2 h-7 text-[11px]"
        disabled={field.amount <= 0}
        onClick={onUse}
      >
        استخدم القيمة
      </Button>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label>
      <span className="text-xs font-semibold">{label}</span>
      <Input
        className="mt-1.5 bg-white"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label>
      <span className="text-xs font-semibold">{label}</span>
      <div className="relative mt-1.5">
        <Input
          dir="ltr"
          inputMode="decimal"
          type="number"
          min="0"
          step="0.01"
          className="bg-white pe-14 text-end"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
          SAR
        </span>
      </div>
      {hint ? (
        <span className="mt-1 block text-[10.5px] leading-5 text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label>
      <span className="text-xs font-semibold">{label}</span>
      <Input
        dir="ltr"
        inputMode="decimal"
        type="number"
        min="0"
        step="0.01"
        className="mt-1.5 bg-white text-end"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? (
        <span className="mt-1 block text-[10.5px] leading-5 text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function PromotionAuditCard({
  record,
  onEdit,
  onDelete,
}: {
  record: PromotionAuditRecord;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const result = calculatePromotionAudit(record);

  return (
    <article className="rounded-xl border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">{record.name}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge
              variant={result.fundingStatus === "unknown" ? "destructive" : "secondary"}
            >
              {FUNDING_LABELS[result.fundingStatus]}
            </Badge>
            {record.platformRoas != null ? (
              <Badge variant="outline">
                Platform ROAS {record.platformRoas.toFixed(2)}×
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="icon" onClick={onEdit}>
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs">
        <Metric label="مبيعات الحملة" value={sar(record.campaignRevenue)} />
        <Metric label="الزيادة في المبيعات" value={sar(result.incrementalRevenue)} />
        <Metric
          label="المساهمة الإضافية"
          value={sar(result.incrementalContribution)}
          negative={result.incrementalContribution < 0}
        />
        <Metric label="Profit ROI" value={ratio(result.profitRoi)} />
        <Metric label="Revenue ROI" value={ratio(result.revenueRoi)} />
        <Metric
          label="حصة تمويل المطعم"
          value={
            result.restaurantFundingPct == null
              ? "—"
              : percent(result.restaurantFundingPct)
          }
        />
      </div>

      {record.notes ? (
        <p className="mt-3 border-t border-border pt-3 text-[11px] leading-5 text-muted-foreground">
          {record.notes}
        </p>
      ) : null}
    </article>
  );
}

function Metric({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div>
      <p className="text-[10.5px] text-muted-foreground">{label}</p>
      <p
        className={
          "num mt-0.5 font-semibold " +
          (negative ? "text-destructive" : "text-foreground")
        }
      >
        {value}
      </p>
    </div>
  );
}
