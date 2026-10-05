import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, CircleDot, Loader2, Lock, PauseCircle, ShieldCheck, Upload } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  isValidCr,
  isValidNationalId,
  isValidVat,
  MEETING_HOURS,
  normalizeSaudiMobile,
  ONBOARDING_STATUS_LABELS,
  ONBOARDING_STEPS,
  SUSPENSION_REASONS,
  type OnboardingRecord,
} from "@/lib/onboarding";
import { getMyOnboarding, requestReactivation, submitOnboarding } from "@/lib/onboarding.functions";

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { context } = useWorkspaceAccess();
  if (context.isPlatformAdmin || context.onboardingStatus === "active") return <>{children}</>;
  return <OnboardingScreen />;
}

export function OnboardingScreen() {
  const query = useQuery({
    queryKey: ["my-onboarding"],
    queryFn: () => getMyOnboarding({ data: {} }),
  });
  if (query.isLoading || !query.data) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const record = query.data;
  if (record.status === "pending_details") return <OnboardingForm record={record} />;
  if (record.status === "suspended") return <SuspendedScreen record={record} />;
  return <LockedStatus record={record} />;
}

function formatRiyadh(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    timeZone: "Asia/Riyadh",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

const PAUSED_FEATURES = [
  "رفع الفواتير وتحليلها",
  "اللوحة والتقارير والتفصيل اليومي",
  "«رادار» للاستثناءات و«استرداد» للتعويضات",
  "العقود ومطابقة الرسوم",
  "Tadqeeq AI",
  "بوت Telegram لجمع أدلة الطلبات",
];

const formatDay = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso))
    : null;

