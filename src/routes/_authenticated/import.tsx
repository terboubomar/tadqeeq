import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileSpreadsheet, FileText, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  file,
  onChange,
  icon: Icon,
}: {
  id: string;
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  icon: typeof FileText;
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Label htmlFor={id} className="text-sm font-bold">
            {label}
          </Label>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">{hint}</p>
          <Input
            id={id}
            type="file"
            accept={accept}
            className="mt-3 cursor-pointer file:ms-0 file:me-3 file:cursor-pointer"
            onChange={(event) => onChange(event.target.files?.[0] ?? null)}
          />
          {file ? (
            <p className="mt-2 truncate text-xs text-success">{file.name}</p>
          ) : null}
        </div>
      </div>
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
        const text = await extractPdfText(await invoiceFile.arrayBuffer(), 3);
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
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-black">رفع بيانات فترة جديدة</h1>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          كل الحسابات تتم داخل متصفحك ثم تُحفظ النتائج في حسابك. الملفات نفسها لا تُرفع لأي مكان.
        </p>
      </header>

      <div className="panel space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>المنصة</Label>
            <Select value={platform} onValueChange={(value) => setPlatform(value as Platform)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hungerstation">هنقرستيشن</SelectItem>
                <SelectItem value="keeta">كيتا</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="label">اسم الفترة (اختياري)</Label>
            <Input
              id="label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="مثال: فاتورة يناير ٢٠٢٦"
            />
          </div>
        </div>
      </div>

      <FileField
        id="data"
        label={platform === "hungerstation" ? "ملف الطلبات (Excel)" : "ملف الفواتير (Excel)"}
        hint={
          platform === "hungerstation"
            ? "الملف الشهري من هنقرستيشن بأوراقه الست: الطلبات، التوصيل المجاني، التعويضات، تعديلات التنفيذ، المرتجعات المعتمدة، ووقت الانتظار."
            : "ملف كيتا الذي يحتوي على ورقة Invoice Details بتفاصيل كل فرع."
        }
        accept=".xlsx,.xls"
        file={dataFile}
        onChange={setDataFile}
        icon={FileSpreadsheet}
      />

      <FileField
        id="invoice"
        label="فاتورة المنصة (PDF) — اختياري"
        hint="عند إرفاقها تتم مقارنة كل بند محتسب بالرقم المطالب به، ويُستخرج منها معدل رسوم الدفع الإلكتروني تلقائياً."
        accept=".pdf"
        file={invoiceFile}
        onChange={setInvoiceFile}
        icon={FileText}
      />

      {platform === "hungerstation" ? (
        <>
          <FileField
            id="cpc"
            label="فاتورة الإعلانات CPC (PDF) — اختياري"
            hint="تُعرض كتكلفة إضافية ضمن ملخص الفترة."
            accept=".pdf"
            file={cpcFile}
            onChange={setCpcFile}
            icon={FileText}
          />

          <div className="panel p-5">
            <Label htmlFor="rate" className="text-sm font-bold">
              نسبة رسوم الدفع الإلكتروني (%)
            </Label>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              اتركها فارغة إذا أرفقت الفاتورة — سيتم استخراج النسبة الفعلية منها. املأها فقط إذا
              أردت استخدام نسبة العقد المتفق عليها.
            </p>
            <Input
              id="rate"
              dir="ltr"
              value={bankRate}
              onChange={(event) => setBankRate(event.target.value)}
              placeholder="2.5"
              className="mt-3 max-w-32"
            />
          </div>
        </>
      ) : null}

      <Button size="lg" className="w-full" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {busy ? "جارٍ التحليل…" : "تحليل وحفظ الفترة"}
      </Button>
    </div>
  );
}
