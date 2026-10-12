import { Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, CircleHelp, Mail, Menu, PlayCircle } from "lucide-react";
import { useState, type ReactNode } from "react";

import { LogoWordmark } from "@/components/brand/Logo";
import { ProductIcon } from "@/components/products/ProductIcon";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PRODUCT_PAGES } from "@/lib/product-pages";
import { PRODUCTS } from "@/lib/products";
import { cn } from "@/lib/utils";

type MenuLink = { title: string; href: string; description?: string; icon: ReactNode };

/** Every product page, with its icon and one-line summary. */
const PRODUCT_LINKS: MenuLink[] = PRODUCT_PAGES.map((page) => ({
  title: `${PRODUCTS[page.product].name} · ${PRODUCTS[page.product].descriptor}`,
  href: page.path,
  description: page.summary,
  icon: <ProductIcon product={page.product} className="size-10" />,
}));

const RESOURCE_LINKS: MenuLink[] = [
  { title: "أدلة المراجعة", href: "/guides", description: "كيف تراجع فواتير هنقرستيشن وجاهز وكيتا خطوة بخطوة.", icon: <ResourceIcon><BookOpen /></ResourceIcon> },
  { title: "فيديو تعريفي", href: "/#video", description: "دقيقتان تشرحان تدقيق من الرفع إلى الاسترداد.", icon: <ResourceIcon><PlayCircle /></ResourceIcon> },
  { title: "الأسئلة الشائعة", href: "/#faq", description: "ما يسأله أصحاب المطاعم قبل أن يبدؤوا.", icon: <ResourceIcon><CircleHelp /></ResourceIcon> },
  { title: "تواصل معنا", href: "/contact", description: "أسئلة عن الباقات أو تجربة لفروعك.", icon: <ResourceIcon><Mail /></ResourceIcon> },
];

function ResourceIcon({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary-text [&>svg]:size-[18px]">
      {children}
    </span>
  );
}

/**
 * The public site header (homepage, products, guides, contact, legal), after the 21st.dev «Navbar with Dropdowns»
 * (shadcnblocks navbar1): logo, «المنتجات» and «الموارد» dropdowns with an icon and a line for each link, two plain
 * links, and sign-in / start-free on the side. On phones it becomes a side sheet with the same groups as accordions.
 * `showPricing` hides the pricing link when the homepage has no plans to show.
 */
export function SiteHeader({ showPricing = true }: { showPricing?: boolean }) {
  const [open, setOpen] = useState(false);
  const plainLinks = [
    { title: "كيف يعمل", href: "/#how" },
    ...(showPricing ? [{ title: "الخطط والأسعار", href: "/#pricing" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:h-[72px] sm:px-6">
        <div className="flex items-center gap-6">
          <Link to="/" aria-label="تدقيق: الرئيسية" className="flex items-center gap-2.5">
            <LogoWordmark className="h-8 text-ink sm:h-9" />
            <span className="hidden border-s border-border ps-2.5 text-[11px] leading-tight text-muted-foreground sm:block">
              مراجعة فواتير
              <br />
              التوصيل
            </span>
          </Link>
          <NavigationMenu dir="rtl" className="hidden lg:flex">
            <NavigationMenuList className="gap-1 space-x-0">
              <MenuGroup title="المنتجات" links={PRODUCT_LINKS} wide footer={{ title: "كل المنتجات", href: "/products" }} />
              <MenuGroup title="الموارد" links={RESOURCE_LINKS} />
              {plainLinks.map((link) => (
                <NavigationMenuItem key={link.href}>
                  <NavigationMenuLink asChild>
                    <a href={link.href} className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-foreground/75 transition-colors hover:bg-muted hover:text-foreground">
                      {link.title}
                    </a>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/auth" className="hidden h-10 items-center rounded-full border border-border px-4 text-sm font-semibold transition-colors hover:bg-muted sm:inline-flex">
            تسجيل الدخول
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 sm:px-5"
          >
            ابدأ مجاناً
            <ArrowLeft className="size-4" />
          </Link>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button type="button" aria-label="فتح القائمة" className="grid size-10 place-items-center rounded-full border border-border hover:bg-muted lg:hidden">
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" dir="rtl" className="w-[88vw] overflow-y-auto sm:max-w-sm">
              <SheetHeader className="text-start">
                <SheetTitle>
                  <LogoWordmark title="تدقيق" className="h-8 text-ink" />
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="القائمة" className="mt-6 flex flex-col gap-2">
                <Accordion type="single" collapsible className="flex flex-col">
                  <MobileGroup value="products" title="المنتجات" links={PRODUCT_LINKS} onNavigate={() => setOpen(false)} />
                  <MobileGroup value="resources" title="الموارد" links={RESOURCE_LINKS} onNavigate={() => setOpen(false)} />
                </Accordion>
                {plainLinks.map((link) => (
                  <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="border-b border-border py-4 text-[15px] font-semibold">
                    {link.title}
                  </a>
                ))}
                <div className="mt-4 flex flex-col gap-3">
                  <Link to="/auth" onClick={() => setOpen(false)} className="inline-flex h-11 items-center justify-center rounded-full border border-border text-sm font-semibold">
                    تسجيل الدخول
                  </Link>
                  <Link
                    to="/auth"
                    search={{ mode: "signup" }}
                    onClick={() => setOpen(false)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground"
                  >
                    ابدأ مجاناً
                    <ArrowLeft className="size-4" />
                  </Link>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

/** A dropdown in the desktop bar: one row per link with its icon, title and a short line. */
function MenuGroup({ title, links, wide = false, footer }: { title: string; links: MenuLink[]; wide?: boolean; footer?: { title: string; href: string } }) {
  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger className="bg-transparent text-foreground/75 hover:bg-muted data-[state=open]:bg-muted">{title}</NavigationMenuTrigger>
      <NavigationMenuContent>
        <div className={cn("p-3", wide ? "w-[44rem]" : "w-[24rem]")}>
          <ul className={cn("grid gap-1", wide && "grid-cols-2")}>
            {links.map((link) => (
              <li key={link.href}>
                <NavigationMenuLink asChild>
                  <a href={link.href} className="flex items-start gap-3 rounded-xl p-3 text-start outline-none transition-colors hover:bg-muted focus-visible:bg-muted">
                    {link.icon}
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-foreground">{link.title}</span>
                      {link.description ? <span className="mt-1 block text-[13px] leading-6 text-muted-foreground">{link.description}</span> : null}
                    </span>
                  </a>
                </NavigationMenuLink>
              </li>
            ))}
          </ul>
          {footer ? (
            <NavigationMenuLink asChild>
              <a href={footer.href} className="mt-2 flex items-center justify-between rounded-xl bg-muted px-4 py-3 text-sm font-semibold text-primary-text hover:bg-secondary">
                {footer.title}
                <ArrowLeft className="size-4" />
              </a>
            </NavigationMenuLink>
          ) : null}
        </div>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}

/** The same group in the phone sheet, as an accordion section. */
function MobileGroup({ value, title, links, onNavigate }: { value: string; title: string; links: MenuLink[]; onNavigate: () => void }) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger className="py-4 text-[15px] font-semibold hover:no-underline">{title}</AccordionTrigger>
      <AccordionContent>
        <ul className="flex flex-col gap-1">
          {links.map((link) => (
            <li key={link.href}>
              <a href={link.href} onClick={onNavigate} className="flex items-start gap-3 rounded-xl p-2.5 hover:bg-muted">
                {link.icon}
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{link.title}</span>
                  {link.description ? <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{link.description}</span> : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </AccordionContent>
    </AccordionItem>
  );
}
