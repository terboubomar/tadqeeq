/** Public site origin used for canonical URLs, Open Graph and structured data. */
export const SITE_URL = "https://tadqeeq.app";
export const SITE_NAME = "تدقيق";
export const SITE_NAME_EN = "Tadqeeq";
export const OG_IMAGE = `${SITE_URL}/og.png`;

/** For signed-in app screens and utility pages that should never appear in search results. */
export const NOINDEX = { name: "robots", content: "noindex, nofollow" } as const;

export function canonical(path: string) {
  return { rel: "canonical", href: `${SITE_URL}${path}` };
}

/** Open Graph + Twitter tags for a public page. */
export function socialMeta({ title, description, path }: { title: string; description: string; path: string }) {
  return [
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: `${SITE_URL}${path}` },
    { property: "og:image", content: OG_IMAGE },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: `${SITE_NAME} · مراجعة فواتير تطبيقات التوصيل` },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: OG_IMAGE },
  ];
}

export function jsonLd(data: Record<string, unknown>) {
  return { type: "application/ld+json", children: JSON.stringify(data) };
}

export type PublicPage = {
  path: string;
  /** Link text in llms.txt. */
  title: string;
  /** Last meaningful content change (YYYY-MM-DD). Update it when the page's content changes. */
  lastmod: string;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
};

/** Every page that should be indexed. Adding a public page here adds it to sitemap.xml and llms.txt. */
export const PUBLIC_PAGES: PublicPage[] = [
  { path: "/", title: "Home", lastmod: "2026-10-14", changefreq: "weekly", priority: 1 },
  { path: "/guides", title: "أدلة مراجعة فواتير تطبيقات التوصيل", lastmod: "2026-10-17", changefreq: "monthly", priority: 0.7 },
  { path: "/guides/keeta-invoice", title: "كيف تراجع فاتورة كيتا؟", lastmod: "2026-10-04", changefreq: "monthly", priority: 0.8 },
  { path: "/guides/hungerstation-compensation", title: "كيف تعترض على تعويضات هنقرستيشن؟", lastmod: "2026-10-04", changefreq: "monthly", priority: 0.8 },
  { path: "/guides/jahez-commission", title: "كيف تتأكد من عمولة جاهز وصافي المطعم؟", lastmod: "2026-10-04", changefreq: "monthly", priority: 0.8 },
  { path: "/guides/accounting-integrations", title: "ربط تدقيق بنظامك المحاسبي وإرسال القيود مباشرة", lastmod: "2026-10-17", changefreq: "monthly", priority: 0.7 },
  { path: "/products", title: "منتجات تدقيق", lastmod: "2026-10-14", changefreq: "monthly", priority: 0.8 },
  { path: "/products/invoice-reconciliation", title: "مُطابِق · مطابقة الفاتورة", lastmod: "2026-10-14", changefreq: "monthly", priority: 0.8 },
  { path: "/products/delivery-fees-map", title: "كاشِف · خريطة الرسوم", lastmod: "2026-10-05", changefreq: "monthly", priority: 0.7 },
  { path: "/products/exceptions-center", title: "رادار · مركز الاستثناءات", lastmod: "2026-10-05", changefreq: "monthly", priority: 0.7 },
  { path: "/products/compensation-claims", title: "استرداد · مركز التعويضات", lastmod: "2026-10-05", changefreq: "monthly", priority: 0.8 },
  { path: "/products/promotions-roi", title: "عائد · عائد العروض والإعلانات", lastmod: "2026-10-05", changefreq: "monthly", priority: 0.7 },
  { path: "/products/smart-alerts", title: "رقيب · المراقب الذكي", lastmod: "2026-10-05", changefreq: "monthly", priority: 0.7 },
  { path: "/products/daily-tracking", title: "نَبْض · المتابعة اليومية", lastmod: "2026-10-14", changefreq: "monthly", priority: 0.7 },
  { path: "/pricing", title: "الخطط والأسعار", lastmod: "2026-10-14", changefreq: "monthly", priority: 0.8 },
  { path: "/contact", title: "تواصل معنا", lastmod: "2026-10-05", changefreq: "yearly", priority: 0.5 },
  { path: "/privacy", title: "سياسة الخصوصية", lastmod: "2026-10-17", changefreq: "yearly", priority: 0.3 },
  { path: "/terms", title: "الشروط والأحكام", lastmod: "2026-10-17", changefreq: "yearly", priority: 0.3 },
  { path: "/refund-policy", title: "سياسة الإلغاء والاسترداد", lastmod: "2026-10-05", changefreq: "yearly", priority: 0.3 },
  { path: "/cookies", title: "سياسة ملفات تعريف الارتباط", lastmod: "2026-10-05", changefreq: "yearly", priority: 0.2 },
];

/** App sections whose every sub-path is private. */
export const PRIVATE_PREFIXES = ["/api/", "/lovable/", "/.lovable/", "/.well-known/", "/ops", "/operations", "/compensation"];

/** Single private screens, blocked exactly so future public pages that share a prefix stay crawlable. */
export const PRIVATE_PAGES = [
  "/accept-invite",
  "/ai",
  "/ask",
  "/branch-mapping",
  "/integrations",
  "/branches",
  "/breakdown",
  "/charges",
  "/daily",
  "/dashboard",
  "/email-confirmed",
  "/exceptions",
  "/history",
  "/import",
  "/invoice-check",
  "/journal",
  "/mcp",
  "/onboarding",
  "/promotions",
  "/report-schedules",
  "/reset-password",
  "/security",
  "/start",
  "/subscribe",
  "/team",
  "/trends",
];

/** Crawlable so search engines can see their noindex tag, but never listed in the sitemap. */
export const NOINDEX_PAGES = ["/auth", "/auth-handoff"];

/** AI search and assistant crawlers, named so it is explicit that they may read and cite public pages. */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
];

/**
 * Pages are canonical without a trailing slash (/guides, not /guides/). The router's own redirect is a temporary
 * 307; this returns the target for a permanent one, or null. API, Lovable and .well-known paths are left alone.
 */
export function trailingSlashRedirect(url: URL, method: string): string | null {
  if (method !== "GET" && method !== "HEAD") return null;
  const path = url.pathname;
  if (path === "/" || !path.endsWith("/")) return null;
  if (/^\/(api|lovable|\.lovable|\.well-known)\//.test(path)) return null;
  return path.replace(/\/+$/, "") + url.search;
}
