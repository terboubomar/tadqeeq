import { Check, Columns3 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import type { ColumnAlias, ColumnReview, ValueKind } from "@/lib/smart-columns/match";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<ValueKind, string> = {
  money: "مبالغ",
  date: "تواريخ",
  text: "نص",
  id: "أرقام تعريف",
};

const NONE = "";

/**
 * Shown when a platform renamed required columns: one row per missing column with the closest
 * columns in the file, best first. Nothing is analysed until the user confirms every match.
 */
export function ColumnReviewDialog({
  review,
  onConfirm,
  onCancel,
}: {
  review: ColumnReview | null;
  onConfirm: (aliases: ColumnAlias[]) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<Record<number, string>>({});

  useEffect(() => {
    setPicked(Object.fromEntries((review?.fields ?? []).map((field, index) => [index, field.suggested ?? NONE])));
  }, [review]);

  if (!review) return null;
  const chosen = review.fields.map((_, index) => picked[index] ?? NONE);
  const duplicates = chosen.filter((header, index) => header && chosen.indexOf(header) !== index).length > 0;
  const complete = chosen.every(Boolean) && !duplicates;

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onCancel())}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto overflow-x-hidden sm:max-w-xl">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-primary-text">
            <Columns3 className="size-5" />
          </span>
          <div>
            <DialogTitle className="text-[16px]">المنصة غيّرت أسماء أعمدة</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] leading-6">
              اختر العمود الصحيح لكل بند. نحفظ اختيارك ونستخدمه تلقائياً في الملفات القادمة.
            </DialogDescription>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          {review.fields.map((field, index) => (
            <fieldset key={field.source + field.expected[0]} className="min-w-0 rounded-[12px] border border-border p-3">
              <legend className="px-1 text-[12px] text-muted-foreground">
                المطلوب: <span className="font-semibold text-foreground" dir="ltr">{field.expected[0]}</span> · {KIND_LABEL[field.kind]}
              </legend>
              <div className="space-y-1.5">
                {field.candidates.map((candidate) => {
                  const active = chosen[index] === candidate.header;
                  return (
                    <button
                      key={candidate.header}
                      type="button"
                      onClick={() => setPicked((current) => ({ ...current, [index]: candidate.header }))}
                      className={cn(
                        "flex w-full min-w-0 items-center gap-3 rounded-[10px] border px-3 py-1.5 text-start transition-colors",
                        active ? "border-primary bg-secondary/60" : "border-border hover:bg-muted/50",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-full border",
                          active ? "border-primary bg-primary text-white" : "border-input",
                        )}
                      >
                        {active ? <Check className="size-3" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium" dir="ltr">
                          {candidate.header}
                        </span>
                        {candidate.samples.length ? (
                          <span className="num block truncate text-[11.5px] text-muted-foreground" dir="ltr">
                            {candidate.samples.join(" · ")}
                          </span>
                        ) : null}
                      </span>
                      <span className="num shrink-0 text-[12px] font-semibold text-muted-foreground">
                        {Math.round(candidate.confidence * 100)}%
                      </span>
                    </button>
                  );
                })}
                {field.others.length ? (
                  <select
                    aria-label={"عمود آخر لـ " + field.expected[0]}
                    value={field.others.includes(chosen[index]!) ? chosen[index] : NONE}
                    onChange={(event) => setPicked((current) => ({ ...current, [index]: event.target.value }))}
                    className={cn(
                      "h-9 w-full rounded-[10px] border bg-white px-3 text-[12.5px]",
                      field.others.includes(chosen[index]!) ? "border-primary" : "border-border text-muted-foreground",
                    )}
                  >
                    <option value={NONE}>عمود آخر…</option>
                    {field.others.map((header) => (
                      <option key={header} value={header} dir="ltr">
                        {header}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPicked((current) => ({ ...current, [index]: NONE }))}
                  className={cn(
                    "w-full rounded-[10px] px-3 py-1.5 text-start text-[12px]",
                    chosen[index] === NONE ? "text-destructive" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  لا شيء منها
                </button>
              </div>
            </fieldset>
          ))}
        </div>

        {!chosen.every(Boolean) ? (
          <p className="text-[12.5px] leading-6 text-muted-foreground">
            إذا لم يكن العمود موجوداً، لا يمكن التحليل بدقة. سجّلنا الملف لفريق الدعم لإضافة الصيغة الجديدة.
          </p>
        ) : duplicates ? (
          <p className="text-[12.5px] text-destructive">اخترت نفس العمود لبندين.</p>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            type="button"
            disabled={!complete}
            onClick={() =>
              onConfirm(
                review.fields.map((field, index) => ({ source: field.source, canonical: field.expected[0]!, observed: chosen[index]! })),
              )
            }
          >
            تأكيد وتحليل
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
