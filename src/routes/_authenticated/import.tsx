import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileSpreadsheet,
  FileText,
  Loader2,
  Settings2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { analyzeHungerStation } from "@/lib/analysis/hungerstation";
import { analyzeKeeta } from "@/lib/analysis/keeta";
import {
  extractPdfText,
  parseCpcInvoice,
  parseHungerInvoice,
  parseKeetaInvoice,
} from "@/lib/analysis/pdf";
import type { Platform } from "@/lib/analysis/types";
import { savePeriod } from "@/lib/periods";
import { setSelectedPeriodId } from "@/lib/use-period";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "رفع البيانات · تدقيق" },
      { name: "description", content: "ارفع ملف الطلبات وفاتورة المنصة لبدء التدقيق." },
      { property: "og:title", content: "رفع البيانات · تدقيق" },
      { property: "og:description", content: "ارفع ملف الطلبات وفاتورة المنصة لبدء التدقيق." },
    ],
  }),
  component: ImportPage,
});

const STEPS = [
  { title: "المنصة والفترة", note: "اختر مصدر البيانات واسم الفترة" },
  { title: "ملف البيانات", note: "ارفع ملف Excel الأساسي" },
  { title: "المستندات والإعدادات", note: "الفاتورة والخيارات المساندة" },
  { title: "المراجعة والتحليل", note: "راجع المدخلات ثم ابدأ التدقيق" },
] as const;

function FileField({
  id,
  label,
  hint,
  accept,
  tag,
  file,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  accept: string;
  tag: "مطلوب" | "موصى به" | "اختياري";
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor={id} className="text-[13.5px] font-semibold">
            {label}
          </Label>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">{hint}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-[5px] px-2 py-0.5 text-[11px] font-semibold",
            tag === "مطلوب" && "bg-destructive/10 text-destructive",
            tag === "موصى به" && "bg-secondary text-primary",
            tag === "اختياري" && "bg-muted text-muted-foreground",
          )}
        >
          {tag}
        </span>
      </div>

      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      <label
        htmlFor={id}
        className={cn(
          "mt-3 flex cursor-pointer flex-wrap items-center gap-2 rounded-[8px] border border-dashed px-3 py-3 text-xs transition-colors",
          file
            ? "border-success/30 bg-success/[0.035]"
            : "border-input bg-background/70 hover:border-primary/40",
        )}
      >
        <span className="num text-[11px] text-muted-foreground">{accept}</span>
        <span className="flex-1" />
        <span className={file ? "font-medium text-foreground" : "text-muted-foreground"}>
          {file ? file.name : "اسحب الملف هنا أو"}
        </span>
        <span className="rounded-[6px] border border-input bg-white px-2.5 py-1 font-medium text-foreground">
          {file ? "تغيير الملف" : "اختر ملفاً"}
        </span>
      </label>
    </div>
  );
}

function ImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [maxStepReached, setMaxStepReached] = useState(0);
  const [platform, setPlatform] = useState<Platform>("hungerstation");
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [cpcFile, setCpcFile] = useState<File | null>(null);
  const [bankRate, setBankRate] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  function choosePlatform(next: Platform) {
    if (next === platform) return;

    setPlatform(next);
    setDataFile(null);
    setInvoiceFile(null);
    setCpcFile(null);
    setBankRate("");
    setMaxStepReached(0);
    setStep(0);
  }

  function goToStep(next: number) {
    if (next < 0 || next >= STEPS.length) return;
    if (next > maxStepReached) return;
    setStep(next);
  }

  function nextStep() {
    if (step === 1 && !dataFile) {
      toast.error("ارفع ملف البيانات الأساسي قبل الانتقال للخطوة التالية.");
      return;
    }

    const next = Math.min(step + 1, STEPS.length - 1);
    setStep(next);
    setMaxStepReached((current) => Math.max(current, next));
  }

  function previousStep() {
    setStep((current) => Math.max(0, current - 1));
  }

  async function run() {
    if (!dataFile) {
      toast.error("اختر ملف بيانات الطلبات أولاً");
      setStep(1);
      return;
    }

    setBusy(true);
    try {
      const dataBuffer = await dataFile.arrayBuffer();

      let invoice;
      if (invoiceFile) {
        const text = await extractPdfText(
          await invoiceFile.arrayBuffer(),
          platform === "hungerstation" ? 80 : 200,
        );
        invoice =
          platform === "hungerstation" ? parseHungerInvoice(text) : parseKeetaInvoice(text);
      }

      let cpcInvoice;
      if (cpcFile) {
        cpcInvoice = parseCpcInvoice(await extractPdfText(await cpcFile.arrayBuffer(), 3));
      }

      const manualRate = Number.parseFloat(bankRate.replace(",", "."));
      const result =
        platform === "hungerstation"
          ? analyzeHungerStation(dataBuffer, {
              ...(invoice ? { invoice } : {}),
              ...(cpcInvoice ? { cpcInvoice } : {}),
              ...(Number.isFinite(manualRate) && manualRate > 0
                ? { manualBankRate: manualRate / 100 }
                : {}),
              ...(label.trim() ? { label: label.trim() } : {}),
            })
          : analyzeKeeta(dataBuffer, {
              ...(invoice ? { invoice } : {}),
              ...(label.trim() ? { label: label.trim() } : {}),
            });

      const saved = await savePeriod(result);
      setSelectedPeriodId(saved.id);
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
      toast.success(`تم تحليل ${result.branches.length} فرع و${result.daily.length} يوم.`);
      navigate({ to: "/dashboard" });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "تعذّر قراءة الملفات");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[820px] space-y-5">
      <header>
        <h1 className="audit-heading">رفع بيانات فترة جديدة</h1>
        <p className="mt-1 text-[13px] leading-7 text-muted-foreground">
          أكمل كل خطوة على حدة. لن ينتقل تدقيق للمرحلة التالية قبل اكتمال البيانات المطلوبة.
        </p>
      </header>

      <WorkflowHeader
        step={step}
        maxStepReached={maxStepReached}
        onStepClick={goToStep}
      />

      <section className="rounded-[10px] border border-border bg-white">
        <div className="border-b border-border/80 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-semibold text-white">
              {step + 1}
            </span>
            <div>
              <h2 className="text-[15px] font-semibold">{STEPS[step].title}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{STEPS[step].note}</p>
            </div>
          </div>
        </div>

        <div className="p-5">
          {step === 0 ? (
            <PlatformStep
              platform={platform}
              label={label}
              onPlatformChange={choosePlatform}
              onLabelChange={setLabel}
            />
          ) : null}

          {step === 1 ? (
            <DataFileStep platform={platform} dataFile={dataFile} onChange={setDataFile} />
          ) : null}

          {step === 2 ? (
            <DocumentsStep
              platform={platform}
              invoiceFile={invoiceFile}
              cpcFile={cpcFile}
              bankRate={bankRate}
              onInvoiceChange={setInvoiceFile}
              onCpcChange={setCpcFile}
              onBankRateChange={setBankRate}
            />
          ) : null}

          {step === 3 ? (
            <ReviewStep
              platform={platform}
              label={label}
              dataFile={dataFile}
              invoiceFile={invoiceFile}
              cpcFile={cpcFile}
              bankRate={bankRate}
              onEdit={setStep}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/80 bg-background/45 px-5 py-3.5">
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={previousStep}
              disabled={busy}
            >
              <ArrowRight className="size-4" />
              السابق
            </Button>
          ) : (
            <span />
          )}

          <span className="flex-1" />

          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={nextStep}>
              التالي
              <ArrowLeft className="size-4" />
            </Button>
          ) : (
            <Button type="button" onClick={run} disabled={busy || !dataFile}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {busy ? "جارٍ التحليل…" : "بدء التحليل وحفظ الفترة"}
            </Button>
          )}
        </div>
      </section>

      <p className="px-1 text-[11.5px] leading-6 text-muted-foreground">
        كل الحسابات تتم داخل متصفحك ثم تُحفظ النتائج في حسابك. ملفات Excel وPDF نفسها لا تُرفع
        إلى قاعدة البيانات.
      </p>
    </div>
  );
}

