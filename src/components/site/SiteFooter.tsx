import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUp } from "lucide-react";

import { LogoWordmark } from "@/components/brand/Logo";
import { PlatformName } from "@/components/brand/PlatformLogo";
import { LEGAL_DOCS } from "@/lib/legal";
import { PRODUCT_PAGES } from "@/lib/product-pages";
import { PRODUCTS } from "@/lib/products";
import { PLATFORM_KEYS } from "@/lib/platforms";

const GUIDE_LINKS = [
  ["/guides/keeta-invoice", "مراجعة فاتورة كيتا"],
  ["/guides/hungerstation-compensation", "تعويضات هنقرستيشن"],
  ["/guides/jahez-commission", "عمولة جاهز"],
  ["/guides", "كل الأدلة"],
] as const;

/**
 * The public site footer, after the 21st.dev «Footer With Newsletter» (balick footer-01) without the newsletter box
 * (Tadqeeq has no mailing list) or social icons (no official accounts yet): logo and pitch with the supported
 * platforms, four link columns, a bottom bar, and the large faint «تدقيق» wordmark underneath.
 * `showPricing` hides the pricing link when the homepage has no plans to show.
 */
export function SiteFooter({ showPricing = true }: { showPricing?: boolean }) {
  const columns: Array<{ title: string; links: Array<readonly [string, string]> }> = [
    {
      title: "المنتجات",
      links: [...PRODUCT_PAGES.map((page) => [page.path, PRODUCTS[page.product].name] as const), ["/products", "كل المنتجات"] as const],
    },
    { title: "أدلة", links: [...GUIDE_LINKS] },
    {
      title: "تعرّف على تدقيق",
      links: [
        ["/#how", "كيف يعمل"],
        ...(showPricing ? [["/#pricing", "الخطط والأسعار"] as const] : []),
        ["/#video", "فيديو تعريفي"],
        ["/#faq", "الأسئلة الشائعة"],
        ["/contact", "تواصل معنا"],
      ],
    },
    { title: "قانوني", links: LEGAL_DOCS.map((doc) => [doc.path, doc.label] as const) },
  ];

  return (
    <footer className="relative mt-4 overflow-hidden border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 sm:pt-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
          <div className="flex max-w-sm flex-col items-start gap-5">
            <Link to="/" aria-label="تدقيق: الرئيسية">
              <LogoWordmark className="h-9 text-ink" />
            </Link>
            <p className="text-sm leading-7 text-muted-foreground">
              نعيد احتساب كل بند في فواتير تطبيقات التوصيل من طلباتك وعقدك، ونجهّز مطالبات التعويض بالأدلة لكل فرع.
            </p>
            <ul aria-label="المنصات المدعومة" className="flex flex-wrap gap-2 text-xs font-semibold">
              {PLATFORM_KEYS.map((key) => (
                <li key={key} className="rounded-full border border-border bg-background py-1 ps-1 pe-3">
                  <PlatformName platform={key} iconClassName="size-5 rounded-full" />
                </li>
              ))}
            </ul>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-semibold text-ink-foreground transition-transform hover:-translate-y-0.5"
            >
              ابدأ مجاناً
              <ArrowLeft className="size-3.5" />
            </Link>
          </div>

          <nav aria-label="روابط التذييل" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {columns.map((column) => (
              <div key={column.title}>
                <h2 className="text-sm font-bold">{column.title}</h2>
                <ul className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
                  {column.links.map(([href, label]) => (
                    <li key={href}>
                      <a href={href} className="transition-colors hover:text-foreground">
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-14 flex flex-col-reverse items-start justify-between gap-4 border-t border-border py-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>
            <span className="num">© {new Date().getFullYear()}</span> تدقيق · مراجعة فواتير التوصيل للمطاعم · صُنع في السعودية
          </p>
          <div className="flex items-center gap-4">
            <Link to="/auth" className="font-semibold transition-colors hover:text-foreground">
              تسجيل الدخول
            </Link>
            <a href="#top" className="inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-foreground">
              العودة للأعلى
              <ArrowUp className="size-3.5" />
            </a>
          </div>
        </div>
      </div>

      <div aria-hidden="true" className="pointer-events-none select-none px-4">
        <p className="-mb-[0.28em] bg-gradient-to-b from-foreground/12 to-transparent bg-clip-text text-center font-display text-[clamp(6rem,24vw,17rem)] font-extrabold leading-none text-transparent">
          تدقيق
        </p>
      </div>
    </footer>
  );
}
