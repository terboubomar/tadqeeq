import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileSpreadsheet, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  analyzeAdsRoi,
  brandKey,
  type AdsRoiResult,
  type BrandSettings,
  type CampaignAction,
  type CampaignResult,
  type CampaignStatus,
} from "@/lib/ads-roi/analysis";
import {
  deleteAdsRoiAnalysis,
  getAdsRoiAnalysis,
  getAdsRoiSettings,
  listAdsRoiAnalyses,
  saveAdsRoiAnalysis,
  saveAdsRoiSettings,
} from "@/lib/ads-roi/ads-roi.functions";
import { readReportFile } from "@/lib/ads-roi/read-file";
import {
  detectHsReportKind,
  missingColumns,
  parseHsAdsReport,
  parseHsOrdersReport,
  type ParsedAdsReport,
  type ParsedOrdersReport,
} from "@/lib/ads-roi/reports";
import { exportXlsx } from "@/lib/export";
import { count, money } from "@/lib/format";
import { uploadSizeError } from "@/lib/upload-validation";
import { cn } from "@/lib/utils";

interface LoadedAnalysis {
  report: ParsedAdsReport;
  orders: ParsedOrdersReport | null;
  sourceFileName: string | null;
  ordersFileName: string | null;
  savedId: string | null;
}

function displayDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function dateRange(from: string, to: string): string {
  return from === to ? displayDate(from) : `${displayDate(from)} – ${displayDate(to)}`;
}

function signed(value: number): string {
  return (value > 0 ? "+" : value < 0 ? "−" : "") + money(Math.abs(value));
}

function rateText(value: number | null): string {
  if (value == null) return "";
  return String(Math.round(value * 10_000) / 100);
}

function parseRate(value: string): number | null | "invalid" {
  const raw = value.trim().replace("%", "");
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 100) return "invalid";
  return parsed / 100;
}

function ratioText(value: number | null): string {
  return value == null ? "—" : value.toFixed(2);
}

const STATUS_LABEL: Record<CampaignStatus, string> = {
  loss: "تخسر",
  thin: "قريبة من التعادل",
  profit: "رابحة",
};

const ACTION_LABEL: Record<CampaignAction, string> = {
  stop: "أوقفها",
  lower_bid: "خفّض المزايدة",
  watch: "راقبها",
  keep: "استمر",
};

const ACTION_CLASS: Record<CampaignAction, string> = {
  stop: "bg-destructive/10 text-destructive",
  lower_bid: "bg-warning/10 text-warning",
  watch: "bg-warning/10 text-warning",
  keep: "bg-success/10 text-success",
};

const BAR_CLASS: Record<CampaignStatus, string> = {
  loss: "bg-destructive",
  thin: "bg-warning",
  profit: "bg-success",
};

type CampaignFilter = "attention" | "all" | "profit";
type BranchSort = "profit" | "spent" | "costPerOrder" | "roas";

