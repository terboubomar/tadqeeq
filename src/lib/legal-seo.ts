import type { LegalDoc } from "./legal";
import { SITE_URL, canonical, jsonLd, socialMeta } from "./seo";

/** Head tags for a legal page: meta, canonical and WebPage structured data. */
export function legalHead(doc: LegalDoc) {
  return {
    meta: [
      { title: doc.metaTitle },
      { name: "description", content: doc.description },
      ...socialMeta({ title: doc.metaTitle, description: doc.description, path: doc.path }),
    ],
    links: [canonical(doc.path)],
    scripts: [
      jsonLd({
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": `${SITE_URL}${doc.path}#webpage`,
        name: doc.title,
        description: doc.description,
        inLanguage: "ar-SA",
        dateModified: doc.updated,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        publisher: { "@id": `${SITE_URL}/#organization` },
      }),
    ],
  };
}
