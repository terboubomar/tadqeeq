import { Link } from "@tanstack/react-router";

import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { companyIdentity, LEGAL_COMPANY, LEGAL_DOCS, type LegalDoc } from "@/lib/legal";
import { formatArabicDate } from "@/lib/site-content";

/** Links to every legal page, for footers and the sign-up form. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="الصفحات القانونية" className={className}>
      {LEGAL_DOCS.map((doc) => (
        <Link key={doc.key} to={doc.path} className="hover:text-foreground">
          {doc.label}
        </Link>
      ))}
    </nav>
  );
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <div id="top" className="min-h-screen bg-background" dir="rtl">
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <nav aria-label="الصفحات القانونية" className="flex flex-wrap gap-2 text-sm">
          {LEGAL_DOCS.map((item) => (
            <Link
              key={item.key}
              to={item.path}
              aria-current={item.key === doc.key ? "page" : undefined}
              className={
                item.key === doc.key
                  ? "rounded-full bg-ink px-3 py-1.5 font-semibold text-ink-foreground"
                  : "rounded-full border border-border px-3 py-1.5 text-foreground/75 hover:bg-muted"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <article className="mt-8">
          <h1 className="font-display text-3xl font-extrabold leading-[1.4] sm:text-4xl">{doc.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            آخر تحديث: <time dateTime={doc.updated}>{formatArabicDate(doc.updated)}</time>
          </p>
          <p className="mt-6 text-[16px] leading-8 text-foreground/85">{doc.intro}</p>

          {doc.sections.map((section, index) => (
            <section key={section.heading} className="mt-9">
              <h2 className="font-display text-xl font-bold leading-[1.5]">
                <span className="num text-muted-foreground">{index + 1}.</span> {section.heading}
              </h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-[15px] leading-8 text-foreground/85">
                  {paragraph}
                </p>
              ))}
              {section.bullets ? (
                <ul className="mt-3 list-disc space-y-2 ps-5 text-[15px] leading-8 text-foreground/85 marker:text-primary">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
              {section.note ? <p className="mt-3 text-[15px] leading-8 text-foreground/85">{section.note}</p> : null}
            </section>
          ))}

          <section className="mt-10 rounded-[14px] border border-border bg-card p-5">
            <h2 className="font-display text-lg font-bold">التواصل معنا</h2>
            <ul className="mt-3 space-y-1 text-sm leading-7 text-foreground/85">
              {companyIdentity().map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <a href={`mailto:${LEGAL_COMPANY.email}`} className="mt-3 inline-block text-sm font-semibold text-primary hover:underline" dir="ltr">
              {LEGAL_COMPANY.email}
            </a>
          </section>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
