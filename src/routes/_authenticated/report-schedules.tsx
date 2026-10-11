import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, Loader2, Mail, Pause, Pencil, Play, Plus, Send, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/workspace/PageKit";
import {
  describeTiming,
  FREQUENCY_LABELS,
  MAX_RECIPIENTS,
  parseRecipients,
  WEEKDAY_LABELS,
  type ReportSchedule,
  type ScheduleFrequency,
} from "@/lib/report-schedules";
import { deleteReportSchedule, listReportSchedules, saveReportSchedule, sendReportScheduleNow } from "@/lib/report-schedules.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/report-schedules")({
  head: () => ({
    meta: [
      { title: "جدولة التقارير · تدقيق" },
      { name: "description", content: "إرسال ملخص التقارير بالبريد شهرياً أو أسبوعياً أو بعد رفع كل فترة." },
    ],
  }),
  component: ReportSchedulesPage,
});

const KEY = ["report-schedules"];

interface FormState {
  id?: string;
  name: string;
  frequency: ScheduleFrequency;
  dayOfMonth: number;
  weekday: number;
  recipients: string;
  active: boolean;
}

const EMPTY: FormState = { name: "", frequency: "monthly", dayOfMonth: 3, weekday: 0, recipients: "", active: true };

function stamp(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
}

function ReportSchedulesPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: () => listReportSchedules({ data: {} }) });
  const [form, setForm] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<ReportSchedule | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });

  const save = useMutation({
    mutationFn: (state: FormState) =>
      saveReportSchedule({
        data: {
          id: state.id,
          name: state.name,
          frequency: state.frequency,
          dayOfMonth: state.frequency === "monthly" ? state.dayOfMonth : null,
          weekday: state.frequency === "weekly" ? state.weekday : null,
          recipients: state.recipients,
          active: state.active,
        },
      }),
    onSuccess: async (_, state) => {
      toast.success(state.id ? "تم حفظ التعديلات" : "تمت إضافة الجدولة");
      setForm(null);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const toggle = useMutation({
    mutationFn: (s: ReportSchedule) =>
      saveReportSchedule({
        data: { id: s.id, name: s.name, frequency: s.frequency, dayOfMonth: s.dayOfMonth, weekday: s.weekday, recipients: s.recipients.join(", "), active: !s.active },
      }),
    onSuccess: async (saved) => {
      toast.success(saved.active ? "استؤنفت الجدولة" : "أُوقفت الجدولة مؤقتاً");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteReportSchedule({ data: { id } }),
    onSuccess: async () => {
      toast.success("حُذفت الجدولة");
      setDeleting(null);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const sendNow = useMutation({
    mutationFn: (id: string) => sendReportScheduleNow({ data: { id } }),
    onSuccess: ({ sent }) => toast.success(sent === 1 ? "أُرسل الملخص إلى عنوان واحد" : `أُرسل الملخص إلى ${sent} عناوين`),
    onError: (error: Error) => toast.error(error.message),
  });

  const schedules = query.data?.schedules ?? [];
  const canManage = query.data?.canManage ?? false;

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "التقارير" }, { label: "جدولة التقارير" }]}
        title="جدولة التقارير"
        subtitle="ملخص بالبريد لأرقام آخر شهر ومقارنتها بالشهر السابق، مع رابط لفتح التقارير في تدقيق."
        aside={
          canManage && !form ? (
            <Button type="button" size="sm" onClick={() => setForm(EMPTY)}>
              <Plus className="size-4" />
              جدولة جديدة
            </Button>
          ) : null
        }
      />

      {form ? <ScheduleForm state={form} saving={save.isPending} onChange={setForm} onCancel={() => setForm(null)} onSave={() => save.mutate(form)} /> : null}

      {query.isLoading ? (
        <Spinner className="size-5 text-muted-foreground" />
      ) : query.error ? (
        <p className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5 text-sm text-destructive">{(query.error as Error).message}</p>
      ) : schedules.length === 0 && !form ? (
        <section className="rounded-2xl border border-border bg-card px-6 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary-text">
            <CalendarClock className="size-6" />
          </span>
          <h2 className="mt-3 font-display text-[16px] font-bold">لا توجد جدولة بعد</h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-6 text-muted-foreground">
            أرسل ملخص الأرقام لنفسك أو للمحاسب أو للإدارة تلقائياً: شهرياً، أسبوعياً، أو بعد رفع كل فترة.
          </p>
          {canManage ? (
            <Button type="button" className="mt-4" onClick={() => setForm(EMPTY)}>
              <Plus className="size-4" />
              جدولة جديدة
            </Button>
          ) : (
            <p className="mt-3 text-[12px] text-muted-foreground">إضافة الجدولة متاحة لمالك الحساب ومديره.</p>
          )}
        </section>
      ) : (
        <ul className="space-y-3">
          {schedules.map((s) => (
            <li key={s.id} className={cn("rounded-2xl border border-border bg-card p-4 sm:p-5", !s.active && "opacity-70")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-[15px] font-bold">{s.name}</h2>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        s.active ? "bg-success/12 text-success" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {s.active ? "مفعّلة" : "موقوفة"}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    <CalendarClock className="size-3.5" aria-hidden />
                    {describeTiming(s)}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" size="sm" variant="outline" disabled={sendNow.isPending} onClick={() => sendNow.mutate(s.id)}>
                      {sendNow.isPending && sendNow.variables === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                      إرسال الآن
                    </Button>
                    <Button type="button" size="sm" variant="ghost" aria-label={s.active ? "إيقاف مؤقت" : "استئناف"} title={s.active ? "إيقاف مؤقت" : "استئناف"} disabled={toggle.isPending} onClick={() => toggle.mutate(s)}>
                      {s.active ? <Pause className="size-4" /> : <Play className="size-4" />}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label="تعديل"
                      title="تعديل"
                      onClick={() =>
                        setForm({
                          id: s.id,
                          name: s.name,
                          frequency: s.frequency,
                          dayOfMonth: s.dayOfMonth ?? 3,
                          weekday: s.weekday ?? 0,
                          recipients: s.recipients.join("\n"),
                          active: s.active,
                        })
                      }
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" aria-label="حذف" title="حذف" className="hover:text-destructive" onClick={() => setDeleting(s)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.recipients.map((r) => (
                  <span key={r} dir="ltr" className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[12px]">
                    <Mail className="size-3 text-muted-foreground" aria-hidden />
                    {r}
                  </span>
                ))}
              </div>
              <p className="mt-3 border-t border-border pt-2.5 text-[12px] text-muted-foreground">
                {s.lastSentAt ? (
                  <>آخر إرسال <span className="whitespace-nowrap tabular-nums">{stamp(s.lastSentAt)}</span></>
                ) : (
                  "لم تُرسل بعد"
                )}
              </p>
              {s.lastError ? (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-destructive/8 px-3 py-2 text-[12px] text-destructive">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  تعذّر آخر إرسال: {s.lastError}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[12px] leading-6 text-muted-foreground">
        يحتوي البريد على الأرقام الرئيسية لآخر شهر فيه فترات (المبيعات، الطلبات، تكلفة المنصة، العمولة، وكل منصة) والتغير عن الشهر السابق،
        وزراً يفتح{" "}
        <Link to="/trends" className="font-semibold text-primary-text underline-offset-4 hover:underline">
          الاتجاهات والمقارنة
        </Link>
        . التفاصيل وملفات Excel تبقى داخل تدقيق بعد تسجيل الدخول.
      </p>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">حذف «{deleting?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription className="text-start">لن تُرسل هذه الجدولة بعد الآن. لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel disabled={remove.isPending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleting) remove.mutate(deleting.id);
              }}
            >
              {remove.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ScheduleForm({
  state,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  state: FormState;
  saving: boolean;
  onChange: (next: FormState) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { valid, invalid } = parseRecipients(state.recipients);
  const tooMany = valid.length > MAX_RECIPIENTS;
  const set = (patch: Partial<FormState>) => onChange({ ...state, ...patch });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!saving && state.name.trim() && valid.length && !invalid.length && !tooMany) onSave();
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="font-display text-[15px] font-bold">{state.id ? "تعديل الجدولة" : "جدولة جديدة"}</h2>
      <div className="space-y-1.5">
        <Label htmlFor="schedule-name">الاسم</Label>
        <Input id="schedule-name" value={state.name} maxLength={120} placeholder="مثال: التقرير الشهري للإدارة" onChange={(e) => set({ name: e.target.value })} />
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">متى يُرسل</legend>
        <div role="radiogroup" aria-label="متى يُرسل" className="flex flex-wrap gap-1.5">
          {(Object.keys(FREQUENCY_LABELS) as ScheduleFrequency[]).map((frequency) => (
            <button
              key={frequency}
              type="button"
              role="radio"
              aria-checked={state.frequency === frequency}
              onClick={() => set({ frequency })}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors",
                state.frequency === frequency ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground/30",
              )}
            >
              {FREQUENCY_LABELS[frequency]}
            </button>
          ))}
        </div>
        {state.frequency === "monthly" ? (
          <label className="mt-2 flex items-center gap-2 text-[13px]">
            في اليوم
            <select
              value={state.dayOfMonth}
              onChange={(e) => set({ dayOfMonth: Number(e.target.value) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
            من كل شهر
          </label>
        ) : state.frequency === "weekly" ? (
          <label className="mt-2 flex items-center gap-2 text-[13px]">
            كل
            <select value={state.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              {WEEKDAY_LABELS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="mt-2 text-[12.5px] text-muted-foreground">يُرسل بعد رفع أي فترة تدقيق جديدة، خلال ساعة تقريباً.</p>
        )}
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="schedule-recipients">المستلمون</Label>
        <Textarea
          id="schedule-recipients"
          dir="ltr"
          rows={3}
          value={state.recipients}
          placeholder="cfo@company.com, accountant@firm.com"
          onChange={(e) => set({ recipients: e.target.value })}
          aria-invalid={invalid.length > 0 || tooMany}
          aria-describedby="schedule-recipients-help"
          className="text-start"
        />
        <p id="schedule-recipients-help" className={cn("text-[12px]", invalid.length || tooMany ? "text-destructive" : "text-muted-foreground")}>
          {invalid.length
            ? `عناوين غير صحيحة: ${invalid.join("، ")}`
            : tooMany
              ? `الحد الأقصى ${MAX_RECIPIENTS} عناوين.`
              : `${valid.length} عنوان · افصل بين العناوين بفاصلة أو سطر جديد. يمكن إضافة عناوين من خارج الحساب؛ ستصلهم أرقام التقرير.`}
        </p>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={state.active} onChange={(e) => set({ active: e.target.checked })} className="size-4 accent-[var(--color-primary)]" />
        مفعّلة
      </label>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          إلغاء
        </Button>
        <Button type="submit" disabled={saving || !state.name.trim() || !valid.length || invalid.length > 0 || tooMany}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          {state.id ? "حفظ التعديلات" : "إضافة الجدولة"}
        </Button>
      </div>
    </form>
  );
}
