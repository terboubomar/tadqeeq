import { MARKETPLACE, MARKETPLACE_INDEX, MARKETPLACE_UPDATED, type MarketplaceItem } from "./marketplace";
import { OG_IMAGE, SITE_URL, canonical, jsonLd, socialMeta } from "./seo";

const ORGANIZATION = { "@id": `${SITE_URL}/#organization` };
const WEBSITE = { "@id": `${SITE_URL}/#website` };

/** Head tags for one integration's page: meta, canonical, and WebPage + BreadcrumbList structured data. */
export function marketplaceItemHead(item: MarketplaceItem) {
  const url = `${SITE_URL}${item.path}`;
  return {
    meta: [
      { title: item.metaTitle },
      { name: "description", content: item.summary },
      ...socialMeta({ title: item.metaTitle, description: item.summary, path: item.path }),
    ],
    links: [canonical(item.path)],
    scripts: [
      jsonLd({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebPage",
            "@id": `${url}#webpage`,
            url,
            name: `${item.name} مع تدقيق`,
            description: item.summary,
            inLanguage: "ar-SA",
            dateModified: MARKETPLACE_UPDATED,
            image: OG_IMAGE,
            isPartOf: WEBSITE,
            publisher: ORGANIZATION,
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "الرئيسية", item: `${SITE_URL}/` },
              { "@type": "ListItem", position: 2, name: MARKETPLACE_INDEX.title, item: `${SITE_URL}${MARKETPLACE_INDEX.path}` },
              { "@type": "ListItem", position: 3, name: item.name, item: url },
            ],
          },
        ],
      }),
    ],
  };
}

export function marketplaceIndexHead() {
  const { path, metaTitle, description, title } = MARKETPLACE_INDEX;
  return {
    meta: [{ title: metaTitle }, { name: "description", content: description }, ...socialMeta({ title: metaTitle, description, path })],
    links: [canonical(path)],
    scripts: [
      jsonLd({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: title,
        description,
        url: `${SITE_URL}${path}`,
        inLanguage: "ar-SA",
        isPartOf: WEBSITE,
        publisher: ORGANIZATION,
        hasPart: MARKETPLACE.map((item) => ({ "@type": "WebPage", name: item.name, url: `${SITE_URL}${item.path}` })),
      }),
    ],
  };
}
