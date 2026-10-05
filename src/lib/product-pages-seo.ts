import { PRODUCT_PAGES, PRODUCTS_INDEX, type ProductPage } from "./product-pages";
import { PRODUCTS } from "./products";
import { OG_IMAGE, SITE_URL, canonical, jsonLd, socialMeta } from "./seo";

const ORGANIZATION = { "@id": `${SITE_URL}/#organization` };
const WEBSITE = { "@id": `${SITE_URL}/#website` };

/**
 * Head tags for a product page: meta, canonical, and WebPage + FAQPage + BreadcrumbList structured data. No
 * SoftwareApplication node here: Google expects offers and ratings on it, and the homepage already carries the app.
 */
export function productPageHead(page: ProductPage) {
  const url = `${SITE_URL}${page.path}`;
  const product = PRODUCTS[page.product];
  return {
    meta: [
      { title: page.metaTitle },
      { name: "description", content: page.description },
      ...socialMeta({ title: page.metaTitle, description: page.description, path: page.path }),
    ],
    links: [canonical(page.path)],
    scripts: [
      jsonLd({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebPage",
            "@id": `${url}#webpage`,
            url,
            name: page.title,
            description: page.description,
            inLanguage: "ar-SA",
            dateModified: page.updated,
            image: OG_IMAGE,
            isPartOf: WEBSITE,
            publisher: ORGANIZATION,
            about: {
              "@type": "Thing",
              name: `${product.name} · ${product.descriptor}`,
              alternateName: `${product.nameEn} (${product.descriptorEn})`,
              description: page.answer,
            },
          },
          {
            "@type": "FAQPage",
            mainEntity: page.faqs.map(([question, answer]) => ({
              "@type": "Question",
              name: question,
              acceptedAnswer: { "@type": "Answer", text: answer },
            })),
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "الرئيسية", item: `${SITE_URL}/` },
              { "@type": "ListItem", position: 2, name: "المنتجات", item: `${SITE_URL}${PRODUCTS_INDEX.path}` },
              { "@type": "ListItem", position: 3, name: product.name, item: url },
            ],
          },
        ],
      }),
    ],
  };
}

export function productsIndexHead() {
  const { path, metaTitle, description } = PRODUCTS_INDEX;
  return {
    meta: [{ title: metaTitle }, { name: "description", content: description }, ...socialMeta({ title: metaTitle, description, path })],
    links: [canonical(path)],
    scripts: [
      jsonLd({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: PRODUCTS_INDEX.title,
        description,
        url: `${SITE_URL}${path}`,
        inLanguage: "ar-SA",
        isPartOf: WEBSITE,
        publisher: ORGANIZATION,
        hasPart: PRODUCT_PAGES.map((page) => ({ "@type": "WebPage", name: page.title, url: `${SITE_URL}${page.path}` })),
      }),
    ],
  };
}
