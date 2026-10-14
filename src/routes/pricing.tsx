import { createFileRoute, Link } from "@tanstack/react-router";

import { GuideShell } from "@/components/guides/GuidePages";
import { Pricing } from "@/components/home/PricingSection";
import { listPublicPlans } from "@/lib/plans.functions";
import { SITE_URL, canonical, jsonLd, socialMeta } from "@/lib/seo";

const TITLE = "الخطط والأسعار: قارن باقات تدقيق فواتير التوصيل | تدقيق";
const DESCRIPTION =
  "باقات تدقيق حسب عدد طلباتك الشهرية، مع فروع ومنصات ومستخدمين بلا حدود. قارن البداية والنمو والشاملة شهرياً أو سنوياً، وابدأ بتجربة مجانية بدون بطاقة.";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [{ title: TITLE }, { name: "description", content: DESCRIPTION }, ...socialMeta({ title: TITLE, description: DESCRIPTION, path: "/pricing" })],
    links: [canonical("/pricing")],
    scripts: [
      jsonLd({
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": `${SITE_URL}/pricing#webpage`,
        name: "الخطط والأسعار",
        description: DESCRIPTION,
        inLanguage: "ar-SA",
        isPartOf: { "@id": `${SITE_URL}/#website` },
      }),
    ],
  }),
  loader: () => listPublicPlans(),
  component: PricingPage,
});

function PricingPage() {
  const plans = Route.useLoaderData();
  return (
    <GuideShell wide>
      {plans.length ? (
        <Pricing plans={plans} heading="h1" />
      ) : (
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h1 className="font-display text-3xl font-extrabold leading-[1.4]">الخطط والأسعار</h1>
          <p className="mt-4 text-base leading-8 text-muted-foreground">تعذّر عرض الباقات الآن. تواصل معنا ونرسل لك الأسعار.</p>
          <Link to="/contact" className="mt-6 inline-flex h-11 items-center rounded-full bg-ink px-5 text-sm font-bold text-ink-foreground">
            تواصل معنا
          </Link>
        </div>
      )}
    </GuideShell>
  );
}
