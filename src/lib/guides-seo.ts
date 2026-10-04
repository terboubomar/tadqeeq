import { GUIDES, type Guide } from "./guides";
import { OG_IMAGE, SITE_NAME, SITE_URL, canonical, jsonLd, socialMeta } from "./seo";

const ORGANIZATION = { "@id": `${SITE_URL}/#organization` };

/** Head tags for a guide: meta, canonical, and Article + FAQPage + BreadcrumbList structured data. */
export function guideHead(guide: Guide) {
  const url = `${SITE_URL}${guide.path}`;
  return {
    meta: [
      { title: guide.metaTitle },
      { name: "description", content: guide.description },
      ...socialMeta({ title: guide.metaTitle, description: guide.description, path: guide.path }),
      { property: "og:type", content: "article" },
      { property: "article:published_time", content: guide.published },
      { property: "article:modified_time", content: guide.updated },
    ],
    links: [canonical(guide.path)],
    scripts: [
      jsonLd({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Article",
            "@id": `${url}#article`,
            headline: guide.title,
            description: guide.description,
            inLanguage: "ar-SA",
            datePublished: guide.published,
            dateModified: guide.updated,
            mainEntityOfPage: url,
            image: OG_IMAGE,
            author: { "@type": "Organization", name: `فريق ${SITE_NAME}`, url: SITE_URL },
            publisher: ORGANIZATION,
            isPartOf: { "@id": `${SITE_URL}/#website` },
          },
          {
            "@type": "FAQPage",
            mainEntity: guide.faqs.map(([question, answer]) => ({
              "@type": "Question",
              name: question,
              acceptedAnswer: { "@type": "Answer", text: answer },
            })),
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "الرئيسية", item: `${SITE_URL}/` },
              { "@type": "ListItem", position: 2, name: "الأدلة", item: `${SITE_URL}/guides` },
              { "@type": "ListItem", position: 3, name: guide.title, item: url },
            ],
          },
        ],
      }),
    ],
  };
}

const INDEX_TITLE = "أدلة مراجعة فواتير هنقرستيشن وكيتا وجاهز | تدقيق";
const INDEX_DESCRIPTION =
  "أدلة عملية لمراجعة فواتير تطبيقات التوصيل في السعودية: مطابقة فاتورة كيتا، الاعتراض على تعويضات هنقرستيشن، والتأكد من عمولة جاهز وصافي المطعم.";

export function guidesIndexHead() {
  return {
    meta: [
      { title: INDEX_TITLE },
      { name: "description", content: INDEX_DESCRIPTION },
      ...socialMeta({ title: INDEX_TITLE, description: INDEX_DESCRIPTION, path: "/guides" }),
    ],
    links: [canonical("/guides")],
    scripts: [
      jsonLd({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: INDEX_TITLE,
        description: INDEX_DESCRIPTION,
        url: `${SITE_URL}/guides`,
        inLanguage: "ar-SA",
        publisher: ORGANIZATION,
        hasPart: GUIDES.map((guide) => ({ "@type": "Article", headline: guide.title, url: `${SITE_URL}${guide.path}` })),
      }),
    ],
  };
}
