import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ImagePlus, Loader2, LogOut } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { LogoWordmark } from "@/components/brand/Logo";
import { WorkspaceAccessProvider } from "@/components/WorkspaceAccessProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompanyProfileStatus } from "@/hooks/use-company-profile-status";
import { supabase } from "@/integrations/supabase/client";
import { loadSupabase } from "@/integrations/supabase/lazy-client";
import { getEmailCodeStatus } from "@/lib/email-signin.functions";
import { needsMfaCode } from "@/lib/mfa";
import { companyProfileErrors, type CompanyProfileField, type CompanyProfileInput, type OnboardingRecord } from "@/lib/onboarding";
import { getMyOnboarding, saveCompanyProfile } from "@/lib/onboarding.functions";
import { isOpsHost } from "@/lib/ops";
import { NOINDEX } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  // The same sign-in checks as the app itself: a session that still owes a code finishes it on /auth first.
  beforeLoad: async () => {
    if (isOpsHost(window.location.host)) throw redirect({ to: "/ops" });
    const client = await loadSupabase();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: levels } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (needsMfaCode(levels)) throw redirect({ to: "/auth", search: { next: "/onboarding" } });
    const emailCode = await getEmailCodeStatus().catch(() => ({ needed: false }));
    if (emailCode.needed) throw redirect({ to: "/auth", search: { next: "/onboarding" } });
    return { user: data.user };
  },
  head: () => ({ meta: [NOINDEX, { title: "بيانات المنشأة · تدقيق" }] }),
  component: () => (
    <WorkspaceAccessProvider>
      <OnboardingPage />
    </WorkspaceAccessProvider>
  ),
});

