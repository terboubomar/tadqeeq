import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { GuideIcon, GuideShell, Section } from "@/components/guides/GuidePages";
import { BLOG_POSTS, type BlogPost } from "@/lib/blog";
import { GUIDES } from "@/lib/guides";
import { formatArabicDate } from "@/lib/site-content";

/** One article: the guide layout, plus its dated sources and related guides. */
export function BlogPostPage({ post }: { post: BlogPost }) {
  const others = BLOG_POSTS.filter((other) => other.slug !== post.slug);
  return (
    <GuideShell>
      <nav aria-label="مسار الصفحة" className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          الرئيسية
        </Link>
        <span className="mx-2">/</span>
        <Link to="/blog" className="hover:text-foreground">
          المدونة
        </Link>
      </nav>
      <article className="mt-6">
        <header>
          <h1 className="font-display text-3xl font-extrabold leading-[1.45] sm:text-4xl">{post.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            فريق تدقيق · نُشر: <time dateTime={post.published}>{formatArabicDate(post.published)}</time>
            {post.updated !== post.published ? (
              <>
                {" "}· آخر تحديث: <time dateTime={post.updated}>{formatArabicDate(post.updated)}</time>
              </>
            ) : null}
          </p>
        </header>
        <p className="mt-8 rounded-2xl bg-ink p-6 text-[17px] leading-9 text-ink-foreground">{post.answer}</p>
        {post.sections.map((section) => (
          <Section key={section.heading} section={section} />
        ))}
        <section className="mt-12">
          <h2 className="font-display text-2xl font-extrabold leading-[1.5]">أسئلة شائعة</h2>
          <div className="mt-4 border-b border-border">
            {post.faqs.map(([question, answer]) => (
              <div key={question} className="border-t border-border py-5">
                <h3 className="text-lg font-bold">{question}</h3>
                <p className="mt-2 text-[15px] leading-8 text-muted-foreground">{answer}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="mt-12">
          <h2 className="font-display text-2xl font-extrabold leading-[1.5]">المصادر</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            معلومات السوق في هذا المقال حتى <time dateTime={post.factsAsOf}>{formatArabicDate(post.factsAsOf)}</time>.
          </p>
          <ul className="mt-4 space-y-3 text-[15px] leading-7">
            {post.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-text underline-offset-4 hover:underline" dir="ltr">
                  {source.title}
                </a>
                <span className="block text-sm text-muted-foreground">
                  {source.publisher} · <time dateTime={source.date}>{formatArabicDate(source.date)}</time>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </article>
      <aside className="mt-12 flex flex-col items-start gap-4 rounded-[24px] bg-ink p-7 text-ink-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-xl font-extrabold">اعرف تكلفتك الفعلية لكل منصة وفرع.</p>
          <p className="mt-1 text-sm text-ink-muted">ارفع ملفات شهر واحد مجاناً وشاهد أين تذهب رسوم التوصيل.</p>
        </div>
        <Link to="/auth" search={{ mode: "signup" }} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">
          ابدأ مجاناً
          <ArrowLeft className="size-4" />
        </Link>
      </aside>
      {others.length ? (
        <nav aria-label="مقالات أخرى" className="mt-12">
          <h2 className="text-sm font-bold text-muted-foreground">مقالات أخرى</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {others.map((other) => (
              <li key={other.slug}>
                <a href={other.path} className="flex h-full items-start rounded-2xl border border-border bg-card p-4 font-semibold leading-7 hover:border-primary">
                  {other.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <nav aria-label="أدلة ذات صلة" className="mt-12">
        <h2 className="text-sm font-bold text-muted-foreground">أدلة عملية</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {GUIDES.filter((guide) => guide.platform).map((guide) => (
            <li key={guide.slug}>
              <a href={guide.path} className="flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary">
                <GuideIcon platform={guide.platform} className="size-8" />
                <span className="font-semibold leading-7">{guide.title}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </GuideShell>
  );
}

export function BlogIndexPage() {
  const posts = [...BLOG_POSTS].sort((a, b) => b.published.localeCompare(a.published));
  return (
    <GuideShell>
      <h1 className="font-display text-3xl font-extrabold leading-[1.45] sm:text-4xl">مدونة تدقيق</h1>
      <p className="mt-4 text-[17px] leading-8 text-muted-foreground">
        ما يتغيّر في سوق تطبيقات التوصيل في السعودية وأثره على مطعمك: العمولات الحقيقية، والعروض والإعلانات، والأنظمة الجديدة. كل معلومة بتاريخها ومصدرها.
      </p>
      <ul className="mt-10 grid gap-4">
        {posts.map((post) => (
          <li key={post.slug}>
            <a href={post.path} className="block rounded-2xl border border-border bg-card p-5 hover:border-primary">
              <p className="text-sm text-muted-foreground">
                <time dateTime={post.published}>{formatArabicDate(post.published)}</time>
              </p>
              <h2 className="mt-1 font-display text-lg font-bold leading-8">{post.title}</h2>
              <p className="mt-1 text-sm leading-7 text-muted-foreground">{post.description}</p>
            </a>
          </li>
        ))}
      </ul>
    </GuideShell>
  );
}
