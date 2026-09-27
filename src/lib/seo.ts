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