function WorkflowHeader({
  step,
  maxStepReached,
  onStepClick,
}: {
  step: number;
  maxStepReached: number;
  onStepClick: (step: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-white">
      <div className="grid sm:grid-cols-4">
        {STEPS.map((item, index) => {
          const active = index === step;
          const complete = index < step || index < maxStepReached;
          const available = index <= maxStepReached;

          return (
            <button
              key={item.title}
              type="button"
              disabled={!available}
              onClick={() => onStepClick(index)}
              className={cn(
                "relative flex min-w-0 items-center gap-2.5 border-b border-border px-3.5 py-3 text-start transition-colors sm:border-b-0 sm:border-s",
                index === 0 && "sm:border-s-0",
                active && "bg-secondary",
                !active && available && "hover:bg-muted",
                !available && "cursor-not-allowed opacity-45",
              )}
            >
              <span
                className={cn(
                  "num grid size-[24px] shrink-0 place-items-center rounded-full border text-[11px] font-semibold",
                  active && "border-primary bg-primary text-white",
                  complete && !active && "border-success bg-success text-white",
                  !active && !complete && "border-input bg-white text-muted-foreground",
                )}
              >
                {complete && !active ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate text-[12.5px] font-semibold",
                    active ? "text-secondary-foreground" : "text-foreground/85",
                  )}
                >
                  {item.title}
                </span>
                <span className="mt-0.5 hidden truncate text-[10.5px] text-muted-foreground lg:block">
                  {item.note}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

function PlatformStep({
  platform,
  label,
  onPlatformChange,
  onLabelChange,
}: {
  platform: Platform;
  label: string;
  onPlatformChange: (platform: Platform) => void;
  onLabelChange: (value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-[13px] font-semibold">اختر المنصة</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {[
            {
              id: "hungerstation" as Platform,
              label: "هنقرستيشن",
              note: "ملف الطلبات الشهري، فاتورة PDF، وCPC اختياري.",
            },
            {
              id: "keeta" as Platform,
              label: "كيتا",
              note: "Order Summary الشهري مع فاتورة PDF الكاملة.",
            },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPlatformChange(item.id)}
              className={cn(
                "rounded-[9px] border px-4 py-4 text-start transition-colors",
                platform === item.id
                  ? "border-primary/45 bg-secondary"
                  : "border-border bg-white hover:border-input hover:bg-background/50",
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{item.label}</span>
                <span
                  className={cn(
                    "grid size-4 place-items-center rounded-full border",
                    platform === item.id
                      ? "border-primary bg-primary"
                      : "border-input bg-white",
                  )}
                >
                  {platform === item.id ? <Check className="size-2.5 text-white" /> : null}
                </span>
              </span>
              <span className="mt-1.5 block text-[11.5px] leading-5 text-muted-foreground">
                {item.note}
              </span>
            </button>
          ))}
        </div>
      </div>

      <label className="block max-w-[420px]">
        <span className="mb-1.5 block text-[13px] font-semibold">
          اسم الفترة <span className="font-normal text-muted-foreground">(اختياري)</span>
        </span>
        <Input
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
          placeholder="مثال: فاتورة سبتمبر ٢٠٢٦"
        />
        <span className="mt-1.5 block text-[11.5px] text-muted-foreground">
          إذا تركته فارغاً سيستخدم تدقيق اسم الفترة المستخرج من الملف.
        </span>
      </label>
    </div>
  );
}

function DataFileStep({
  platform,
  dataFile,
  onChange,
}: {
  platform: Platform;
  dataFile: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="space-y-4">
      <FileField
        id="data"
        label={platform === "hungerstation" ? "ملف الطلبات (Excel)" : "ملف كيتا الشهري (Excel)"}
        hint={
          platform === "hungerstation"
            ? "ارفع الملف الشهري من هنقرستيشن بأوراق الطلبات والتوصيل المجاني والتعويضات والتعديلات والمرتجعات ووقت الانتظار."
            : "ارفع ملف كيتا الشهري الذي يحتوي على ورقة Order Summary."
        }
        accept=".xlsx,.xls"
        tag="مطلوب"
        file={dataFile}
        onChange={onChange}
      />

      <div className="rounded-[9px] border border-primary/15 bg-secondary/55 px-4 py-3 text-[12px] leading-6 text-foreground/80">
        <span className="font-semibold">هذه هي قاعدة التدقيق.</span>{" "}
        سيعيد Tadqeeq بناء المبيعات والعمولات والرسوم والتسوية من هذا الملف قبل مقارنة الفاتورة.
      </div>
    </div>
  );
}

function DocumentsStep({
  platform,
  invoiceFile,
  cpcFile,
  bankRate,
  onInvoiceChange,
  onCpcChange,
  onBankRateChange,
}: {
  platform: Platform;
  invoiceFile: File | null;
  cpcFile: File | null;
  bankRate: string;
  onInvoiceChange: (file: File | null) => void;
  onCpcChange: (file: File | null) => void;
  onBankRateChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <FileField
        id="invoice"
        label="فاتورة المنصة (PDF)"
        hint={
          platform === "hungerstation"
            ? "موصى بها لإجراء المطابقة الرسمية على مستوى الإجمالي والفروع."
            : "موصى بها لقراءة Simple invoice وCredit Sales وصفحات الفروع ومطابقتها عبر Store ID."
        }
        accept=".pdf"
        tag="موصى به"
        file={invoiceFile}
        onChange={onInvoiceChange}
      />

      {platform === "hungerstation" ? (
        <>
          <FileField
            id="cpc"
            label="فاتورة الإعلانات CPC (PDF)"
            hint="أرفقها إذا كانت موجودة لإدخال تكلفة الإعلانات ضمن ملخص الفترة."
            accept=".pdf"
            tag="اختياري"
            file={cpcFile}
            onChange={onCpcChange}
          />

          <div className="rounded-[10px] border border-border bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-secondary text-primary">
                <Settings2 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <Label htmlFor="rate" className="text-[13.5px] font-semibold">
                  نسبة رسوم الدفع الإلكتروني (%)
                </Label>
                <p className="mt-1 text-xs leading-6 text-muted-foreground">
                  أدخل نسبة العقد لإجراء تحقق مستقل. إذا تركتها فارغة مع الفاتورة، سيستخدم Tadqeeq
                  النسبة المستنتجة للتسوية فقط ويصنفها كغير مستقلة.
                </p>
                <Input
                  id="rate"
                  dir="ltr"
                  value={bankRate}
                  onChange={(event) => onBankRateChange(event.target.value)}
                  placeholder="2.5"
                  className="num mt-3 max-w-[120px]"
                />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-[9px] border border-primary/15 bg-secondary/55 px-4 py-3 text-[12px] leading-6 text-foreground/80">
          لا توجد إعدادات إضافية مطلوبة لكيتا. سيطابق Tadqeeq ملف Order Summary مع PDF عبر Store ID.
        </div>
      )}
    </div>
  );
}

function ReviewStep({
  platform,
  label,
  dataFile,
  invoiceFile,
  cpcFile,
  bankRate,
  onEdit,
}: {
  platform: Platform;
  label: string;
  dataFile: File | null;
  invoiceFile: File | null;
  cpcFile: File | null;
  bankRate: string;
  onEdit: (step: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[9px] border border-success/25 bg-success/[0.035] px-4 py-3">
        <div className="flex items-start gap-2.5">
          <Check className="mt-0.5 size-4 text-success" />
          <div>
            <p className="text-[13px] font-semibold">جاهز لبدء التحليل</p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              راجع الملفات أدناه. لن يغيّر Tadqeeq قواعد المحاسبة أو بيانات المصدر أثناء التحليل.
            </p>
          </div>
        </div>
      </div>

      <ReviewSection title="المنصة والفترة" icon={Settings2} onEdit={() => onEdit(0)}>
        <ReviewRow label="المنصة" value={platform === "hungerstation" ? "هنقرستيشن" : "كيتا"} />
        <ReviewRow label="اسم الفترة" value={label.trim() || "سيُستخرج من الملف"} />
      </ReviewSection>

      <ReviewSection title="ملف البيانات" icon={FileSpreadsheet} onEdit={() => onEdit(1)}>
        <ReviewRow
          label={platform === "hungerstation" ? "ملف الطلبات" : "Order Summary"}
          value={dataFile?.name ?? "غير مرفق"}
          required
          ready={Boolean(dataFile)}
        />
      </ReviewSection>

      <ReviewSection title="المستندات والإعدادات" icon={FileText} onEdit={() => onEdit(2)}>
        <ReviewRow
          label="فاتورة المنصة"
          value={invoiceFile?.name ?? "غير مرفقة — سيعمل التحليل بدون المطابقة الرسمية"}
          ready={Boolean(invoiceFile)}
        />
        {platform === "hungerstation" ? (
          <>
            <ReviewRow label="فاتورة CPC" value={cpcFile?.name ?? "غير مرفقة"} ready={Boolean(cpcFile)} />
            <ReviewRow
              label="نسبة رسوم الدفع"
              value={bankRate.trim() ? bankRate.trim() + "%" : "لم تُدخل"}
              ready={Boolean(bankRate.trim())}
            />
          </>
        ) : null}
      </ReviewSection>

      <div className="rounded-[9px] border border-border bg-background/60 px-4 py-3">
        <p className="text-[12.5px] font-semibold">بعد الضغط على بدء التحليل</p>
        <ol className="mt-2 list-decimal space-y-1 ps-5 text-[12px] leading-6 text-foreground/75">
          <li>إعادة احتساب بنود المنصة من ملف البيانات الخام.</li>
          <li>قراءة الفاتورة والمطابقة الرسمية إذا تم إرفاق PDF.</li>
          <li>حفظ الفترة وتحديث التقارير ومركز الاستثناءات تلقائياً.</li>
        </ol>
      </div>
    </div>
  );
}

function ReviewSection({
  title,
  icon: Icon,
  onEdit,
  children,
}: {
  title: string;
  icon: typeof FileText;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[9px] border border-border">
      <div className="flex items-center gap-2.5 border-b border-border/70 bg-background/55 px-3.5 py-2.5">
        <Icon className="size-4 text-primary" />
        <h3 className="text-[12.5px] font-semibold">{title}</h3>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onEdit}
          className="text-[11.5px] font-medium text-primary hover:underline"
        >
          تعديل
        </button>
      </div>
      <dl className="px-3.5">{children}</dl>
    </section>
  );
}

function ReviewRow({
  label,
  value,
  required = false,
  ready = true,
}: {
  label: string;
  value: string;
  required?: boolean;
  ready?: boolean;
}) {
  return (
    <div className="grid gap-1 border-b border-border/60 py-2.5 last:border-b-0 sm:grid-cols-[180px_1fr] sm:items-center">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 break-words text-[12.5px] font-medium",
          required && !ready && "text-destructive",
          !required && !ready && "text-muted-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