/** First sign-in of a new account: the company details, before the app opens. */
function OnboardingPage() {
  const status = useCompanyProfileStatus();
  const navigate = useNavigate();
  const record = useQuery({
    queryKey: ["my-onboarding"],
    queryFn: () => getMyOnboarding({ data: {} }),
    enabled: status === "required",
  });

  // Already filled in, an invited member, or an active customer: nothing to do here.
  useEffect(() => {
    if (status === "ok") void navigate({ to: "/start", replace: true });
  }, [status, navigate]);

  if (status !== "required" || !record.data) return <div className="min-h-[100dvh] bg-background" aria-busy="true" />;
  return <CompanyProfileForm record={record.data} />;
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function CompanyProfileForm({ record }: { record: OnboardingRecord }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CompanyProfileInput>({
    legalName: record.legalName ?? "",
    crNumber: record.crNumber ?? "",
    vatNumber: record.vatNumber ?? "",
    brandName: record.brandName ?? "",
    contactName: record.contactName ?? "",
    contactEmail: record.contactEmail ?? "",
    contactMobile: record.contactMobile ?? "",
  });
  const [logo, setLogo] = useState<{ dataUrl: string; name: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const errors = companyProfileErrors(form, Boolean(logo) || Boolean(record.logoUrl));
  const show = (field: CompanyProfileField) => (touched ? errors[field] : undefined);
  const set = (key: keyof CompanyProfileInput) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const save = useMutation({
    mutationFn: () => saveCompanyProfile({ data: { ...form, logoDataUrl: logo?.dataUrl } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-onboarding"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace-context"] });
      toast.success("تم حفظ بيانات منشأتك.");
      void navigate({ to: "/start", replace: true });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  const logoPreview = logo?.dataUrl ?? record.logoUrl;

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-background">
      <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex items-center justify-between gap-4">
          <LogoWordmark title="تدقيق" className="h-9 text-ink" />
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            تسجيل الخروج
          </button>
        </header>

        <form
          noValidate
          className="mt-8 rounded-[20px] border border-border bg-card px-5 py-7 shadow-[0_2px_6px_rgb(19_35_43/0.04),0_24px_48px_-24px_rgb(19_35_43/0.22)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-500 sm:px-10 sm:py-10"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (Object.keys(errors).length === 0) save.mutate();
          }}
        >
          <h1 className="font-display text-2xl font-semibold leading-relaxed text-ink sm:text-[1.65rem]">أكمل بيانات منشأتك</h1>
          <p className="mt-1.5 text-[15px] leading-7 text-muted-foreground">نستخدمها في حسابك وتقاريرك. تحتاجها مرة واحدة فقط.</p>

          <section aria-labelledby="company-heading" className="mt-8">
            <h2 id="company-heading" className="text-base font-bold">بيانات الشركة</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <Field id="legalName" label="اسم الشركة" error={show("legalName")} className="sm:col-span-2">
                <Input id="legalName" value={form.legalName} onChange={set("legalName")} autoComplete="organization" placeholder="كما في السجل التجاري" className="h-11 bg-card" />
              </Field>
              <Field id="crNumber" label="رقم السجل التجاري" hint="10 أرقام" error={show("crNumber")}>
                <Input id="crNumber" dir="ltr" inputMode="numeric" value={form.crNumber} onChange={set("crNumber")} placeholder="1010XXXXXX" className="num h-11 bg-card" />
              </Field>
              <Field id="vatNumber" label="الرقم الضريبي (اختياري)" hint="15 رقماً، إن كانت منشأتك مسجّلة في ضريبة القيمة المضافة" error={show("vatNumber")}>
                <Input id="vatNumber" dir="ltr" inputMode="numeric" value={form.vatNumber} onChange={set("vatNumber")} placeholder="3XXXXXXXXXXXXX3" className="num h-11 bg-card" />
              </Field>
              <Field id="brandName" label="العلامة التجارية" hint="الاسم الذي يظهر لعملائك في تطبيقات التوصيل" error={show("brandName")}>
                <Input id="brandName" value={form.brandName} onChange={set("brandName")} className="h-11 bg-card" />
              </Field>
              <Field id="logo" label="شعار العلامة" hint="PNG أو JPG أو WEBP حتى 2MB" error={show("logo")}>
                <label
                  htmlFor="logo"
                  className={cn(
                    "flex h-11 cursor-pointer items-center gap-3 rounded-md border border-input bg-card px-2 text-sm transition-colors hover:bg-muted/60 focus-within:ring-2 focus-within:ring-ring",
                    show("logo") && "border-destructive",
                  )}
                >
                  {logoPreview ? (
                    <img src={logoPreview} alt="" className="size-8 shrink-0 rounded-md border border-border object-contain" />
                  ) : (
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-primary-text">
                      <ImagePlus className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 truncate text-muted-foreground">{logo?.name ?? (record.logoUrl ? "تغيير الشعار" : "اختر ملف الشعار")}</span>
                  <input
                    id="logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      if (file.size > MAX_LOGO_BYTES) {
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
            </div>
          </section>

          <section aria-labelledby="contact-heading" className="mt-9 border-t border-border pt-7">
            <h2 id="contact-heading" className="text-base font-bold">بيانات التواصل</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <Field id="contactName" label="الاسم" error={show("contactName")} className="sm:col-span-2">
                <Input id="contactName" value={form.contactName} onChange={set("contactName")} autoComplete="name" className="h-11 bg-card" />
              </Field>
              <Field id="contactEmail" label="البريد الإلكتروني" error={show("contactEmail")}>
                <Input id="contactEmail" type="email" dir="ltr" value={form.contactEmail} onChange={set("contactEmail")} autoComplete="email" placeholder="you@company.com" className="h-11 bg-card" />
              </Field>
              <Field id="contactMobile" label="رقم الجوال" error={show("contactMobile")}>
                <Input id="contactMobile" type="tel" dir="ltr" inputMode="tel" value={form.contactMobile} onChange={set("contactMobile")} autoComplete="tel" placeholder="05XXXXXXXX" className="num h-11 bg-card" />
              </Field>
            </div>
          </section>

          <div className="mt-9 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            {touched && Object.keys(errors).length > 0 ? (
              <p role="alert" className="text-sm text-destructive">
                راجع الحقول المحددة بالأحمر.
              </p>
            ) : (
              <span />
            )}
            <Button type="submit" className="h-12 px-8" disabled={save.isPending} aria-busy={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              حفظ ومتابعة
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
