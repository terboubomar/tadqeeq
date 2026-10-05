import { createFileRoute } from "@tanstack/react-router";

import { ContactPage } from "@/components/ContactPage";
import { LEGAL_COMPANY } from "@/lib/legal";
import { SITE_URL, canonical, jsonLd, socialMeta } from "@/lib/seo";

const TITLE = "تواصل معنا: عرض توضيحي ودعم لتدقيق فواتير التوصيل | تدقيق";
const DESCRIPTION = "تواصل مع فريق تدقيق لطلب عرض توضيحي لمراجعة فواتير هنقرستيشن وجاهز وكيتا، أو للاستفسار عن الباقات والأسعار، أو للدعم الفني لحسابك. نرد خلال يوم عمل.";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [{ title: TITLE }, { name: "description", content: DESCRIPTION }, ...socialMeta({ title: TITLE, description: DESCRIPTION, path: "/contact" })],
    links: [canonical("/contact")],
    scripts: [
      jsonLd({
        "@context": "https://schema.org",
        "@type": "ContactPage",
        "@id": `${SITE_URL}/contact#webpage`,
        name: "تواصل معنا",
        description: DESCRIPTION,
        inLanguage: "ar-SA",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        mainEntity: {
          "@id": `${SITE_URL}/#organization`,
          contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: LEGAL_COMPANY.email, areaServed: "SA", availableLanguage: ["ar", "en"] },
        },
      }),
    ],
  }),
  component: ContactPage,
});
