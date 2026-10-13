import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import type { ContractReadingResult, DraftRule } from "@/lib/contract-reading";
import { RULE_TYPE_LABELS, type ContractRuleRecord } from "@/lib/contract-rulebook";
import { saveContractRule } from "@/lib/contract-rulebook.functions";
import { cn } from "@/lib/utils";

const ruleIdentity = (rule: Pick<DraftRule, "ruleKey" | "scopeType" | "scopeKey">) =>
  `${rule.ruleKey.trim().toLowerCase()}|${rule.scopeType === "branch" ? (rule.scopeKey ?? "").trim().toLowerCase() : "*"}`;

function ruleValue(rule: DraftRule): string {
  if (rule.valueKind === "percentage") return `${rule.numericValue}%`;
  if (rule.valueKind === "amount") return `${rule.numericValue} ر.س`;
  return rule.textValue ?? "—";
}

/**
 * The terms Tadqeeq AI read from a contract document, for the person to check against the contract before adding
 * them to the draft version. Terms already in the version are shown but not selected.
 */
export function ContractReadingReview({
  result,
  contractId,
  versionId,
  existingRules,
  onClose,
  onAdded,
}: {
  result: ContractReadingResult | null;
  contractId: string;
  versionId: string;
  existingRules: ContractRuleRecord[];
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  return (
    <Dialog open={result !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-2xl overflow-y-auto text-right [&>button]:left-4 [&>button]:right-auto">
        {result ? (
          <ReviewBody
            key={result.rules.map(ruleIdentity).join(",")}
            result={result}
            contractId={contractId}
            versionId={versionId}
            existingRules={existingRules}
            onClose={onClose}
            onAdded={onAdded}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ReviewBody({
  result,
  contractId,
  versionId,
  existingRules,
  onClose,
  onAdded,
}: {
  result: ContractReadingResult;
  contractId: string;
  versionId: string;
  existingRules: ContractRuleRecord[];
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const existing = new Set(existingRules.map((rule) => ruleIdentity(rule)));
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(result.rules.flatMap((rule, index) => (existing.has(ruleIdentity(rule)) ? [] : [index]))),
  );
  const [saving, setSaving] = useState(false);

  async function addSelected() {
    setSaving(true);
    let added = 0;
    try {
      for (const index of [...selected].sort((a, b) => a - b)) {
        const rule = result.rules[index]!;
        await saveContractRule({
          data: {
            contractId,
            versionId,
            ruleKey: rule.ruleKey,
            ruleType: rule.ruleType,
            valueKind: rule.valueKind,
            numericValue: rule.numericValue,
            textValue: rule.textValue,
            currency: rule.currency,
            fundingSource: rule.fundingSource,
            scopeType: rule.scopeType,
            scopeKey: rule.scopeKey,
            notes: rule.notes,
          },
        });
        added += 1;
      }
      toast.success(`أُضيف ${added} بند إلى المسودة. راجعها ثم اعتمد النسخة.`);
      await onAdded();
      onClose();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "تعذّر إضافة البنود.", {
        description: added ? `أُضيف ${added} بند قبل الخطأ.` : undefined,
      });
      if (added) await onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5 pt-2">
        <DialogTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary-text" />
          البنود المقروءة من العقد
        </DialogTitle>
        <DialogDescription className="text-[13px] leading-6">{result.summary}</DialogDescription>
        {result.effectiveFrom || result.effectiveTo ? (
          <p className="text-[12px] text-muted-foreground">
            مدة العقد في المستند: <span className="num">{result.effectiveFrom ?? "—"}</span> إلى <span className="num">{result.effectiveTo ?? "مفتوح"}</span>. تواريخ
            النسخة لا تتغير تلقائياً؛ طابقها في «نسخ العقد» إن لزم.
          </p>
        ) : null}
      </div>

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
          {result.rules.map((rule, index) => {
            const already = existing.has(ruleIdentity(rule));
            const checked = selected.has(index);
            return (
              <li key={`${ruleIdentity(rule)}-${index}`} className={cn("flex items-start gap-3 px-3.5 py-3", already && "bg-muted/40")}>
                <Checkbox
                  className="mt-1"
                  checked={checked}
                  disabled={already || saving}
                  aria-label={rule.label}
                  onCheckedChange={(value) =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (value) next.add(index);
                      else next.delete(index);
                      return next;
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-[13.5px] font-semibold">
                      {rule.label}
                      <span className="ms-2 text-[11px] font-normal text-muted-foreground">
                        {RULE_TYPE_LABELS[rule.ruleType]}
                        {rule.scopeType === "branch" ? ` · ${rule.scopeKey}` : ""}
                      </span>
                    </p>
                    <span className="num text-[13.5px] font-semibold">{ruleValue(rule)}</span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-5 text-muted-foreground">{rule.notes}</p>
                  {rule.quote ? (
                    <p dir="auto" className="mt-1 border-s-2 border-border ps-2 text-[11px] leading-5 text-muted-foreground/90">
                      {rule.quote}
                    </p>
                  ) : null}
                  {already ? <p className="mt-1 text-[11px] font-medium text-muted-foreground">موجود في هذه النسخة</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          لم يُعثر على بنود رسوم واضحة في المستند. أدخلها يدوياً.
        </p>
      )}

      <p className="text-[11.5px] leading-5 text-muted-foreground">
        قارن كل بند بنص العقد قبل الإضافة. تُضاف البنود إلى المسودة فقط، ولا تُستخدم في الفحص حتى تعتمد النسخة.
      </p>

      <DialogFooter className="gap-2 sm:justify-start">
        <Button type="button" disabled={!selected.size || saving} onClick={() => void addSelected()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          إضافة المحدد ({selected.size}) إلى المسودة
        </Button>
        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
          إلغاء
        </Button>
      </DialogFooter>
    </div>
  );
}
