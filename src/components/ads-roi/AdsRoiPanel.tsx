import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Loader2, Search, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
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
import { buildAdsRoiActions, type AdsRoiAction } from "@/lib/ads-roi/actions";
import { downloadAdsRoiWorkbook, type AdsRoiExportScope } from "@/lib/ads-roi/export";
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

type UploadDialogState =
  | { kind: "busy"; files: string[] }
  | { kind: "ready"; replacesSaved: boolean }
  | { kind: "error"; message: string };

/** Let the browser paint the loading popup before reading a large file blocks the page. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
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
  const [dialog, setDialog] = useState<UploadDialogState | null>(null);
  const reading = dialog?.kind === "busy";
  const fileInput = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

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
    setDialog({ kind: "busy", files: list.map((file) => file.name) });
    await nextPaint();
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
      const replacesSaved = Boolean(
        next && historyQuery.data?.some((item) => item.dateFrom === next!.report.dateFrom && item.dateTo === next!.report.dateTo),
      );
      setDialog({ kind: "ready", replacesSaved });
    } catch (error) {
      setDialog({ kind: "error", message: error instanceof Error ? error.message : "تعذّر قراءة الملف." });
    }
  };

  const pickFiles = () => fileInput.current?.click();
  const showResults = () => {
    setDialog(null);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  };
  const download = (scope: AdsRoiExportScope) => {
    if (!result || !loaded) return;
    try {
      downloadAdsRoiWorkbook(result, { sourceFileName: loaded.sourceFileName, ordersFileName: loaded.ordersFileName }, scope);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر إنشاء ملف Excel.");
    }
  };

  const history = historyQuery.data ?? [];
  const historyUnavailable = historyQuery.error instanceof Error ? historyQuery.error.message : null;

  return (
    <div className="space-y-5">
      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".csv,.xlsx,.xls"
        className="sr-only"
        aria-label="رفع تقرير"
        tabIndex={-1}
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <UploadDialog
        state={dialog}
        result={result}
        loaded={loaded}
        saving={saveMutation.isPending}
        onClose={() => setDialog(null)}
        onShow={showResults}
        onAddFiles={pickFiles}
        onDownload={() => download("full")}
        onSave={() => loaded && saveMutation.mutate(loaded)}
      />
      {result && loaded ? (
        <div ref={resultsRef} className="scroll-mt-4">
          <AdsRoiResults
            result={result}
            loaded={loaded}
            settings={settings}
            draft={draft}
            setDraft={setDraft}
            reading={reading}
            onPickFiles={pickFiles}
            onDownload={download}
            onSave={() => saveMutation.mutate(loaded)}
            saving={saveMutation.isPending}
            onSaveSettings={() => settingsMutation.mutate()}
            savingSettings={settingsMutation.isPending}
            onClose={() => setLoaded(null)}
          />
        </div>
      ) : (
        <UploadArea reading={reading} onFiles={(files) => void handleFiles(files)} />
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
        <span className="text-base font-bold">{reading ? "جارٍ قراءة الملف…" : "اسحب تقرير الإعلانات هنا، أو الملفين معاً"}</span>
        <span className="text-[12.5px] text-muted-foreground">CSV أو Excel · يوم واحد أو شهر كامل · حتى 25 ميجابايت للملف</span>
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
      <ol className="grid gap-3 text-[12.5px] sm:grid-cols-3">
        {[
          ["تقرير الإعلانات", "من بوابة هنقرستيشن.", "مطلوب"],
          ["تقرير الطلبات", "لنفس الأيام، لحساب خصمك والرسوم.", "اختياري"],
          ["راجع وقرّر", "أوقف الخاسر، ونزّل التقرير Excel.", ""],
        ].map(([title, body, badge], index) => (
          <li key={title} className="flex items-start gap-2.5 rounded-[12px] bg-muted/50 p-3">
            <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground text-[12px] font-semibold text-background">
              {index + 1}
            </span>
            <span>
              <span className="flex items-center gap-2 font-bold">
                {title}
                {badge ? (
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold", badge === "مطلوب" ? "bg-foreground text-background" : "bg-card text-muted-foreground")}>
                    {badge}
                  </span>
                ) : null}
              </span>
              <span className="text-muted-foreground">{body}</span>
            </span>
          </li>
        ))}
      </ol>
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
  onPickFiles: () => void;
  onDownload: (scope: AdsRoiExportScope) => void;
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
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"campaigns" | "branches" | "settings" | "notes">("campaigns");
  const { totals, verdict, notes } = result;

  const needle = query.trim().toLowerCase();
  const shownCampaigns = result.campaigns.filter(
    (campaign) =>
      (filter === "all" ? true : filter === "profit" ? campaign.status === "profit" : campaign.status !== "profit") &&
      (!needle || campaign.branchName.toLowerCase().includes(needle) || campaign.campaignId.toLowerCase().includes(needle)),
  );
  const sortedBranches = [...result.branches].sort((a, b) => {
    if (sort === "spent") return b.spent - a.spent;
    if (sort === "costPerOrder") return (b.costPerOrder ?? Infinity) - (a.costPerOrder ?? Infinity);
    if (sort === "roas") return (a.roas ?? 0) - (b.roas ?? 0);
    return a.profit - b.profit;
  });
  const profitLabel = notes.ordersIncluded ? "بعد الخصومات والرسوم" : "قبل خصوماتك ورسوم الدفع والتوصيل";
  const foodNote = notes.missingFoodCostBrands.length > 0 ? " · بعض العلامات بلا تكلفة طعام" : "";

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-border bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex min-w-0 items-center gap-2 text-[13px]">
          <span className="hidden font-bold sm:inline">نتيجة التحليل</span>
          <span className="num whitespace-nowrap text-muted-foreground">{dateRange(result.dateFrom, result.dateTo)}</span>
          {loaded.savedId ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11.5px] font-semibold text-success">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              محفوظ
            </span>
          ) : (
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11.5px] font-semibold text-warning">غير محفوظ</span>
          )}
          <span className="hidden text-muted-foreground sm:inline">
            · <span className="num">{count(result.branches.length)}</span> فرعاً · <span className="num">{count(result.campaigns.length)}</span> حملة
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={props.reading} onClick={props.onPickFiles}>
            <Upload className="h-4 w-4" />
            {loaded.orders ? "رفع تقرير آخر" : "إضافة تقرير الطلبات"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => props.onDownload("full")}>
            <FileSpreadsheet className="h-4 w-4" />
            تنزيل التقرير Excel
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={props.onClose}>
            إغلاق
          </Button>
          <Button type="button" size="sm" onClick={props.onSave} disabled={props.saving || Boolean(loaded.savedId)}>
            {loaded.savedId ? "محفوظ" : props.saving ? "جارٍ الحفظ…" : "حفظ التحليل"}
          </Button>
        </div>
      </div>

      {!loaded.orders ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-warning/30 bg-warning/10 px-3 py-2 text-[12.5px] text-warning">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          بدون تقرير الطلبات: خصوماتك والرسوم غير محسوبة.
          <button type="button" className="font-semibold underline" onClick={props.onPickFiles}>
            أضفه
          </button>
        </div>
      ) : null}

      <section
        aria-label="المؤشرات الرئيسية"
        className="audit-kpi-strip grid grid-cols-2 lg:grid-cols-4 [&>*]:border-s [&>*]:border-border/70 [&>*:first-child]:border-s-0"
      >
        <Kpi label="الإنفاق الإعلاني" value={money(totals.spent)} hint={<><span className="num">{count(totals.orders)}</span> طلب · <span className="num">{ratioText(totals.costPerOrder)}</span> للطلب</>} />
        <Kpi label="مبيعات من الإعلانات" value={money(totals.gmv)} hint="شاملة الضريبة" />
        <Kpi
          label="ROAS"
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

      <ActionsPanel result={result} onOpenSettings={() => setTab("settings")} />

      <section className="panel p-4">
        <div role="tablist" aria-label="التفاصيل" className="mb-4 flex flex-wrap gap-1 border-b border-border">
          {(
            [
              ["campaigns", `الحملات (${result.campaigns.length})`],
              ["branches", `الفروع (${result.branches.length})`],
              ["settings", "الحساب والافتراضات"],
              ["notes", "ملاحظات"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-[13px]",
                tab === key ? "border-primary font-bold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "campaigns" ? (
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-xs text-muted-foreground">الخط في عمود ROAS = خط التعادل.</p>
          <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">بحث في الحملات</span>
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="فرع أو رقم حملة"
              className="h-9 w-44 rounded-lg border border-border bg-card ps-8 pe-2 text-[12.5px]"
            />
          </label>
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
          <Button type="button" variant="outline" size="sm" onClick={() => props.onDownload("campaigns")}>
            <Download className="h-4 w-4" />
            Excel
          </Button>
          </div>
        </div>
        <div className="max-h-[520px] overflow-auto rounded-lg border border-border/70">
          <table className="w-full min-w-[920px] border-collapse text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-card">
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
                    {needle ? "لا توجد حملة تطابق البحث." : "لا توجد حملات في هذا التصنيف."}
                  </td>
                </tr>
              ) : (
                shownCampaigns.map((campaign) => <CampaignRow key={campaign.key} campaign={campaign} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
        ) : tab === "branches" ? (
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <span />
          <div className="flex flex-wrap items-center gap-2">
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
          <Button type="button" variant="outline" size="sm" onClick={() => props.onDownload("branches")}>
            <Download className="h-4 w-4" />
            Excel
          </Button>
          </div>
        </div>
        <div className="max-h-[520px] overflow-auto rounded-lg border border-border/70">
          <table className="w-full min-w-[900px] border-collapse text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="text-muted-foreground">
                {["الفرع", "حملات", "الإنفاق", "المبيعات", "طلبات", "تكلفة الطلب", "ROAS", "التعادل", "يبقى من كل ريال", "الربح بعد الإعلان"].map((header) => (
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
                  <Cell className={branch.costs.kept <= 0 ? "text-destructive" : undefined}>{(branch.costs.kept * 100).toFixed(1)}%</Cell>
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
                <Cell plain>—</Cell>
                <Cell plain className={totals.profit < 0 ? "text-destructive" : "text-success"}>{signed(totals.profit)}</Cell>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
        ) : tab === "settings" ? (
          <BreakEvenSection {...props} />
        ) : (
      <div>
        <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2.5">
          <p className="text-[11px] font-semibold text-primary-text">ملاحظات على الملف</p>
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
        <div className="space-y-2.5">
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
        </div>
      </div>
        )}
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
    <section className="grid gap-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="space-y-3.5">
        <SectionTitle
          index="01 · خط التعادل"
          title="من كل 100 ر.س مبيعات من الإعلان، كم يبقى لك؟"
          body={
            reference && reference.breakEvenRoas != null
              ? `أي حملة ROAS أقل من ${reference.breakEvenRoas.toFixed(2)} تخسر.`
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
            خصوماتك والرسوم غير محسوبة بعد. ارفع تقرير الطلبات لإضافتها.
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
            <thead className="sticky top-0 z-10 bg-card">
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
          تكلفة الطعام % من السعر قبل الضريبة.
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
          <div
            className="relative h-2 flex-1 rounded bg-muted"
            aria-hidden="true"
            title={campaign.breakEvenRoas == null ? "لا يصل للتعادل بهذه التكاليف" : `خط التعادل ${campaign.breakEvenRoas.toFixed(2)}`}
          >
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

function SectionTitle({ index, title, body }: { index: string; title: string; body?: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-primary-text">{index}</p>
      <h2 className="mt-0.5 text-base font-bold">{title}</h2>
      {body ? <p className="mt-0.5 text-xs text-muted-foreground">{body}</p> : null}
    </div>
  );
}

function UploadDialog({
  state,
  result,
  loaded,
  saving,
  onClose,
  onShow,
  onAddFiles,
  onDownload,
  onSave,
}: {
  state: UploadDialogState | null;
  result: AdsRoiResult | null;
  loaded: LoadedAnalysis | null;
  saving: boolean;
  onClose: () => void;
  onShow: () => void;
  onAddFiles: () => void;
  onDownload: () => void;
  onSave: () => void;
}) {
  const busy = state?.kind === "busy";
  const ordersCount = loaded?.orders?.stores.reduce((sum, store) => sum + store.orders, 0) ?? 0;
  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        dir="rtl"
        className={cn("max-w-lg text-right [&>button]:left-4 [&>button]:right-auto", busy && "[&>button]:hidden")}
        onEscapeKeyDown={(event) => busy && event.preventDefault()}
        onInteractOutside={(event) => busy && event.preventDefault()}
      >
        {state?.kind === "busy" ? (
          <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-3 text-center">
            <Loader2 className="size-10 animate-spin text-primary-text" aria-hidden="true" />
            <DialogTitle className="text-base">جارٍ قراءة التقرير وتحليله</DialogTitle>
            <DialogDescription className="text-[13px] leading-6">
              يأخذ ثوانيَ قليلة.
            </DialogDescription>
            <ul className="w-full space-y-1 text-[12.5px] text-muted-foreground">
              {state.files.map((name) => (
                <li key={name} className="truncate">
                  <FileSpreadsheet className="me-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
                  {name}
                </li>
              ))}
            </ul>
          </div>
        ) : state?.kind === "error" ? (
          <>
            <div className="flex items-start gap-3 pt-2">
              <AlertTriangle className="mt-0.5 size-6 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <DialogTitle className="text-base text-destructive">تعذّر استخدام الملف</DialogTitle>
                <DialogDescription className="text-sm leading-6 text-foreground/85">{state.message}</DialogDescription>
                <p className="text-[12.5px] leading-6 text-muted-foreground">
                  المطلوب: تقرير الإعلانات من بوابة هنقرستيشن.
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-start">
              <Button
                type="button"
                onClick={() => {
                  onClose();
                  onAddFiles();
                }}
              >
                <Upload className="size-4" />
                اختيار ملف آخر
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                إغلاق
              </Button>
            </DialogFooter>
          </>
        ) : state?.kind === "ready" && result && loaded ? (
          <>
            <div className="flex items-start gap-3 pt-2">
              <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-1">
                <DialogTitle className="text-base">التحليل جاهز</DialogTitle>
                <DialogDescription className="text-[13px] leading-6">
                  <span className="num">{dateRange(result.dateFrom, result.dateTo)}</span> · <span className="num">{count(result.branches.length)}</span>{" "}
                  فرعاً · <span className="num">{count(result.campaigns.length)}</span> حملة
                </DialogDescription>
              </div>
            </div>

            <ul className="space-y-1.5 rounded-[10px] border border-border bg-card p-3 text-[12.5px]">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <span className="font-semibold">تقرير الإعلانات</span>
                <span className="truncate text-muted-foreground">{loaded.sourceFileName}</span>
              </li>
              {loaded.orders ? (
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  <span className="font-semibold">تقرير الطلبات</span>
                  <span className="text-muted-foreground">
                    <span className="num">{count(ordersCount)}</span> طلباً مكتملاً · الخصومات والرسوم محسوبة
                  </span>
                </li>
              ) : (
                <li className="flex flex-wrap items-center gap-2 text-warning">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>بدون تقرير الطلبات: خصوماتك والرسوم غير محسوبة.</span>
                  <button type="button" className="font-semibold underline" onClick={onAddFiles}>
                    إضافته الآن
                  </button>
                </li>
              )}
            </ul>

            <div className="grid grid-cols-3 gap-2">
              <DialogStat label="الإنفاق" value={money(result.totals.spent)} />
              <DialogStat
                label="الربح بعد الإعلان"
                value={signed(result.totals.profit)}
                tone={result.totals.profit < 0 ? "text-destructive" : "text-success"}
              />
              <DialogStat
                label="حملات تخسر"
                value={count(result.verdict.loss.campaigns)}
                tone={result.verdict.loss.campaigns > 0 ? "text-destructive" : undefined}
              />
            </div>

            {result.notes.missingFoodCostBrands.length > 0 || state.replacesSaved ? (
              <ul className="space-y-1 text-[12px] leading-5 text-muted-foreground">
                {result.notes.missingFoodCostBrands.length > 0 ? (
                  <li>أدخل تكلفة الطعام لـ {result.notes.missingFoodCostBrands.join("، ")} ليظهر الربح الحقيقي.</li>
                ) : null}
                {state.replacesSaved ? <li>يوجد تحليل محفوظ لنفس الأيام؛ الحفظ سيستبدله.</li> : null}
              </ul>
            ) : null}

            <DialogFooter className="flex-wrap gap-2 sm:justify-start">
              <Button type="button" onClick={onShow}>
                عرض التحليل
              </Button>
              <Button type="button" variant="outline" onClick={onDownload}>
                <FileSpreadsheet className="size-4" />
                تنزيل Excel
              </Button>
              <Button type="button" variant="outline" onClick={onSave} disabled={saving || Boolean(loaded.savedId)}>
                {loaded.savedId ? "محفوظ" : saving ? "جارٍ الحفظ…" : "حفظ التحليل"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DialogStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-card px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("num mt-1 text-[15px] font-semibold", tone)}>{value}</p>
    </div>
  );
}


function ActionsPanel({ result, onOpenSettings }: { result: AdsRoiResult; onOpenSettings: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const actions = buildAdsRoiActions(result);
  const shown = expanded ? actions : actions.slice(0, 5);
  const { verdict, notes } = result;
  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold">ماذا تفعل الآن</h2>
        <div className="flex flex-wrap gap-1.5 text-[11.5px] font-semibold">
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
            <span className="num">{verdict.loss.campaigns}</span> تخسر
          </span>
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning">
            <span className="num">{verdict.thin.campaigns}</span> ضعيفة
          </span>
          <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">
            <span className="num">{verdict.profit.campaigns}</span> رابحة
          </span>
        </div>
      </div>
      {notes.missingFoodCostBrands.length > 0 ? (
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          أدخل تكلفة الطعام لـ {notes.missingFoodCostBrands.join("، ")} ليكون الربح حقيقياً.{" "}
          <button type="button" className="font-semibold text-primary-text underline" onClick={onOpenSettings}>
            إدخالها
          </button>
        </p>
      ) : null}
      {actions.length === 0 ? (
        <p className="mt-3 text-[13px] text-success">كل الحملات رابحة. لا يوجد إجراء عاجل.</p>
      ) : (
        <ol className="mt-2 divide-y divide-border/70">
          {shown.map((action) => (
            <ActionRow key={action.key} action={action} />
          ))}
        </ol>
      )}
      {actions.length > 5 ? (
        <button type="button" onClick={() => setExpanded(!expanded)} className="mt-1 text-[12.5px] font-semibold text-primary-text underline">
          {expanded ? "عرض أقل" : `عرض كل الإجراءات (${actions.length})`}
        </button>
      ) : null}
    </section>
  );
}

function ActionRow({ action }: { action: AdsRoiAction }) {
  const badge =
    action.kind === "stop"
      ? { label: "أوقف", className: "bg-destructive text-white" }
      : action.kind === "shift"
        ? { label: "انقل الميزانية", className: "bg-foreground text-background" }
        : { label: "خفّض المزايدة", className: "bg-warning text-white" };
  const branch = action.kind === "shift" ? action.shift.branchName : action.campaign.branchName;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 py-2.5 text-[13px] sm:flex">
      <span className={cn("w-[96px] shrink-0 rounded-md px-2 py-1 text-center text-[11.5px] font-bold", badge.className)}>{badge.label}</span>
      <span className="min-w-0 flex-1 truncate font-semibold">{branch}</span>
      {action.kind === "stop" ? (
        <span className="col-start-2 text-muted-foreground" title={`الحملة …${action.campaign.campaignId.slice(-6)}`}>
          تخسر <span className="num font-semibold text-destructive">{money(Math.abs(action.campaign.profit))}</span> · ROAS{" "}
          <span className="num">{ratioText(action.campaign.roas)}</span>
        </span>
      ) : action.kind === "shift" ? (
        <span className="col-start-2 text-muted-foreground">
          من ROAS <span className="num font-semibold text-destructive">{ratioText(action.shift.weak.roas)}</span> إلى{" "}
          <span className="num font-semibold text-success">{ratioText(action.shift.strong.roas)}</span>
        </span>
      ) : (
        <span className="col-start-2 text-muted-foreground" title={`الحملة …${action.campaign.campaignId.slice(-6)}`}>
          النقرة <span className="num font-semibold text-warning">{ratioText(action.campaign.cpc)}</span> ر.س · ROAS{" "}
          <span className="num">{ratioText(action.campaign.roas)}</span>
        </span>
      )}
    </li>
  );
}