export function AdsRoiPanel() {
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState<LoadedAnalysis | null>(null);
  const [draft, setDraft] = useState<Record<string, { commission: string; foodCost: string }>>({});
  const [reading, setReading] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["ads-roi-settings"],
    queryFn: () => getAdsRoiSettings({ data: {} }),
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ["ads-roi-analyses"],
    queryFn: () => listAdsRoiAnalyses({ data: {} }),
    retry: false,
  });

  const savedSettings: BrandSettings = useMemo(() => settingsQuery.data ?? {}, [settingsQuery.data]);

  // Settings in effect: saved values, overridden by what the user is typing.
  const settings: BrandSettings = useMemo(() => {
    const merged: BrandSettings = { ...savedSettings };
    for (const [key, value] of Object.entries(draft)) {
      const commission = parseRate(value.commission);
      const foodCost = parseRate(value.foodCost);
      merged[key] = {
        commissionRate: commission === "invalid" ? (savedSettings[key]?.commissionRate ?? null) : commission,
        foodCostRate: foodCost === "invalid" ? (savedSettings[key]?.foodCostRate ?? null) : foodCost,
      };
    }
    return merged;
  }, [savedSettings, draft]);

  const result: AdsRoiResult | null = useMemo(() => {
    if (!loaded) return null;
    return analyzeAdsRoi({ report: loaded.report, orders: loaded.orders, settings });
  }, [loaded, settings]);

  const saveMutation = useMutation({
    mutationFn: async (input: LoadedAnalysis) =>
      saveAdsRoiAnalysis({
        data: {
          report: input.report,
          orders: input.orders,
          sourceFileName: input.sourceFileName,
          ordersFileName: input.ordersFileName,
        },
      }),
    onSuccess: async (saved) => {
      setLoaded((current) => (current ? { ...current, savedId: saved.id } : current));
      toast.success("تم حفظ التحليل");
      await queryClient.invalidateQueries({ queryKey: ["ads-roi-analyses"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const settingsMutation = useMutation({
    mutationFn: async () => {
      const brands = Object.entries(draft).map(([key, value]) => {
        const commissionRate = parseRate(value.commission);
        const foodCostRate = parseRate(value.foodCost);
        if (commissionRate === "invalid" || foodCostRate === "invalid") {
          throw new Error("أدخل النسب كأرقام بين 0 و 99 (مثال: 15 أو 30).");
        }
        return { brandKey: key, commissionRate, foodCostRate };
      });
      return saveAdsRoiSettings({ data: { brands } });
    },
    onSuccess: async (next) => {
      queryClient.setQueryData(["ads-roi-settings"], next);
      setDraft({});
      toast.success("تم حفظ افتراضات الحساب");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => deleteAdsRoiAnalysis({ data: { id } }),
    onSuccess: async (_, id) => {
      if (loaded?.savedId === id) setLoaded((current) => (current ? { ...current, savedId: null } : current));
      toast.success("تم حذف التحليل");
      await queryClient.invalidateQueries({ queryKey: ["ads-roi-analyses"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openSaved = async (id: string) => {
    try {
      const record = await getAdsRoiAnalysis({ data: { id } });
      setLoaded({
        report: record.report,
        orders: record.orders,
        sourceFileName: record.sourceFileName,
        ordersFileName: record.ordersFileName,
        savedId: record.id,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر فتح التحليل.");
    }
  };

  const handleFiles = async (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    setReading(true);
    try {
      // Read everything first so an ads report dropped together with its orders report is handled first.
      const tables = [];
      for (const file of list) {
        const sizeError = uploadSizeError(file.size);
        if (sizeError) throw new Error(sizeError);
        const table = await readReportFile(file);
        tables.push({ file, table, kind: detectHsReportKind(table.headers) });
      }
      tables.sort((a, b) => Number(b.kind === "ads") - Number(a.kind === "ads"));

      let next: LoadedAnalysis | null = loaded;
      for (const { file, table, kind } of tables) {
        if (kind === "outlet_summary") {
          throw new Error(
            `«${file.name}» هو تقرير أداء الفروع اليومي، وليس تقرير الإعلانات. تقرير الإعلانات يحتوي عمود «Spent Budget».`,
          );
        }
        if (kind === null) {
          const missing = missingColumns("ads", table.headers);
          throw new Error(
            `«${file.name}» ليس تقرير إعلانات هنقرستيشن. أعمدة ناقصة: ${missing.join("، ")}.`,
          );
        }
        if (kind === "ads") {
          const report = parseHsAdsReport(table.rows);
          const keepOrders = next?.orders && next.report.dateFrom === report.dateFrom && next.report.dateTo === report.dateTo;
          next = {
            report,
            orders: keepOrders ? next!.orders : null,
            sourceFileName: file.name,
            ordersFileName: keepOrders ? next!.ordersFileName : null,
            savedId: null,
          };
        } else {
          if (!next) {
            throw new Error("ارفع تقرير الإعلانات أولاً، ثم أضف تقرير الطلبات لنفس الأيام.");
          }
          const orders = parseHsOrdersReport(table.rows);
          if (orders.dateFrom && (orders.dateFrom > next.report.dateTo || orders.dateTo < next.report.dateFrom)) {
            throw new Error(
              `تقرير الطلبات (${dateRange(orders.dateFrom, orders.dateTo)}) لا يغطي أيام تقرير الإعلانات (${dateRange(next.report.dateFrom, next.report.dateTo)}).`,
            );
          }
          next = { ...next, orders, ordersFileName: file.name, savedId: null };
        }
      }
      setLoaded(next);
      if (next) {
        const existing = historyQuery.data?.find((item) => item.dateFrom === next!.report.dateFrom && item.dateTo === next!.report.dateTo);
        if (existing) toast.info(`يوجد تحليل محفوظ لـ ${dateRange(existing.dateFrom, existing.dateTo)}. الحفظ سيستبدله.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر قراءة الملف.");
    } finally {
      setReading(false);
    }
  };

  const history = historyQuery.data ?? [];
  const historyUnavailable = historyQuery.error instanceof Error ? historyQuery.error.message : null;

  return (
    <div className="space-y-5">
      {result && loaded ? (
        <AdsRoiResults
          result={result}
          loaded={loaded}
          settings={settings}
          draft={draft}
          setDraft={setDraft}
          reading={reading}
          onFiles={handleFiles}
          onSave={() => saveMutation.mutate(loaded)}
          saving={saveMutation.isPending}
          onSaveSettings={() => settingsMutation.mutate()}
          savingSettings={settingsMutation.isPending}
          onClose={() => setLoaded(null)}
        />
      ) : (
        <UploadArea reading={reading} onFiles={handleFiles} />
      )}

      <section className="panel space-y-3 p-5">
        <h2 className="text-sm font-bold">التحليلات المحفوظة</h2>
        {historyUnavailable ? (
          <p className="text-xs text-muted-foreground">{historyUnavailable}</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد تحليلات محفوظة بعد. ارفع تقرير الإعلانات واحفظ التحليل ليظهر هنا.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {history.map((item) => (
              <li key={item.id} className="flex items-center gap-2 rounded-[10px] border border-border p-3">
                <button
                  type="button"
                  onClick={() => openSaved(item.id)}
                  className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-start"
                >
                  <span className="text-[13px] font-semibold">
                    هنقرستيشن · <span className="num">{dateRange(item.dateFrom, item.dateTo)}</span>
                  </span>
                  <span className="text-[11.5px] text-muted-foreground">
                    إنفاق <span className="num">{money(item.spent)}</span> · مبيعات <span className="num">{money(item.gmv)}</span>
                    {item.hasOrders ? " · مع تقرير الطلبات" : ""}
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="حذف التحليل"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`حذف تحليل ${dateRange(item.dateFrom, item.dateTo)}؟`)) deleteMutation.mutate(item.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function UploadArea({ reading, onFiles }: { reading: boolean; onFiles: (files: FileList | File[] | null) => void }) {
  const [dragging, setDragging] = useState(false);
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    onFiles(event.dataTransfer.files);
  };
  return (
    <section aria-label="رفع الملفات" className="panel space-y-4 p-5">
      <label
        htmlFor="ads-roi-file"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-[12px] border-2 border-dashed border-border bg-background/60 px-5 py-9 text-center transition-colors",
          dragging && "border-primary bg-primary/5",
        )}
      >
        <Upload className="h-8 w-8 text-primary" aria-hidden="true" />
        <span className="text-base font-bold">{reading ? "جارٍ قراءة الملف…" : "اسحب تقرير الإعلانات هنا"}</span>
        <span className="text-[12.5px] text-muted-foreground">CSV أو Excel · يوم واحد أو عدة أيام · يمكنك رفع تقرير الطلبات معه</span>
        <span className="mt-1 inline-flex h-9 items-center rounded-lg bg-foreground px-4 text-[13px] font-semibold text-background">
          اختيار ملف
        </span>
        <input
          id="ads-roi-file"
          type="file"
          multiple
          accept=".csv,.xlsx,.xls"
          className="sr-only"
          disabled={reading}
          onChange={(event) => {
            onFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5 rounded-[12px] border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-bold">تقرير الإعلانات</span>
            <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">مطلوب</span>
          </div>
          <p className="text-xs text-muted-foreground">
            الإنفاق والنقرات والطلبات والمبيعات لكل حملة. يكفي وحده لحساب ROAS والربح بعد الضريبة والعمولة وتكلفة الطعام.
          </p>
          <p className="text-[11.5px] text-muted-foreground">Campaign ID · Clicks · Total Orders · Total GMV · Spent Budget</p>
        </div>
        <div className="space-y-1.5 rounded-[12px] border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-bold">تقرير الطلبات</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">اختياري</span>
          </div>
          <p className="text-xs text-muted-foreground">
            لنفس الأيام. يضيف خصوماتك (Discount Funded by you) ورسوم الدفع وعرض التوصيل (Operational Charges) والعمولة الفعلية لكل فرع، فيصبح الربح دقيقاً.
          </p>
          <p className="text-[11.5px] text-muted-foreground">Order ID · Subtotal · Commission · Operational Charges</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">يُحفظ التحليل والأرقام المستخرجة فقط عند الضغط على «حفظ التحليل»، ويمكن حذفه في أي وقت.</p>
    </section>
  );
}

interface ResultsProps {
  result: AdsRoiResult;
  loaded: LoadedAnalysis;
  settings: BrandSettings;
  draft: Record<string, { commission: string; foodCost: string }>;
  setDraft: (next: Record<string, { commission: string; foodCost: string }>) => void;
  reading: boolean;
  onFiles: (files: FileList | File[] | null) => void;
  onSave: () => void;
  saving: boolean;
  onSaveSettings: () => void;
  savingSettings: boolean;
  onClose: () => void;
}

function AdsRoiResults(props: ResultsProps) {
  const { result, loaded } = props;
  const [filter, setFilter] = useState<CampaignFilter>("attention");
  const [sort, setSort] = useState<BranchSort>("profit");
  const fileInput = useRef<HTMLInputElement>(null);
  const { totals, verdict, notes } = result;

  const shownCampaigns = result.campaigns.filter((campaign) =>
    filter === "all" ? true : filter === "profit" ? campaign.status === "profit" : campaign.status !== "profit",
  );
  const sortedBranches = [...result.branches].sort((a, b) => {
    if (sort === "spent") return b.spent - a.spent;
    if (sort === "costPerOrder") return (b.costPerOrder ?? Infinity) - (a.costPerOrder ?? Infinity);
    if (sort === "roas") return (a.roas ?? 0) - (b.roas ?? 0);
    return a.profit - b.profit;
  });
  const best = [...result.campaigns].sort((a, b) => b.profit - a.profit)[0];
  const profitLabel = notes.ordersIncluded ? "بعد الخصومات والرسوم" : "قبل خصوماتك ورسوم الدفع والتوصيل";
  const foodNote = notes.missingFoodCostBrands.length > 0 ? " · بعض العلامات بلا تكلفة طعام" : "";

  const exportAll = () => {
    const campaignRows = result.campaigns.map((c) => ({
      branch: c.branchName,
      campaign: c.campaignId,
      clicks: c.clicks,
      orders: c.orders ?? "",
      spent: c.spent,
      cpc: c.cpc ?? "",
      gmv: c.gmv,
      roas: c.roas ?? "",
      breakEven: c.breakEvenRoas ?? "",
      profit: c.profit,
      status: STATUS_LABEL[c.status],
      action: ACTION_LABEL[c.action],
    }));
    const branchRows = result.branches.map((b) => ({
      branch: b.branchName,
      campaigns: b.campaigns,
      spent: b.spent,
      gmv: b.gmv,
      orders: b.orders,
      costPerOrder: b.costPerOrder ?? "",
      roas: b.roas ?? "",
      breakEven: b.breakEvenRoas ?? "",
      profit: b.profit,
    }));
    exportXlsx(
      [
        {
          name: "الحملات",
          rows: campaignRows as Array<Record<string, unknown>>,
          columns: [
            { key: "branch", header: "الفرع" },
            { key: "campaign", header: "الحملة" },
            { key: "clicks", header: "النقرات", type: "number" },
            { key: "orders", header: "الطلبات", type: "number" },
            { key: "spent", header: "الإنفاق", type: "money" },
            { key: "cpc", header: "تكلفة النقرة", type: "money" },
            { key: "gmv", header: "المبيعات", type: "money" },
            { key: "roas", header: "ROAS", type: "number" },
            { key: "breakEven", header: "خط التعادل", type: "number" },
            { key: "profit", header: "الربح بعد الإعلان", type: "money" },
            { key: "status", header: "الحالة" },
            { key: "action", header: "التوصية" },
          ],
        },
        {
          name: "الفروع",
          rows: branchRows as Array<Record<string, unknown>>,
          columns: [
            { key: "branch", header: "الفرع" },
            { key: "campaigns", header: "الحملات", type: "number" },
            { key: "spent", header: "الإنفاق", type: "money" },
            { key: "gmv", header: "المبيعات", type: "money" },
            { key: "orders", header: "الطلبات", type: "number" },
            { key: "costPerOrder", header: "تكلفة الطلب", type: "money" },
            { key: "roas", header: "ROAS", type: "number" },
            { key: "breakEven", header: "خط التعادل", type: "number" },
            { key: "profit", header: "الربح بعد الإعلان", type: "money" },
          ],
        },
      ],
      `tadqeeq-ads-roi-${result.dateFrom}`,
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls"
          className="sr-only"
          aria-label="رفع تقرير"
          onChange={(event) => {
            props.onFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <Button type="button" variant="outline" disabled={props.reading} onClick={() => fileInput.current?.click()}>
          {loaded.orders ? "رفع تقرير آخر" : "إضافة تقرير الطلبات أو تقرير آخر"}
        </Button>
        <Button type="button" variant="outline" onClick={exportAll}>
          <FileSpreadsheet className="h-4 w-4" />
          تصدير Excel
        </Button>
        <Button type="button" variant="outline" onClick={props.onClose}>
          إغلاق
        </Button>
        <Button type="button" onClick={props.onSave} disabled={props.saving || Boolean(loaded.savedId)}>
          {loaded.savedId ? "محفوظ" : props.saving ? "جارٍ الحفظ…" : "حفظ التحليل"}
        </Button>
      </div>

      <section
        aria-label="الملفات"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] border border-border bg-card px-4 py-3 text-[12.5px] text-muted-foreground"
      >
        <span className="flex items-center gap-2 font-semibold text-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          تقرير الإعلانات
        </span>
        <span>
          {result.days === 1 ? "اليوم" : result.days === 2 ? "يومان" : result.days <= 10 ? `${result.days} أيام` : `${result.days} يوماً`} <span className="num">{dateRange(result.dateFrom, result.dateTo)}</span>
        </span>
        <span>
          <span className="num">{count(result.branches.length)}</span> فرعاً · <span className="num">{count(result.campaigns.length)}</span> حملة
        </span>
        {loaded.orders ? (
          <span className="flex items-center gap-2 font-semibold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            تقرير الطلبات · الخصومات والرسوم محسوبة
          </span>
        ) : (
          <span className="ms-auto rounded-lg border border-warning/30 bg-warning/10 px-3 py-1.5 text-warning">
            تقرير الطلبات غير مرفوع: الأرقام لا تشمل خصوماتك ورسوم الدفع وعرض التوصيل.{" "}
            <button type="button" className="font-semibold underline" onClick={() => fileInput.current?.click()}>
              أضفه
            </button>
          </span>
        )}
      </section>

      <section
        aria-label="المؤشرات الرئيسية"
        className="audit-kpi-strip grid sm:grid-cols-3 xl:grid-cols-6 [&>*]:border-s [&>*]:border-border/70 [&>*:first-child]:border-s-0"
      >
        <Kpi label="الإنفاق الإعلاني" value={money(totals.spent)} hint={<>تكلفة النقرة <span className="num">{ratioText(totals.cpc)}</span></>} />
        <Kpi label="مبيعات من الإعلانات" value={money(totals.gmv)} hint="شاملة الضريبة" />
        <Kpi
          label="طلبات من الإعلانات"
          value={count(totals.orders)}
          hint={<>من <span className="num">{count(totals.clicks)}</span> نقرة · <span className="num">{((totals.clickToOrder ?? 0) * 100).toFixed(1)}%</span></>}
        />
        <Kpi label="تكلفة الطلب الواحد" value={ratioText(totals.costPerOrder)} hint="ر.س إعلان لكل طلب" />
        <Kpi
          label="ROAS (محسوب)"
          value={ratioText(totals.roas)}
          hint={
            result.brands.length === 1 && result.brands[0]?.breakEvenRoas != null ? (
              <>التعادل عند <span className="num">{result.brands[0].breakEvenRoas.toFixed(2)}</span></>
            ) : (
              "المبيعات ÷ الإنفاق"
            )
          }
        />
        <div className="bg-foreground px-[18px] py-[15px] text-background">
          <p className="text-[11.5px] font-medium leading-5 opacity-75">الربح بعد الإعلان</p>
          <p className={cn("num mt-1.5 text-[21px] font-semibold", totals.profit < 0 ? "text-destructive" : "text-primary")}>
            {signed(totals.profit)}
          </p>
          <p className="mt-1 text-[11.5px] leading-5 opacity-75">{profitLabel + foodNote}</p>
        </div>
      </section>

      <section aria-label="الحكم" className="grid gap-4 md:grid-cols-3">
        <VerdictCard tone="loss" title="تخسر" count={verdict.loss.campaigns}>
          {verdict.loss.campaigns === 0 ? (
            "لا توجد حملة تخسر بعد احتساب التكاليف."
          ) : (
            <>
              صرفت <span className="num">{money(verdict.loss.spent)}</span> ر.س وخسرت{" "}
              <span className="num font-semibold text-destructive">{money(Math.abs(verdict.loss.profit))}</span> ر.س بعد احتساب التكاليف.
              إيقافها يوفر هذا المبلغ عن كل فترة مماثلة.
            </>
          )}
        </VerdictCard>
        <VerdictCard tone="thin" title="قريبة من التعادل" count={verdict.thin.campaigns}>
          ROAS أقل من ضعف خط التعادل. تربح قليلاً الآن، وأي ارتفاع في تكلفة النقرة أو الخصومات يقلبها خسارة.
        </VerdictCard>
        <VerdictCard tone="profit" title="رابحة" count={verdict.profit.campaigns}>
          {best && best.profit > 0 ? (
            <>
              أفضلها <span className="font-semibold text-foreground">{best.branchName}</span> بربح{" "}
              <span className="num">{money(best.profit)}</span> ر.س من إنفاق <span className="num">{money(best.spent)}</span>.
            </>
          ) : (
            "لا توجد حملة رابحة بوضوح."
          )}
        </VerdictCard>
      </section>

      <BreakEvenSection {...props} />

      <section className="panel space-y-3 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle
            index="02 · الحملات"
            title="حملات تحتاج قراراً"
            body="مرتبة من الأكثر خسارة. الخط الرأسي في عمود ROAS هو خط التعادل."
          />
          <div role="group" aria-label="تصفية الحملات" className="flex rounded-lg bg-muted p-0.5">
            {(
              [
                ["all", "الكل", result.campaigns.length],
                ["attention", "تخسر وقريبة", verdict.loss.campaigns + verdict.thin.campaigns],
                ["profit", "رابحة", verdict.profit.campaigns],
              ] as const
            ).map(([key, label, total]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs text-muted-foreground",
                  filter === key && "bg-card font-semibold text-foreground shadow-sm",
                )}
              >
                {label} <span className="num">{total}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-[12.5px]">
            <thead>
              <tr className="text-muted-foreground">
                {["الفرع · الحملة", "نقرات", "طلبات", "الإنفاق", "تكلفة النقرة", "المبيعات", "ROAS", "الربح بعد الإعلان", "التوصية"].map((header) => (
                  <th key={header} scope="col" className="border-b border-border px-1.5 py-2 text-start font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted-foreground">
                    لا توجد حملات في هذا التصنيف.
                  </td>
                </tr>
              ) : (
                shownCampaigns.map((campaign) => <CampaignRow key={campaign.key} campaign={campaign} />)
              )}
            </tbody>
          </table>
        </div>
      </section>

      {result.shifts.length > 0 ? (
        <section className="panel space-y-3 p-5">
          <SectionTitle
            index="03 · نقل الميزانية"
            title="في نفس الفرع، الحملة التي تصرف أكثر هي الأضعف"
            body="جرّب نقل جزء من ميزانية الحملة الضعيفة إلى القوية، وراقب النتيجة أسبوعاً قبل تعميمها."
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {result.shifts.map((shift) => (
              <div key={shift.restaurantId} className="space-y-2.5 rounded-[12px] border border-border p-3.5">
                <div className="text-[13.5px] font-bold">{shift.branchName}</div>
                <ShiftLine label="ضعيفة" tone="text-destructive" campaign={shift.weak} />
                <ShiftLine label="قوية" tone="text-success" campaign={shift.strong} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel space-y-3 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle index="04 · الفروع" title="الإعلانات حسب الفرع" body="كل حملات الفرع مجمعة." />
          <label className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs text-muted-foreground">
            ترتيب
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as BranchSort)}
              className="bg-transparent text-[13px] font-semibold text-foreground"
            >
              <option value="profit">الربح بعد الإعلان</option>
              <option value="spent">الإنفاق</option>
              <option value="costPerOrder">تكلفة الطلب</option>
              <option value="roas">ROAS</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[12.5px]">
            <thead>
              <tr className="text-muted-foreground">
                {["الفرع", "حملات", "الإنفاق", "المبيعات", "طلبات", "تكلفة الطلب", "ROAS", "التعادل", "الربح بعد الإعلان"].map((header) => (
                  <th key={header} scope="col" className="border-b border-border px-1.5 py-2 text-start font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedBranches.map((branch) => (
                <tr key={branch.restaurantId}>
                  <td className="border-b border-border/60 px-1.5 py-2.5 font-semibold">{branch.branchName}</td>
                  <Cell>{count(branch.campaigns)}</Cell>
                  <Cell>{money(branch.spent)}</Cell>
                  <Cell>{money(branch.gmv)}</Cell>
                  <Cell>{count(branch.orders)}</Cell>
                  <Cell>{branch.costPerOrder == null ? "—" : money(branch.costPerOrder)}</Cell>
                  <Cell>{ratioText(branch.roas)}</Cell>
                  <Cell>{branch.breakEvenRoas == null ? "لا يربح" : branch.breakEvenRoas.toFixed(2)}</Cell>
                  <Cell className={cn("font-semibold", branch.profit < 0 ? "text-destructive" : "text-success")}>{signed(branch.profit)}</Cell>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="px-1.5 py-2.5">الإجمالي</td>
                <Cell plain>{count(result.campaigns.length)}</Cell>
                <Cell plain>{money(totals.spent)}</Cell>
                <Cell plain>{money(totals.gmv)}</Cell>
                <Cell plain>{count(totals.orders)}</Cell>
                <Cell plain>{ratioText(totals.costPerOrder)}</Cell>
                <Cell plain>{ratioText(totals.roas)}</Cell>
                <Cell plain>—</Cell>
                <Cell plain className={totals.profit < 0 ? "text-destructive" : "text-success"}>{signed(totals.profit)}</Cell>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel space-y-2.5 p-5">
          <p className="text-[11px] font-semibold text-primary-text">05 · ملاحظات على الملف</p>
          <ul className="list-disc space-y-2 ps-5 text-[12.5px]">
            {notes.platformRoasMismatches > 0 ? (
              <li>
                ROAS الظاهر في ملف هنقرستيشن لا يطابق المبيعات ÷ الإنفاق في <span className="num">{notes.platformRoasMismatches}</span> من{" "}
                <span className="num">{notes.campaignsWithPlatformRoas}</span> حملة. تدقيق يعرض الرقم المحسوب.
              </li>
            ) : null}
            {notes.ordersNotSplit.length > 0 ? (
              <li>
                عدد الطلبات غير مفصول لكل حملة في بعض أيام: {notes.ordersNotSplit.join("، ")}. وُزّعت طلبات تلك الأيام على الحملات حسب مبيعاتها (≈).
              </li>
            ) : null}
            {notes.ordersMissing.length > 0 ? (
              <li>لا يوجد عدد طلبات في: {notes.ordersMissing.join("، ")}. احتُسب الإنفاق كاملاً بلا طلبات.</li>
            ) : null}
            {notes.packedRows > 0 ? (
              <li>
                <span className="num">{notes.packedRows}</span> سطراً في الملف فيها أكثر من حملة بقيم مفصولة بـ «;» وتم فصلها.
              </li>
            ) : null}
            {notes.defaultCommissionBrands.length > 0 ? (
              <li>لا توجد نسبة عمولة لـ {notes.defaultCommissionBrands.join("، ")}؛ استُخدمت 15%. عدّلها في افتراضات الحساب.</li>
            ) : null}
            {notes.missingFoodCostBrands.length > 0 ? (
              <li>لا توجد تكلفة طعام لـ {notes.missingFoodCostBrands.join("، ")}؛ ربحها محسوب قبل تكلفة الطعام.</li>
            ) : null}
            {!notes.ordersIncluded ? (
              <li>خصوماتك ورسوم الدفع وعرض التوصيل غير محسوبة. ارفع تقرير الطلبات لنفس الأيام لإضافتها.</li>
            ) : null}
            {notes.ordersPeriodDiffers ? (
              <li>تقرير الطلبات يغطي أياماً مختلفة عن تقرير الإعلانات؛ النسب محسوبة من كل أيامه.</li>
            ) : null}
            {notes.branchesWithoutOrders.length > 0 ? (
              <li>
                لا توجد طلبات في تقرير الطلبات لـ: {notes.branchesWithoutOrders.join("، ")}. استُخدم متوسط العلامة أو افتراضات الحساب.
              </li>
            ) : null}
          </ul>
        </div>
        <div className="panel space-y-2.5 p-5">
          <p className="text-[11px] font-semibold text-primary-text">الصيغ المستخدمة</p>
          <div className="space-y-1.5 text-[12.5px]">
            <p>ROAS = المبيعات من الإعلان ÷ الإنفاق</p>
            <p>ما يبقى من كل ريال = 1 − خصمك − الضريبة على المدفوع − العمولة − رسوم الدفع − عرض التوصيل − رسوم أخرى − تكلفة الطعام ÷ 1.15</p>
            <p>كل نسبة = مجموعها في تقرير الطلبات ÷ مجموع Subtotal للفرع</p>
            <p>خط التعادل = 1 ÷ ما يبقى من كل ريال</p>
            <p>الربح بعد الإعلان = المبيعات × ما يبقى من كل ريال − الإنفاق</p>
            <p className="text-muted-foreground">المبالغ في تقارير هنقرستيشن شاملة الضريبة، ومبيعات الإعلان (Total GMV) بسعر القائمة قبل خصمك مثل Subtotal. المبيعات من الإعلان ليست كلها إضافية؛ بعض العملاء كانوا سيطلبون بدونه.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function BreakEvenSection(props: ResultsProps) {
  const { result, settings, draft, setDraft } = props;
  const reference = result.brands.length > 0 ? [...result.brands].sort((a, b) => (a.breakEvenRoas ?? 99) - (b.breakEvenRoas ?? 99))[0]! : null;
  const costs = reference?.costs;
  const pct = (value: number | undefined) => Math.max(0, (value ?? 0) * 100);
  const otherPlatform = costs ? costs.paymentFee + costs.deliveryOffer + costs.otherFees : 0;
  const segments = costs
    ? [
        ...(costs.discount > 0 ? [{ label: `خصمك ${pct(costs.discount).toFixed(1)}%`, value: pct(costs.discount), className: "bg-[#EBD3A8] text-foreground" }] : []),
        { label: "ضريبة القيمة المضافة", value: pct(costs.vat), className: "bg-[#D9CFBD] text-foreground" },
        { label: `عمولة المنصة ${pct(costs.commission).toFixed(1)}%`, value: pct(costs.commission), className: "bg-[#A9B5B8] text-foreground" },
        ...(otherPlatform > 0
          ? [{ label: "رسوم الدفع وعرض التوصيل ورسوم أخرى", value: pct(otherPlatform), className: "bg-[#8C9A9E] text-white" }]
          : []),
        ...(reference?.foodCostRate != null
          ? [{ label: `تكلفة الطعام ${(reference.foodCostRate * 100).toFixed(0)}%`, value: pct(costs.foodCost), className: "bg-[#6E7F84] text-white" }]
          : []),
        { label: "يبقى لتغطية الإعلان", value: pct(costs.kept), className: "bg-foreground text-primary" },
      ]
    : [];
  const dirty = Object.keys(draft).length > 0;

  const valueFor = (key: string, field: "commission" | "foodCost") =>
    draft[key]?.[field] ??
    rateText(field === "commission" ? (settings[key]?.commissionRate ?? null) : (settings[key]?.foodCostRate ?? null));

  const update = (key: string, field: "commission" | "foodCost", value: string) => {
    const current = draft[key] ?? { commission: valueFor(key, "commission"), foodCost: valueFor(key, "foodCost") };
    setDraft({ ...draft, [key]: { ...current, [field]: value } });
  };

  return (
    <section className="panel grid gap-7 p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="space-y-3.5">
        <SectionTitle
          index="01 · خط التعادل"
          title="من كل 100 ر.س مبيعات من الإعلان، كم يبقى لك؟"
          body={
            reference && reference.breakEvenRoas != null
              ? `ما يبقى هو ما يغطي تكلفة الإعلان. لذلك يحتاج إعلان ${reference.brand} ROAS أعلى من ${reference.breakEvenRoas.toFixed(2)} حتى لا يخسر${result.notes.ordersIncluded ? "، والنسب تختلف قليلاً من فرع لآخر." : "."}`
              : "لا يبقى شيء لتغطية الإعلان بهذه الافتراضات."
          }
        />
        <div className="flex h-11 overflow-hidden rounded-lg text-[11.5px] font-semibold" aria-label="توزيع كل 100 ر.س من مبيعات الإعلان">
          {segments.map((segment) => (
            <div key={segment.label} style={{ width: `${segment.value}%` }} className={cn("grid place-items-center", segment.className)}>
              {segment.value >= 7 ? <span className="num">{segment.value.toFixed(2)}</span> : null}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {segments.map((segment) => (
            <span key={segment.label} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-sm", segment.className.split(" ")[0])} />
              {segment.label}
            </span>
          ))}
        </div>
        {!result.notes.ordersIncluded ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-warning">
            خصوماتك ورسوم الدفع وعرض التوصيل غير محسوبة بعد، وهي ترفع خط التعادل. ارفع تقرير الطلبات لنفس الأيام لتُضاف تلقائياً.
          </p>
        ) : null}
      </div>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">افتراضات الحساب</h3>
          <Button type="button" size="sm" variant="outline" disabled={!dirty || props.savingSettings} onClick={props.onSaveSettings}>
            {props.savingSettings ? "جارٍ الحفظ…" : "حفظ الافتراضات"}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="text-muted-foreground">
                {["العلامة", "العمولة %", "تكلفة الطعام %", "التعادل"].map((header) => (
                  <th key={header} scope="col" className="border-b border-border py-1.5 text-start font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.brands.map((brand) => {
                const key = brandKey(brand.brand);
                return (
                  <tr key={key}>
                    <td className="border-b border-border/60 py-2 font-semibold">{brand.brand}</td>
                    <td className="border-b border-border/60 py-2">
                      {brand.costSource === "orders" || brand.costSource === "brand_orders" ? (
                        <span>
                          <span className="num">{(brand.commissionRate * 100).toFixed(1)}</span>{" "}
                          <span className="text-[11px] text-success">من تقرير الطلبات</span>
                        </span>
                      ) : (
                        <RateInput
                          label={`عمولة ${brand.brand}`}
                          value={valueFor(key, "commission")}
                          placeholder="15"
                          onChange={(value) => update(key, "commission", value)}
                        />
                      )}
                    </td>
                    <td className="border-b border-border/60 py-2">
                      <RateInput
                        label={`تكلفة الطعام ${brand.brand}`}
                        value={valueFor(key, "foodCost")}
                        placeholder="—"
                        onChange={(value) => update(key, "foodCost", value)}
                      />
                    </td>
                    <td className="border-b border-border/60 py-2">
                      <span className="num font-semibold">{brand.breakEvenRoas == null ? "—" : brand.breakEvenRoas.toFixed(2)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11.5px] text-muted-foreground">
          العمولة من تقرير الطلبات إن رُفع، وإلا من هذا الجدول (15% إن تُرك فارغاً). تكلفة الطعام نسبة من السعر قبل الضريبة، وتُحفظ لكل علامة.
        </p>
      </div>
    </section>
  );
}

function RateInput({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  const invalid = parseRate(value) === "invalid";
  return (
    <input
      aria-label={label}
      aria-invalid={invalid}
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      dir="ltr"
      className={cn(
        "num h-9 w-[72px] rounded-lg border border-border bg-card px-2 text-center text-[13px]",
        invalid && "border-destructive",
      )}
    />
  );
}

function CampaignRow({ campaign }: { campaign: CampaignResult }) {
  const scale = 10;
  const width = Math.min((campaign.roas ?? 0) / scale, 1) * 100;
  const tick = campaign.breakEvenRoas == null ? null : Math.min(campaign.breakEvenRoas / scale, 1) * 100;
  return (
    <tr>
      <td className="border-b border-border/60 px-1.5 py-2.5">
        <div className="font-semibold">{campaign.branchName}</div>
        <div className="num text-[11px] text-muted-foreground">…{campaign.campaignId.slice(-6)}</div>
      </td>
      <Cell>{count(campaign.clicks)}</Cell>
      <Cell>{campaign.orders == null ? "—" : (campaign.ordersEstimated ? "≈" : "") + count(campaign.orders)}</Cell>
      <Cell>{money(campaign.spent)}</Cell>
      <Cell className={campaign.expensiveClicks ? "font-semibold text-destructive" : undefined}>{ratioText(campaign.cpc)}</Cell>
      <Cell>{money(campaign.gmv)}</Cell>
      <td className="w-[190px] border-b border-border/60 px-1.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="num w-10 font-semibold">{ratioText(campaign.roas)}</span>
          <div className="relative h-2 flex-1 rounded bg-muted" aria-hidden="true">
            <div className={cn("absolute inset-y-0 start-0 rounded", BAR_CLASS[campaign.status])} style={{ width: `${width}%` }} />
            {tick != null ? <div className="absolute -inset-y-1 w-0.5 bg-foreground" style={{ insetInlineStart: `${tick}%` }} /> : null}
          </div>
        </div>
      </td>
      <Cell className={cn("font-semibold", campaign.profit < 0 ? "text-destructive" : campaign.status === "thin" ? "text-warning" : "text-success")}>
        {signed(campaign.profit)}
      </Cell>
      <td className="border-b border-border/60 px-1.5 py-2.5">
        <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11.5px] font-semibold", ACTION_CLASS[campaign.action])}>
          {ACTION_LABEL[campaign.action]}
        </span>
      </td>
    </tr>
  );
}

function ShiftLine({ label, tone, campaign }: { label: string; tone: string; campaign: CampaignResult }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className={tone}>
        {label} <span className="num">…{campaign.campaignId.slice(-6)}</span>
      </span>
      <span>
        <span className="num">{money(campaign.spent)}</span> ر.س · ROAS <span className="num font-semibold">{ratioText(campaign.roas)}</span>
      </span>
    </div>
  );
}

function Cell({ children, className, plain }: { children: ReactNode; className?: string; plain?: boolean }) {
  return (
    <td className={cn("px-1.5 py-2.5", !plain && "border-b border-border/60", className)}>
      <span className="num">{children}</span>
    </td>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: ReactNode }) {
  return (
    <div className="bg-card px-[18px] py-[15px]">
      <p className="text-[11.5px] font-medium leading-5 text-muted-foreground">{label}</p>
      <p className="num mt-1.5 text-[21px] font-semibold tracking-[-0.01em]">{value}</p>
      <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">{hint}</p>
    </div>
  );
}

function SectionTitle({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-primary-text">{index}</p>
      <h2 className="mt-0.5 text-base font-bold">{title}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function VerdictCard({ tone, title, count: total, children }: { tone: CampaignStatus; title: string; count: number; children: ReactNode }) {
  const dot = tone === "loss" ? "bg-destructive" : tone === "thin" ? "bg-warning" : "bg-success";
  const text = tone === "loss" ? "text-destructive" : tone === "thin" ? "text-warning" : "text-success";
  return (
    <div className="panel space-y-1.5 p-5">
      <p className={cn("flex items-center gap-2 text-xs font-semibold", text)}>
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        {title}
      </p>
      <p className="text-[28px] font-bold">
        <span className="num">{total}</span> <span className="text-[15px] font-semibold">{total === 1 ? "حملة" : "حملات"}</span>
      </p>
      <p className="text-[13px] text-muted-foreground">{children}</p>
    </div>
  );
}
