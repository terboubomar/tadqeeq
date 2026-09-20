import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Upload } from "lucide-react";
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
        className="mt-3 flex cursor-pointer flex-wrap items-center gap-2 rounded-[8px] border border-dashed border-input bg-background/70 px-3 py-3 text-xs transition-colors hover:border-primary/40"
      >
        <span className="num text-[11px] text-muted-foreground">{accept}</span>
        <span className="flex-1" />
        <span className="text-muted-foreground">
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

  const [platform, setPlatform] = useState<Platform>("hungerstation");
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [cpcFile, setCpcFile] = useState<File | null>(null);
  const [bankRate, setBankRate] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!dataFile) {
      toast.error("اختر ملف بيانات الطلبات أولاً");
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
    <div className="max-w-[760px] space-y-5">
      <header>
        <h1 className="audit-heading">رفع بيانات فترة جديدة</h1>
        <p className="mt-1 text-[13px] leading-7 text-muted-foreground">
          كل الحسابات تتم داخل متصفحك ثم تُحفظ النتائج في حسابك. الملفات نفسها لا تُرفع لأي مكان.
        </p>
      </header>

      <div className="grid overflow-hidden rounded-[10px] border border-border bg-white sm:grid-cols-3">
        {[
          ["1", "المنصة والفترة", "مصدر البيانات"],
          ["2", "الملفات", "طلبات + فاتورة"],
          ["3", "الإعدادات", platform === "hungerstation" ? "نسبة رسوم الدفع" : "جاهز للتحليل"],
        ].map(([num, title, note], index) => (
          <div
            key={num}
            className={cn(
              "flex items-center gap-2.5 px-3.5 py-3",
              index > 0 && "border-t border-border sm:border-s sm:border-t-0",
            )}
          >
            <span className="num grid size-[22px] shrink-0 place-items-center rounded-full bg-primary text-[11.5px] font-semibold text-white">
              {num}
            </span>
            <span>
              <span className="block text-[12.5px] font-semibold">{title}</span>
              <span className="block text-[11px] text-muted-foreground">{note}</span>
            </span>
          </div>
        ))}
      </div>

      <section className="rounded-[10px] border border-border bg-white p-[18px]">
        <p className="mb-2 text-[13px] font-semibold">المنصة</p>
        <div className="flex flex-wrap gap-2.5">
          {[
            {
              id: "hungerstation" as Platform,
              label: "هنقرستيشن",
              note: "ملف الطلبات الشهري + فاتورة PDF + CPC اختياري.",
            },
            {
              id: "keeta" as Platform,
              label: "كيتا",
              note: "Order Summary الشهري + فاتورة PDF الكاملة.",
            },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPlatform(item.id)}
              className={cn(
                "flex-1 basis-[220px] rounded-[9px] border px-4 py-3.5 text-start",
                platform === item.id
                  ? "border-primary/40 bg-secondary"
                  : "border-border bg-white hover:border-input",
              )}
            >
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="mt-1 block text-[11.5px] leading-5 text-muted-foreground">
                {item.note}
              </span>
            </button>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] font-semibold">
            اسم الفترة <span className="font-normal text-muted-foreground">(اختياري)</span>
          </span>
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="مثال: فاتورة سبتمبر ٢٠٢٦"
            className="max-w-[340px]"
          />
        </label>
      </section>

      <div className="space-y-3">
        <FileField
          id="data"
          label={platform === "hungerstation" ? "ملف الطلبات (Excel)" : "ملف كيتا الشهري (Excel)"}
          hint={
            platform === "hungerstation"
              ? "الملف الشهري من هنقرستيشن بأوراقه الست: الطلبات، التوصيل المجاني، التعويضات، تعديلات التنفيذ، المرتجعات المعتمدة، ووقت الانتظار."
              : "ملف كيتا الشهري الذي يحتوي على ورقة Order Summary ويُستخدم لإعادة احتساب التسوية لكل فرع."
          }
          accept=".xlsx,.xls"
          tag="مطلوب"
          file={dataFile}
          onChange={setDataFile}
        />

        <FileField
          id="invoice"
          label="فاتورة المنصة (PDF)"
          hint={
            platform === "hungerstation"
              ? "تتم مقارنة الإجماليات والفروع ببنود الفاتورة، ويُستخرج منها معدل رسوم الدفع عند الحاجة."
              : "تتم قراءة Simple invoice وCredit Sales وصفحات كل فرع، ثم المطابقة عبر Store ID."
          }
          accept=".pdf"
          tag="موصى به"
          file={invoiceFile}
          onChange={setInvoiceFile}
        />

        {platform === "hungerstation" ? (
          <FileField
            id="cpc"
            label="فاتورة الإعلانات CPC (PDF)"
            hint="تُعرض كتكلفة إضافية ضمن ملخص الفترة."
            accept=".pdf"
            tag="اختياري"
            file={cpcFile}
            onChange={setCpcFile}
          />
        ) : null}
      </div>

      <section className="rounded-[10px] border border-border bg-white p-[18px]">
        {platform === "hungerstation" ? (
          <>
            <Label htmlFor="rate" className="text-[13.5px] font-semibold">
              نسبة رسوم الدفع الإلكتروني (%)
            </Label>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              أدخل نسبة العقد لإجراء تحقق مستقل. إذا تركتها فارغة مع إرفاق الفاتورة،
              سيستنتج «تدقيق» نسبة تقريبية للتسوية ويعرضها كغير مستقلة.
            </p>
            <Input
              id="rate"
              dir="ltr"
              value={bankRate}
              onChange={(event) => setBankRate(event.target.value)}
              placeholder="2.5"
              className="num mt-3 max-w-[110px]"
            />
          </>
        ) : (
          <>
            <p className="text-[13.5px] font-semibold">جاهز للتحليل</p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              سيعيد تدقيق احتساب مبيعات كيتا والعمولة ورسوم البنك والتوصيل والحملات والإعلانات
              وصافي Payable لكل فرع، ثم يطابق الفاتورة عبر Store ID.
            </p>
          </>
        )}

        <div className="mt-4 border-t border-border/70 pt-3.5">
          <p className="mb-1.5 text-[13px] font-semibold">ما سيحدث بعد التحليل</p>
          <ul className="list-disc space-y-1 ps-5 text-[12.5px] leading-6 text-foreground/75">
            <li>إعادة احتساب بنود المنصة من الملف الخام على مستوى الفرع.</li>
            <li>مطابقة الفاتورة وإظهار الفروقات القابلة للتحقق بشكل مستقل.</li>
            <li>حفظ الفترة في الأرشيف وتحديث مركز الاستثناءات تلقائياً.</li>
          </ul>
        </div>
      </section>

      <Button size="lg" className="w-full" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {busy ? "جارٍ التحليل…" : "تحليل وحفظ الفترة"}
      </Button>
    </div>
  );
}
