import { BLOG_POSTS, type BlogPost } from "./blog";
import { OG_IMAGE, SITE_NAME, SITE_URL, canonical, jsonLd, socialMeta } from "./seo";

const ORGANIZATION = { "@id": `${SITE_URL}/#organization` };

/** Head tags for a blog post: meta, canonical, and BlogPosting + FAQPage + BreadcrumbList structured data. */
export function blogPostHead(post: BlogPost) {
  const url = `${SITE_URL}${post.path}`;
  return {
    meta: [
      { title: post.metaTitle },
      { name: "description", content: post.description },
      ...socialMeta({ title: post.metaTitle, description: post.description, path: post.path }),
      { property: "og:type", content: "article" },
      { property: "article:published_time", content: post.published },
      { property: "article:modified_time", content: post.updated },
    ],
    links: [canonical(post.path)],
    scripts: [
      jsonLd({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "BlogPosting",
            "@id": `${url}#article`,
            headline: post.title,
            description: post.description,
            inLanguage: "ar-SA",
            datePublished: post.published,
            dateModified: post.updated,
            mainEntityOfPage: url,
            image: OG_IMAGE,
            author: { "@type": "Organization", name: `فريق ${SITE_NAME}`, url: SITE_URL },
            publisher: ORGANIZATION,
            isPartOf: { "@id": `${SITE_URL}/blog#blog` },
            citation: post.sources.map((source) => source.url),
          },
          {
            "@type": "FAQPage",
            mainEntity: post.faqs.map(([question, answer]) => ({
              "@type": "Question",
              name: question,
              acceptedAnswer: { "@type": "Answer", text: answer },
            })),
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "الرئيسية", item: `${SITE_URL}/` },
              { "@type": "ListItem", position: 2, name: "المدونة", item: `${SITE_URL}/blog` },
              { "@type": "ListItem", position: 3, name: post.title, item: url },
            ],
          },
        ],
      }),
    ],
  };
}

const INDEX_TITLE = "مدونة تدقيق: سوق تطبيقات التوصيل في السعودية | تدقيق";
const INDEX_DESCRIPTION =
  "مقالات عن سوق تطبيقات التوصيل في السعودية للمطاعم: عمولات هنقرستيشن وكيتا وجاهز الحقيقية، تغيّرات السوق والأنظمة، وكيف تحمي أرباحك.";

export function blogIndexHead() {
  return {
    meta: [
      { title: INDEX_TITLE },
      { name: "description", content: INDEX_DESCRIPTION },
      ...socialMeta({ title: INDEX_TITLE, description: INDEX_DESCRIPTION, path: "/blog" }),
    ],
    links: [canonical("/blog")],
    scripts: [
      jsonLd({
        "@context": "https://schema.org",
        "@type": "Blog",
        "@id": `${SITE_URL}/blog#blog`,
        name: INDEX_TITLE,
        description: INDEX_DESCRIPTION,
        url: `${SITE_URL}/blog`,
        inLanguage: "ar-SA",
        publisher: ORGANIZATION,
        blogPost: BLOG_POSTS.map((post) => ({ "@type": "BlogPosting", headline: post.title, url: `${SITE_URL}${post.path}`, datePublished: post.published })),
      }),
    ],
  };
}