function SuspendedScreen({ record }: { record: OnboardingRecord }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const suspension = record.suspension;
  const reason = SUSPENSION_REASONS[suspension?.reason ?? "payment"];
  const sub = suspension?.subscription ?? null;
  const request = useMutation({
    mutationFn: () => requestReactivation({ data: { note: note.trim() || undefined } }),
    onSuccess: async () => {
      toast.success("تم إرسال طلبك — سيتواصل معك فريق تدقيق قريباً.");
      await queryClient.invalidateQueries({ queryKey: ["my-onboarding"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const requestedAt = suspension?.reactivationRequestedAt ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-8">
      <div className="panel overflow-hidden">
        <div className="border-b border-destructive/20 bg-destructive/5 p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
              <PauseCircle className="size-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold">{reason.title}</h1>
              <p className="mt-1.5 text-sm leading-7 text-muted-foreground">{reason.body}</p>
              {suspension?.since ? <p className="mt-2 text-xs text-muted-foreground">منذ {formatDay(suspension.since)}</p> : null}
            </div>
          </div>
          {suspension?.message ? (
            <p className="mt-5 rounded-[8px] border border-border bg-background p-3 text-sm leading-6">
              <span className="font-semibold">رسالة من فريق تدقيق: </span>
              {suspension.message}
            </p>
          ) : null}
        </div>

        <div className="grid gap-6 p-6 sm:grid-cols-2 sm:p-8">
          <div>
            <h2 className="text-sm font-bold">الميزات المتوقفة</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {PAUSED_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <CircleDot className="size-3.5 shrink-0 text-destructive/70" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-[8px] bg-secondary p-3 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>بياناتك وفتراتك وتقاريرك محفوظة كما هي، وتعود كاملة فور إعادة التفعيل.</p>
            </div>
            {sub ? (
              <div className="rounded-[8px] border border-border p-3 text-sm">
                <p className="text-xs text-muted-foreground">آخر اشتراك</p>
                <p className="mt-1 font-semibold">
                  {sub.planName ?? "اشتراك مخصص"} ·{" "}
                  <span className="num">{new Intl.NumberFormat("en-US").format(sub.price)}</span> ر.س {sub.cycle === "yearly" ? "سنوياً" : "شهرياً"}
                </p>
                {sub.endsOn ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {sub.endsOn < new Date().toISOString().slice(0, 10) ? "انتهى في" : "ينتهي في"} {formatDay(sub.endsOn)}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[8px] border border-border p-3 text-sm text-muted-foreground">لا يوجد اشتراك مسجّل لحسابك.</div>
            )}
          </div>
        </div>
      </div>

      <div className="panel p-6 sm:p-8">
        <h2 className="font-bold">إعادة تفعيل الحساب</h2>
        {requestedAt ? (
          <div className="mt-3 flex items-start gap-2 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              أرسلت طلب إعادة التفعيل في {formatDay(requestedAt)}. سيتواصل معك فريق تدقيق لإتمام {suspension?.reason === "payment" ? "تجديد الاشتراك والسداد" : "إعادة التفعيل"}.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              {suspension?.reason === "payment"
                ? "أرسل طلباً وسيتواصل معك فريق تدقيق لتجديد الاشتراك وتأكيد التحويل، ثم نعيد فتح كل الميزات."
                : "أرسل طلباً وسيتواصل معك فريق تدقيق."}
            </p>
            <Textarea className="mt-4" placeholder="ملاحظة للفريق (اختياري) — مثلاً: تم التحويل اليوم، أو أفضل وقت للتواصل" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button className="mt-3" disabled={request.isPending} onClick={() => request.mutate()}>
              {request.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              طلب إعادة التفعيل
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function LockedStatus({ record }: { record: OnboardingRecord }) {
  const currentIndex = ONBOARDING_STEPS.indexOf(record.status);
  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="panel p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-[8px] bg-secondary text-primary">
            <Lock className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold">حسابك قيد التفعيل</h1>
            <p className="text-sm text-muted-foreground">
              {record.status === "suspended"
                ? "تم إيقاف الحساب مؤقتاً — تواصل معنا."
                : "ستُفتح كل الميزات بعد إتمام الاتفاق والتحويل والتهيئة."}
            </p>
          </div>
        </div>

        <ol className="mt-7 space-y-3">
          {ONBOARDING_STEPS.map((step, index) => {
            const done = currentIndex > index;
            const current = currentIndex === index;
            return (
              <li key={step} className="flex items-center gap-3 text-sm">
                <span
                  className={
                    "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold " +
                    (done
                      ? "border-primary bg-primary text-primary-foreground"
                      : current
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground")
                  }
                >
                  {done ? <CheckCircle2 className="size-4" /> : index + 1}
                </span>
                <span className={current ? "font-semibold" : done ? "" : "text-muted-foreground"}>
                  {ONBOARDING_STATUS_LABELS[step]}
                </span>
              </li>
            );
          })}
        </ol>

        {record.meetingAt ? (
          <div className="mt-7 flex items-center gap-3 rounded-[8px] border border-border bg-muted/40 p-4 text-sm">
            <CalendarClock className="size-5 text-primary" />
            <div>
              <p className="font-semibold">اجتماعك مع الخبير</p>
              <p className="text-muted-foreground">{formatRiyadh(record.meetingAt)} (بتوقيت الرياض)</p>
            </div>
          </div>
        ) : null}
        {record.adminNote ? (
          <p className="mt-4 rounded-[8px] bg-secondary p-3 text-sm">{record.adminNote}</p>
        ) : null}
      </div>
    </div>
  );
}

function nextWorkingDays(count: number) {
  const days: string[] = [];
  const cursor = new Date();
  cursor.setUTCHours(cursor.getUTCHours() + 3);
  while (days.length < count) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const d = cursor.getUTCDay();
    if (d >= 0 && d <= 4) days.push(cursor.toISOString().slice(0, 10));
  }
  return days;
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? (
        <span className="block text-xs text-destructive">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

function OnboardingForm({ record }: { record: OnboardingRecord }) {
  const queryClient = useQueryClient();
  const days = useMemo(() => nextWorkingDays(10), []);
  const [form, setForm] = useState({
    legalName: record.legalName ?? "",
    brandName: record.brandName ?? "",
    crNumber: record.crNumber ?? "",
    vatNumber: record.vatNumber ?? "",
    contactName: record.contactName ?? "",
    contactMobile: record.contactMobile ?? "",
    contactNationalId: record.contactNationalId ?? "",
    contactEmail: record.contactEmail ?? "",
    branchCount: record.branchCount ? String(record.branchCount) : "",
    meetingDay: days[0],
    meetingHour: "",
    meetingNote: "",
  });
  const [logo, setLogo] = useState<{ dataUrl: string; name: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const errors = {
    crNumber: isValidCr(form.crNumber) ? null : "10 أرقام",
    vatNumber: isValidVat(form.vatNumber) ? null : "15 رقماً يبدأ وينتهي بـ 3",
    contactMobile: normalizeSaudiMobile(form.contactMobile) ? null : "جوال سعودي 05XXXXXXXX",
    contactNationalId: isValidNationalId(form.contactNationalId) ? null : "10 أرقام يبدأ بـ 1 أو 2",
    branchCount: Number(form.branchCount) >= 1 ? null : "مطلوب",
    meetingHour: form.meetingHour ? null : "اختر الوقت",
  };
  const valid =
    Object.values(errors).every((e) => !e) &&
    form.legalName.trim() && form.brandName.trim() && form.contactName.trim() && form.contactEmail.includes("@");

  const submit = useMutation({
    mutationFn: () => {
      const hour = Number(form.meetingHour);
      const meetingAt = new Date(`${form.meetingDay}T${String(hour).padStart(2, "0")}:00:00+03:00`).toISOString();
      return submitOnboarding({
        data: {
          legalName: form.legalName,
          brandName: form.brandName,
          crNumber: form.crNumber,
          vatNumber: form.vatNumber,
          contactName: form.contactName,
          contactMobile: form.contactMobile,
          contactNationalId: form.contactNationalId,
          contactEmail: form.contactEmail,
          branchCount: Number(form.branchCount),
          meetingAt,
          meetingNote: form.meetingNote || undefined,
          logoDataUrl: logo?.dataUrl,
        },
      });
    },
    onSuccess: async () => {
      toast.success("تم استلام بياناتك وحجز الاجتماع.");
      await queryClient.invalidateQueries({ queryKey: ["my-onboarding"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace-context"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const show = (key: keyof typeof errors) => (touched ? errors[key] : null);
  const dayLabel = (day: string) =>
    new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(day + "T00:00:00Z"));

  return (
    <div className="mx-auto max-w-3xl py-6">
      <h1 className="text-2xl font-bold">أهلاً بك في تدقيق</h1>
      <p className="mt-1 text-sm text-muted-foreground">أكمل بيانات منشأتك واحجز اجتماعاً مع خبير لبدء التهيئة.</p>

      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (valid) submit.mutate();
        }}
      >
        <section className="panel grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">بيانات المنشأة</h2>
          <Field label="الاسم القانوني للمنشأة"><Input value={form.legalName} onChange={set("legalName")} /></Field>
          <Field label="العلامة التجارية"><Input value={form.brandName} onChange={set("brandName")} /></Field>
          <Field label="رقم السجل التجاري" error={show("crNumber")} hint="10 أرقام">
            <Input dir="ltr" inputMode="numeric" value={form.crNumber} onChange={set("crNumber")} />
          </Field>
          <Field label="الرقم الضريبي (VAT)" error={show("vatNumber")} hint="15 رقماً">
            <Input dir="ltr" inputMode="numeric" value={form.vatNumber} onChange={set("vatNumber")} />
          </Field>
          <Field label="عدد الفروع" error={show("branchCount")}>
            <Input dir="ltr" type="number" min={1} value={form.branchCount} onChange={set("branchCount")} />
          </Field>
          <Field label="شعار العلامة" hint="PNG / JPG / WEBP حتى 2MB">
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input px-3 text-sm text-muted-foreground">
              <Upload className="size-4" />
              <span className="truncate">{logo?.name ?? "اختر ملفاً"}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024) {
                    toast.error("حجم الشعار أكبر من 2MB.");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => setLogo({ dataUrl: String(reader.result), name: file.name });
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          </Field>
        </section>

        <section className="panel grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">المسؤول</h2>
          <Field label="الاسم"><Input value={form.contactName} onChange={set("contactName")} /></Field>
          <Field label="البريد الإلكتروني"><Input dir="ltr" type="email" value={form.contactEmail} onChange={set("contactEmail")} /></Field>
          <Field label="رقم الجوال" error={show("contactMobile")} hint="05XXXXXXXX">
            <Input dir="ltr" inputMode="tel" value={form.contactMobile} onChange={set("contactMobile")} />
          </Field>
          <Field label="رقم الهوية / الإقامة" error={show("contactNationalId")} hint="10 أرقام">
            <Input dir="ltr" inputMode="numeric" value={form.contactNationalId} onChange={set("contactNationalId")} />
          </Field>
        </section>

        <section className="panel space-y-4 p-5">
          <h2 className="font-semibold">احجز اجتماعاً مع خبير</h2>
          <p className="text-xs text-muted-foreground">الأحد – الخميس، بتوقيت الرياض.</p>
          <div className="flex flex-wrap gap-2">
            {days.map((day) => (
              <Button key={day} type="button" size="sm" variant={form.meetingDay === day ? "default" : "outline"}
                onClick={() => setForm((f) => ({ ...f, meetingDay: day }))}>
                {dayLabel(day)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {MEETING_HOURS.map((hour) => (
              <Button key={hour} type="button" size="sm" variant={form.meetingHour === String(hour) ? "default" : "outline"}
                onClick={() => setForm((f) => ({ ...f, meetingHour: String(hour) }))}>
                <span dir="ltr">{hour > 12 ? hour - 12 : hour}:00 {hour >= 12 ? "م" : "ص"}</span>
              </Button>
            ))}
          </div>
          {show("meetingHour") ? <p className="text-xs text-destructive">{errors.meetingHour}</p> : null}
          <Textarea placeholder="ملاحظات (اختياري)" value={form.meetingNote} onChange={set("meetingNote")} />
        </section>

        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={submit.isPending}>
          {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          إرسال البيانات وحجز الاجتماع
        </Button>
      </form>
    </div>
  );
}
