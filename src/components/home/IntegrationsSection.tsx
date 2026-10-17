import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";

import { IntegrationTile } from "@/components/marketplace/MarketplacePages";
import { MARKETPLACE } from "@/lib/marketplace";

import { SectionIntro } from "./SectionIntro";

/** Homepage section: the integrations as a tile grid, each opening its marketplace page. */
export function IntegrationsSection() {
  return (
    <section id="integrations" className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-24">
      <SectionIntro eyebrow="التكاملات" title="يتصل بأنظمتك.">
        أرسل القيود إلى نظامك المحاسبي، واستقبل أدلة الفروع وتقاريرك، واسأل مساعدك الذكي.
        <Link to="/marketplace" className="mt-6 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">
          تصفح التكاملات
          <ArrowLeft className="size-4" />
        </Link>
      </SectionIntro>
      <ul data-reveal className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {MARKETPLACE.map((item) => (
          <li key={item.slug}>
            <Link to={item.path} className="group block h-full rounded-2xl border border-border bg-card p-1.5 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-foreground/25 sm:p-2">
              <IntegrationTile item={item} size="sm" />
              <span className="line-clamp-2 block px-0.5 pb-0.5 pt-2 text-center text-[11.5px] font-bold leading-4 sm:text-[13px] sm:leading-5">{item.name}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link
            to="/contact"
            className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-2 text-center transition-colors hover:border-foreground/30"
          >
            <span className="grid size-9 place-items-center rounded-full bg-secondary text-primary-text">
              <Plus className="size-4" aria-hidden />
            </span>
            <span className="text-[12px] font-bold sm:text-[13px]">اطلب نظامك</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
