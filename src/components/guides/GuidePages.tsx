import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import type { ReactNode } from "react";

import { LogoWordmark } from "@/components/brand/Logo";
import { PlatformIcon, PlatformName } from "@/components/brand/PlatformLogo";
import { GUIDES, type Guide, type GuideSection } from "@/lib/guides";
import { formatArabicDate } from "@/lib/site-content";

/** Header, main column and footer shared by the guides, the product pages and their indexes. */
export function GuideShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="تدقيق — الرئيسية">
            <LogoWordmark className="h-8 text-ink" />
          </Link>
          <nav aria-label="روابط رئيسية" className="flex items-center gap-1 text-sm">
            <Link to="/products" className="hidden rounded-full px-3 py-2 font-semibold text-foreground/75 hover:bg-muted sm:block">
              المنتجات
            </Link>
            <Link to="/guides" className="hidden rounded-full px-3 py-2 font-semibold text-foreground/75 hover:bg-muted sm:block">
              الأدلة
            </Link>
            <Link to="/contact" className="hidden rounded-full px-3 py-2 font-semibold text-foreground/75 hover:bg-muted sm:block">
              تواصل معنا
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              ابدأ مجاناً
              <ArrowLeft className="size-4" />
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">{children}</main>
      <footer className="border-t border-border bg-[oklch(0.975_0.018_85)]">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>تدقيق · مراجعة فواتير هنقرستيشن وكيتا وجاهز للمطاعم في السعودية</p>
          <nav aria-label="روابط" className="flex flex-wrap gap-4">
            <Link to="/" className="hover:text-foreground">
              الرئيسية
            </Link>
            <Link to="/products" className="hover:text-foreground">
              المنتجات
            </Link>
            <Link to="/guides" className="hover:text-foreground">
              كل الأدلة
            </Link>
            <a href="/#faq" className="hover:text-foreground">
              الأسئلة الشائعة
            </a>
            <Link to="/privacy" className="hover:text-foreground">
              سياسة الخصوصية
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              الشروط والأحكام
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function Section({ section }: { section: GuideSection }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-extrabold leading-[1.5]">{section.heading}</h2>
      {section.paragraphs?.map((paragraph) => (
        <p key={paragraph} className="mt-4 text-[16px] leading-8 text-foreground/85">
          {paragraph}
        </p>
      ))}
      {section.steps ? (
        <ol className="mt-5 space-y-3">
          {section.steps.map((step, index) => (
            <li key={step} className="flex gap-3 text-[16px] leading-8">
              <span className="num mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {section.bullets ? (
        <ul className="mt-5 space-y-3">
          {section.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-3 text-[16px] leading-8">
              <Check className="mt-2 size-4 shrink-0 text-success" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {section.table ? (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-muted text-start">
              <tr>
                {section.table.head.map((cell) => (
                  <th key={cell} scope="col" className="px-4 py-3 text-start font-bold">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row) => (
                <tr key={row.join("|")} className="border-t border-border align-top">
                  {row.map((cell, index) => (
                    <td key={index} className="px-4 py-3 leading-7" dir={/^[A-Za-z]/.test(cell) ? "ltr" : undefined}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {section.quote ? (
        <blockquote className="mt-5 whitespace-pre-line rounded-2xl border-s-4 border-primary bg-card p-5 text-[15px] leading-8">
          {section.quote}
        </blockquote>
      ) : null}
    </section>
  );
}

export function GuidePage({ guide }: { guide: Guide }) {
  const others = GUIDES.filter((other) => other.slug !== guide.slug);
  return (
    <GuideShell>
      <nav aria-label="مسار الصفحة" className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          الرئيسية
        </Link>
        <span className="mx-2">/</span>
        <Link to="/guides" className="hover:text-foreground">
          الأدلة
        </Link>
      </nav>
      <article className="mt-6">
        <header>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary-text">
            <PlatformName platform={guide.platform} iconClassName="size-6 rounded-full" />
          </p>
          <h1 className="mt-3 font-display text-3xl font-extrabold leading-[1.45] sm:text-4xl">{guide.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            فريق تدقيق · آخر تحديث: <time dateTime={guide.updated}>{formatArabicDate(guide.updated)}</time>
          </p>
        </header>
        <p className="mt-8 rounded-2xl bg-ink p-6 text-[17px] leading-9 text-ink-foreground">{guide.answer}</p>
        {guide.sections.map((section) => (
          <Section key={section.heading} section={section} />
        ))}
        <section className="mt-12">
          <h2 className="font-display text-2xl font-extrabold leading-[1.5]">أسئلة شائعة</h2>
          <div className="mt-4 border-b border-border">
            {guide.faqs.map(([question, answer]) => (
              <div key={question} className="border-t border-border py-5">
                <h3 className="text-lg font-bold">{question}</h3>
                <p className="mt-2 text-[15px] leading-8 text-muted-foreground">{answer}</p>
              </div>
            ))}
          </div>
        </section>
      </article>
      <aside className="mt-12 flex flex-col items-start gap-4 rounded-[24px] bg-ink p-7 text-ink-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-xl font-extrabold">خلّ تدقيق يراجعها عنك.</p>
          <p className="mt-1 text-sm text-ink-muted">ارفع ملفات شهر واحد مجاناً وشاهد الفروقات لكل فرع.</p>
        </div>
        <Link to="/auth" search={{ mode: "signup" }} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">
          ابدأ مجاناً
          <ArrowLeft className="size-4" />
        </Link>
      </aside>
      <nav aria-label="أدلة أخرى" className="mt-12">
        <h2 className="text-sm font-bold text-muted-foreground">أدلة أخرى</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {others.map((other) => (
            <li key={other.slug}>
              <a href={other.path} className="flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary">
                <PlatformIcon platform={other.platform} className="size-8 shrink-0 rounded-full" />
                <span className="font-semibold leading-7">{other.title}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </GuideShell>
  );
}

export function GuidesIndexPage() {
  return (
    <GuideShell>
      <h1 className="font-display text-3xl font-extrabold leading-[1.45] sm:text-4xl">أدلة مراجعة فواتير تطبيقات التوصيل</h1>
      <p className="mt-4 text-[17px] leading-8 text-muted-foreground">
        خطوات عملية لمراجعة فواتير هنقرستيشن وكيتا وجاهز بنفسك: ما الملفات التي تحتاجها، وما البنود التي تتحقق منها، وكيف تعترض على التعويضات بالأدلة.
      </p>
      <ul className="mt-10 grid gap-4">
        {GUIDES.map((guide) => (
          <li key={guide.slug}>
            <a href={guide.path} className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 hover:border-primary">
              <PlatformIcon platform={guide.platform} className="size-10 shrink-0 rounded-full" />
              <div>
                <h2 className="font-display text-lg font-bold leading-8">{guide.title}</h2>
                <p className="mt-1 text-sm leading-7 text-muted-foreground">{guide.description}</p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </GuideShell>
  );
}
