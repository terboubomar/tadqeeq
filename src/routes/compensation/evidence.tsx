import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Search, Send, Video } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { COMPENSATION_CASES_KEY, formatTimestamp } from "@/components/compensation/queries";
import { CompHeader, DraftBox, EvidenceActions, Field, Tag } from "@/components/compensation/shared";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveCompensationCase, searchCompensationEvidence } from "@/lib/compensation-evidence.functions";
import type {
  CompensationCaseRecord,
  CompensationEvidenceRecord,
  JahezCompensationMatchRecord,
} from "@/lib/compensation-evidence.server";
import type { CompensationPlatformKey } from "@/lib/compensation-overview";
import { sar } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PlatformName } from "@/components/brand/PlatformLogo";

export const Route = createFileRoute("/compensation/evidence")({ component: EvidencePage });

function EvidencePage() {
  const { can } = useWorkspaceAccess();
  const canManage = can("compensation.manage");
  const canViewMedia = can("telegram.read");
  const queryClient = useQueryClient();
  const [orderNumber, setOrderNumber] = useState("");
  const [selectedEvidence, setSelectedEvidence] = useState<CompensationEvidenceRecord | null>(null);
  const [platform, setPlatform] = useState<CompensationPlatformKey | "">("");
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [caseBranch, setCaseBranch] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [explanation, setExplanation] = useState("");
  const [generatedCase, setGeneratedCase] = useState<CompensationCaseRecord | null>(null);

  const searchMutation = useMutation({
    mutationFn: (value: string) => searchCompensationEvidence({ data: { orderNumber: value } }),
    onSuccess: (result) => {
      setGeneratedCase(null);
      setSelectedEvidence(result.evidence[0] ?? null);
      if (result.evidence[0]) setCaseBranch(result.evidence[0].branchName);
      if (result.jahezMatches[0]) applyJahezMatch(result.jahezMatches[0]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveMutation = useMutation({
    mutationFn: (status: "draft" | "ready") => {
      if (!platform) throw new Error("اختر المنصة أولاً.");
      const compensationAmount = Number(amount.replace(/,/g, ""));
      if (!Number.isFinite(compensationAmount) || compensationAmount < 0) {
        throw new Error("أدخل مبلغ تعويض صالحاً.");
      }
      return saveCompensationCase({
        data: {
          platform,
          orderNumber: orderNumber.trim(),
          periodId,
          evidenceId: selectedEvidence?.id ?? null,
          branchName: caseBranch.trim() || null,
          compensationAmount,
          compensationReason: reason,
          employeeExplanation: explanation,
          status,
        },
      });
    },
    onSuccess: async (result) => {
      setGeneratedCase(result);
      toast.success(result.status === "draft" ? "تم حفظ الحالة كمسودة" : "تم إنشاء ملف الاعتراض");
      await queryClient.invalidateQueries({ queryKey: COMPENSATION_CASES_KEY });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function applyJahezMatch(match: JahezCompensationMatchRecord) {
    setPlatform("jahez");
    setPeriodId(match.periodId);
    setCaseBranch(match.matchedBranch || match.branch || "");
    setAmount(String(match.amount));
    setReason(match.reason || "تعويض من تقرير جاهز");
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (orderNumber.trim().length >= 3) searchMutation.mutate(orderNumber.trim());
  }

  const canSave =
    canManage && !saveMutation.isPending && orderNumber.trim().length >= 3 && reason.trim() && explanation.trim();

  return (
    <div className="space-y-5">
      <CompHeader
        title="الأدلة وبناء الاعتراض"
        sub="ابحث برقم الطلب، اختر دليل الفرع، وأنشئ ملف اعتراض جاهزاً للمنصة"
      />

      <form onSubmit={submitSearch} className="flex flex-wrap gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="رقم الطلب"
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            placeholder="رقم الطلب كاملاً أو آخر 4 أرقام منه"
            className="h-12 border-foreground/60 bg-card ps-10 text-base"
            dir="ltr"
          />
        </div>
        <Button type="submit" className="h-12 px-6" disabled={orderNumber.trim().length < 3 || searchMutation.isPending}>
          {searchMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          بحث
        </Button>
      </form>

      {searchMutation.data ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <section>
            <h2 className="text-sm font-bold">
              دليل Telegram <span className="num font-normal text-muted-foreground">({searchMutation.data.evidence.length})</span>
            </h2>
            <div className="mt-3 space-y-3">
              {searchMutation.data.evidence.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex gap-3 rounded-xl border bg-card p-3 transition-colors",
                    selectedEvidence?.id === item.id ? "border-2 border-primary" : "border-border",
                  )}
                >
                  <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={"دليل الطلب " + item.orderNumber} className="h-full w-full object-cover" />
                    ) : (
                      <Video className="size-7 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{item.branchName}</p>
                    <p className="num mt-1 text-xs text-muted-foreground">{formatTimestamp(item.capturedAt)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.senderName || "مرسل غير معروف"}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={selectedEvidence?.id === item.id ? "default" : "outline"}
                        aria-pressed={selectedEvidence?.id === item.id}
                        onClick={() => {
                          setSelectedEvidence(item);
                          setCaseBranch(item.branchName);
                        }}
                      >
                        {selectedEvidence?.id === item.id ? "الدليل المختار" : "اختيار هذا الدليل"}
                      </Button>
                      {item.telegramUrl ? (
                        <a
                          href={item.telegramUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                        >
                          <Video className="size-3.5" />
                          فتح في Telegram
                        </a>
                      ) : null}
                    </div>
                    {canViewMedia ? <EvidenceActions id={item.id} /> : null}
                  </div>
                </div>
              ))}
              {searchMutation.data.evidence.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  لا يوجد دليل Telegram بهذا الرقم حتى الآن.
                </div>
              ) : null}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-bold">بيانات التعويض المتاحة</h2>
            <div className="mt-3 space-y-3">
              {searchMutation.data.jahezMatches.map((match, index) => (
                <div key={match.periodId + ":" + index} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">جاهز · {match.periodLabel}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {match.branch} · {match.transactionType}
                      </p>
                    </div>
                    <span className="num font-semibold">{sar(match.amount)}</span>
                  </div>
                  <p className="mt-2 text-sm">{match.reason || "بدون سبب مسجل"}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <Tag positive={match.match !== "unknown"}>
                      {match.match === "current" ? "طلب من الفترة" : match.match === "historical" ? "طلب تاريخي" : "طلب غير معروف"}
                    </Tag>
                    {match.duplicateCandidate ? <Tag positive={false}>اشتباه تكرار</Tag> : null}
                    {match.branchMismatch ? <Tag positive={false}>اختلاف فرع</Tag> : null}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => applyJahezMatch(match)}>
                    استخدام بيانات جاهز
                  </Button>
                </div>
              ))}
              {searchMutation.data.jahezMatches.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  لا توجد حركة تعويض جاهز مطابقة في الفترات الحالية. يمكن إنشاء الاعتراض يدوياً لهنقرستيشن أو كيتا أو جاهز.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-bold">ملف الاعتراض</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          يشرح الموظف الواقعة، ويبني تدقيق رسالة الاعتراض من البيانات المؤكدة.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="المنصة">
            <Select
              value={platform}
              onValueChange={(value) => {
                setPlatform(value as CompensationPlatformKey);
                if (value !== "jahez") setPeriodId(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر المنصة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hungerstation"><PlatformName platform="hungerstation" /></SelectItem>
                <SelectItem value="keeta"><PlatformName platform="keeta" /></SelectItem>
                <SelectItem value="jahez"><PlatformName platform="jahez" /></SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="رقم الطلب">
            <Input value={orderNumber} readOnly dir="ltr" />
          </Field>
          <Field label="الفرع">
            <Input value={caseBranch} onChange={(event) => setCaseBranch(event.target.value)} placeholder="اسم الفرع" />
          </Field>
          <Field label="مبلغ التعويض (ر.س)">
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              dir="ltr"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Field label="سبب التعويض المسجل في المنصة">
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="مثال: Missing item" />
          </Field>
          <Field label="الدليل المختار">
            <div className="min-h-9 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
              {selectedEvidence
                ? selectedEvidence.branchName + " · " + formatTimestamp(selectedEvidence.capturedAt)
                : "لا يوجد دليل مختار"}
            </div>
          </Field>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-semibold text-muted-foreground">شرح الموظف</span>
          <textarea
            value={explanation}
            onChange={(event) => setExplanation(event.target.value)}
            rows={4}
            placeholder="اكتب ما حدث فعلياً في الفرع، وما الذي يظهره الدليل، ولماذا يجب مراجعة التعويض."
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
          />
        </label>

        {canManage ? (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={!canSave} onClick={() => saveMutation.mutate("draft")}>
              حفظ كمسودة
            </Button>
            <Button type="button" disabled={!canSave} onClick={() => saveMutation.mutate("ready")}>
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              إنشاء رسالة الاعتراض
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">دورك يسمح بالاطلاع فقط.</p>
        )}

        {generatedCase ? (
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <DraftBox title="العربية" value={generatedCase.draftAr} />
            <DraftBox title="English" value={generatedCase.draftEn} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
