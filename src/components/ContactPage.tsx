import { Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock, LifeBuoy, Loader2, Mail, ShieldCheck, type LucideIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { LogoWordmark } from "@/components/brand/Logo";
import { LegalLinks } from "@/components/legal/LegalPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

import { CONTACT_HOURS, CONTACT_TOPICS, validateContact, type ContactTopic } from "@/lib/contact";
import { submitContactMessage } from "@/lib/contact.functions";
import { companyIdentity, LEGAL_COMPANY } from "@/lib/legal";

function Card({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-border bg-card p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-full bg-secondary text-primary">
          <Icon className="size-4" />
        </span>
        <h2 className="font-display text-base font-bold">{title}</h2>
      </div>
      <div className="mt-3 text-sm leading-7 text-foreground/80">{children}</div>
    </div>
  );
}

export function ContactPage() {
  const [topic, setTopic] = useState<ContactTopic>("sales");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = { topic, name, company, email, mobile, message };
    const checked = validateContact(input);
    if (!checked.ok) {
      toast.error(checked.error);
      return;
    }
    setBusy(true);
    try {
      await submitContactMessage({ data: { ...input, website } });
      setSent(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر إرسال الرسالة.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="تدقيق — الرئيسية">
            <LogoWordmark className="h-8 text-ink" />
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            ابدأ مجاناً
            <ArrowLeft className="size-4" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="font-display text-3xl font-extrabold leading-[1.4] sm:text-4xl">تواصل معنا</h1>
        <p className="mt-3 max-w-2xl text-[16px] leading-8 text-foreground/80">
          سؤال عن الباقات، طلب عرض توضيحي، أو مساعدة في حسابك؟ اكتب لنا ونرد عليك خلال يوم عمل.
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="grid content-start gap-4">
            <Card icon={Mail} title="البريد الإلكتروني">
              <a href={`mailto:${LEGAL_COMPANY.email}`} className="font-semibold text-primary hover:underline" dir="ltr">
                {LEGAL_COMPANY.email}
              </a>
              <p className="mt-1">لكل الاستفسارات: المبيعات، الدعم، الفواتير والشراكات.</p>
            </Card>
            <Card icon={CalendarClock} title="عرض توضيحي وتفعيل الحساب">
              <p>سجّل منشأتك واحجز موعد الاجتماع من نموذج البيانات، ونراجع معك أول فاتورة على بياناتك.</p>
              <Link to="/auth" search={{ mode: "signup" }} className="mt-2 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
                سجّل منشأتك
                <ArrowLeft className="size-3.5" />
              </Link>
            </Card>
            <Card icon={LifeBuoy} title="دعم العملاء">
              <p>إذا كان لديك حساب، راسلنا من البريد المسجّل واذكر اسم المنشأة، ليصل طلبك مباشرة إلى فريق حسابك.</p>
            </Card>
            <Card icon={Clock} title="أوقات العمل">
              <p>{CONTACT_HOURS}</p>
            </Card>
            <Card icon={ShieldCheck} title="طلبات الخصوصية">
              <p>
                للوصول إلى بياناتك أو تصحيحها أو إتلافها، راسلنا من بريد حسابك. التفاصيل في{" "}
                <Link to="/privacy" className="font-semibold text-primary hover:underline">
                  سياسة الخصوصية
                </Link>
                .
              </p>
            </Card>
          </div>

          {sent ? (
            <div className="h-fit rounded-[16px] border border-border bg-card p-8 text-center shadow-panel">
              <CheckCircle2 className="mx-auto size-10 text-primary" />
              <h2 className="mt-4 font-display text-xl font-bold">وصلتنا رسالتك</h2>
              <p className="mt-2 text-sm leading-7 text-foreground/80">شكراً {name.trim()}، سيتواصل معك فريقنا خلال يوم عمل على بريدك أو جوالك.</p>
              <Button
                variant="outline"
                className="mt-5"
                onClick={() => {
                  setSent(false);
                  setMessage("");
                }}
              >
                إرسال رسالة أخرى
              </Button>
            </div>
          ) : (
          <form onSubmit={submit} className="h-fit space-y-4 rounded-[16px] border border-border bg-card p-6 shadow-panel sm:p-7">
            <h2 className="font-display text-xl font-bold">أرسل رسالة</h2>
            <div className="space-y-2">
              <Label>الموضوع</Label>
              <div className="flex flex-wrap gap-2">
                {CONTACT_TOPICS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTopic(item.key)}
                    aria-pressed={topic === item.key}
                    className={
                      topic === item.key
                        ? "rounded-full bg-ink px-3 py-1.5 text-sm font-semibold text-ink-foreground"
                        : "rounded-full border border-border px-3 py-1.5 text-sm text-foreground/75 hover:bg-muted"
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact-name">الاسم</Label>
                <Input id="contact-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-company">اسم المنشأة (اختياري)</Label>
                <Input id="contact-company" autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={160} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact-email">البريد الإلكتروني</Label>
                <Input id="contact-email" type="email" dir="ltr" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-mobile">رقم الجوال</Label>
                <Input id="contact-mobile" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="05XXXXXXXX" value={mobile} onChange={(e) => setMobile(e.target.value)} required maxLength={20} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-message">رسالتك</Label>
              <Textarea id="contact-message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} required maxLength={2000} />
            </div>
            {/* Hidden from people; bots that fill it are ignored. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label htmlFor="contact-website">Website</label>
              <input id="contact-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy} aria-busy={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              إرسال
            </Button>
            <p className="text-xs leading-6 text-muted-foreground">
              نستخدم بياناتك للرد على رسالتك فقط، وفق{" "}
              <Link to="/privacy" className="underline-offset-4 hover:underline">
                سياسة الخصوصية
              </Link>
              .
            </p>
          </form>
          )}
        </div>

        <ul className="mt-12 space-y-1 border-t border-border pt-6 text-xs leading-6 text-muted-foreground">
          {companyIdentity().map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </main>

      <footer className="border-t border-border bg-[oklch(0.975_0.018_85)]">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            <span className="num">© {new Date().getFullYear()}</span> تدقيق · صُنع في السعودية
          </p>
          <LegalLinks className="flex flex-wrap gap-4" />
        </div>
      </footer>
    </div>
  );
}
