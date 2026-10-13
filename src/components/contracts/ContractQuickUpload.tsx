import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Sparkles } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ContractImportResult, DraftRule } from "@/lib/contract-reading";
import { importContract } from "@/lib/contract-reading.functions";
import { CONTRACT_PLATFORMS, PLATFORM_LABELS, RULE_TYPE_LABELS } from "@/lib/contract-rulebook";
import { approveContractVersion } from "@/lib/contract-rulebook.functions";
import { uploadSizeError } from "@/lib/upload-validation";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.csv";

function ruleValue(rule: DraftRule): string {
  if (rule.valueKind === "percentage") return `${rule.numericValue}%`;
  if (rule.valueKind === "amount") return `${rule.numericValue} ر.س`;
  return rule.textValue ?? "—";
}

/**
 * Upload a platform contract and Tadqeeq sets it up: it reads the file, creates the contract (or a new version of
 * the platform's contract) with its dates, keeps the document and adds every term. One click then approves it.
 */
export function ContractQuickUpload({
  onImported,
  onApproved,
}: {
  onImported: (result: ContractImportResult) => Promise<void>;
  onApproved: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [platform, setPlatform] = useState<string>("auto");
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ContractImportResult | null>(null);

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.set("file", file);
      if (platform !== "auto") form.set("platform", platform);
      return importContract({ data: form });
    },
    onSuccess: async (imported) => {
      if (inputRef.current) inputRef.current.value = "";
      await onImported(imported);
      setResult(imported);
    },
    onError: (error: Error) => {
      if (inputRef.current) inputRef.current.value = "";
      toast.error(error.message);
    },
  });

  function start(file: File | null | undefined) {
    if (!file || upload.isPending) return;
    const sizeError = uploadSizeError(file.size);
    if (sizeError) {
      toast.error(sizeError);
      return;
    }
    if (!/\.(pdf|png|jpe?g|csv)$/i.test(file.name)) {
      toast.error("ارفع العقد بصيغة PDF أو صورة.");
      return;
    }
    upload.mutate(file);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    start(event.dataTransfer.files?.[0]);
  }

  return (
    <section className="rounded-[12px] border border-border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-primary-text" />
            ارفع العقد وتدقيق يتولى الباقي
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            يقرأ تدقيق العقد وينشئ نسخة بتواريخه ويضيف كل الرسوم والعمولات، ثم تعتمدها بضغطة. بعد الاعتماد تُفحص فواتير المنصة مقابل العقد
            وتظهر الزيادات في «رادار».
          </p>
        </div>
        <Select value={platform} onValueChange={setPlatform} disabled={upload.isPending}>
          <SelectTrigger aria-label="المنصة" className="h-9 w-auto min-w-40 bg-card text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">تحديد المنصة تلقائياً</SelectItem>
            {CONTRACT_PLATFORMS.map((item) => (
              <SelectItem key={item} value={item}>
                {PLATFORM_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragging ? "border-primary bg-secondary/60" : "border-border hover:border-primary/50 hover:bg-muted/40",
          upload.isPending && "pointer-events-none opacity-80",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          disabled={upload.isPending}
          onChange={(event) => start(event.target.files?.[0])}
        />
        {upload.isPending ? (
          <>
            <Loader2 className="size-7 animate-spin text-primary-text" />
            <span className="text-sm font-semibold">يقرأ تدقيق العقد…</span>
            <span className="text-xs text-muted-foreground">يستغرق عادة أقل من دقيقة. لا تغلق الصفحة.</span>
          </>
        ) : (
          <>
            <FileUp className="size-7 text-primary-text" />
            <span className="text-sm font-semibold">اسحب ملف العقد هنا أو اضغط لاختياره</span>
            <span className="text-xs text-muted-foreground">PDF أو صورة · حتى 25 MB</span>
          </>
        )}
      </label>

      <ContractImportSummary result={result} onClose={() => setResult(null)} onApproved={onApproved} />
    </section>
  );
}

/** What was set up from the contract, with one button to approve it. */
function ContractImportSummary({
  result,
  onClose,
  onApproved,
}: {
  result: ContractImportResult | null;
  onClose: () => void;
  onApproved: () => Promise<void>;
}) {
  const approve = useMutation({
    mutationFn: () => approveContractVersion({ data: { contractId: result!.contractId, versionId: result!.versionId } }),
    onSuccess: async () => {
      toast.success("تم اعتماد العقد. الفواتير تُفحص الآن مقابله.");
      await onApproved();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const blocked = !result || result.rules.length === 0 || result.overlapsVersion !== null;

  return (
    <Dialog open={result !== null} onOpenChange={(next) => !next && !approve.isPending && onClose()}>
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-2xl overflow-y-auto text-right [&>button]:left-4 [&>button]:right-auto">
        {result ? (
          <div className="space-y-4">
            <div className="space-y-1.5 pt-2">
              <DialogTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="size-5 text-success" />
                جاهز للاعتماد
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-6">{result.summary}</DialogDescription>
              <p className="text-[12px] text-muted-foreground">
                {result.createdContract ? "عقد جديد" : "نسخة جديدة من"} «{result.contractName}» · {PLATFORM_LABELS[result.platform]} · سارية من{" "}
                <span className="num">{result.effectiveFrom}</span> إلى <span className="num">{result.effectiveTo ?? "مفتوح"}</span>
              </p>
            </div>

            {result.overlapsVersion !== null ? (
              <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.04] px-3.5 py-3 text-[12.5px] leading-5 text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                تواريخ هذه النسخة تتداخل مع النسخة المعتمدة <span className="num">{result.overlapsVersion}</span> من نفس العقد، فلا يمكن اعتمادها.
                عدّل تواريخها من «نسخ العقد» أو احذفها إن كان العقد نفسه معتمداً مسبقاً.
              </p>
            ) : null}

            {result.warnings.length ? (
              <ul className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-3 text-[12.5px] leading-5 text-amber-800">
                {result.warnings.map((warning) => (
                  <li key={warning} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {result.rules.length ? (
              <ul className="divide-y divide-border/70 rounded-lg border border-border">
                {result.rules.map((rule) => (
                  <li key={`${rule.ruleKey}-${rule.scopeKey ?? ""}`} className="px-3.5 py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="text-[13px] font-semibold">
                        {rule.label}
                        <span className="ms-2 text-[11px] font-normal text-muted-foreground">
                          {RULE_TYPE_LABELS[rule.ruleType]}
                          {rule.scopeType === "branch" ? ` · ${rule.scopeKey}` : ""}
                        </span>
                      </p>
                      <span className="num text-[13px] font-semibold">{ruleValue(rule)}</span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-5 text-muted-foreground">{rule.notes}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
                لم يُعثر على رسوم واضحة في الملف. أضف البنود يدوياً في النسخة ثم اعتمدها.
              </p>
            )}

            <p className="text-[11.5px] leading-5 text-muted-foreground">
              بعد الاعتماد تُقفل النسخة. إذا كان رقم غير مطابق للعقد، اختر «مراجعة قبل الاعتماد» وعدّله أولاً.
            </p>

            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="button" disabled={blocked || approve.isPending} onClick={() => approve.mutate()}>
                {approve.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                اعتماد
              </Button>
              <Button type="button" variant="outline" disabled={approve.isPending} onClick={onClose}>
                مراجعة قبل الاعتماد
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
