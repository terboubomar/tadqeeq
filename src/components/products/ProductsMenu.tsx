import { ArrowLeft, BookOpen, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { PlatformIcon } from "@/components/brand/PlatformLogo";
import { ProductIcon } from "@/components/products/ProductIcon";
import { PLATFORM_KEYS } from "@/lib/platforms";
import { PRODUCT_PAGES } from "@/lib/product-pages";
import { PRODUCTS } from "@/lib/products";
import { cn } from "@/lib/utils";

/**
 * «المنتجات» in the site header: a button that opens a panel with every product page. Opens on hover (with a short
 * close delay so the pointer can cross the gap) and on click/keyboard; closes on Escape, outside click or focus leaving.
 * The panel is positioned against the nearest `relative` ancestor, which should be the header.
 */
export function ProductsMenu({ triggerClassName }: { triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  /** Set when hover opened the panel, so the click that usually follows keeps it open instead of toggling it shut. */
  const hoverOpened = useRef(false);
  const panelId = useId();

  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const openNow = () => {
    cancelClose();
    setOpen(true);
  };
  const closeSoon = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      hoverOpened.current = false;
      setOpen(false);
    }, 160);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  useEffect(() => cancelClose, []);

  return (
    <div
      ref={rootRef}
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        if (!open) hoverOpened.current = true;
        openNow();
      }}
      onPointerLeave={(event) => event.pointerType === "mouse" && closeSoon()}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (hoverOpened.current) {
            hoverOpened.current = false;
            setOpen(true);
            return;
          }
          setOpen((value) => !value);
        }}
        className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", triggerClassName, open && "bg-card text-foreground shadow-sm")}
      >
        المنتجات
        <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full z-50 px-0 pt-3"
      >
        <div className="mx-auto grid max-w-[60rem] overflow-hidden rounded-[28px] border border-border bg-card text-start shadow-[0_32px_64px_-28px_rgb(19_35_43/0.45)] lg:grid-cols-[minmax(0,1fr)_17rem]">
          <ul className="grid gap-1 p-3 sm:grid-cols-2">
            {PRODUCT_PAGES.map((page) => {
              const product = PRODUCTS[page.product];
              return (
                <li key={page.slug}>
                  <a
                    href={page.path}
                    onClick={() => setOpen(false)}
                    className="group flex h-full items-start gap-3.5 rounded-2xl p-3.5 transition-colors hover:bg-background focus-visible:bg-background"
                  >
                    <ProductIcon
                      product={page.product}
                      className="size-11 rounded-2xl transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-display text-[17px] font-extrabold text-foreground">{product.name}</span>
                        <span className="text-xs font-semibold text-primary-text">{product.descriptor}</span>
                      </span>
                      <span className="mt-1 block text-[13px] leading-6 text-muted-foreground">{page.summary}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-between gap-6 bg-ink p-4 text-ink-foreground lg:flex-col lg:p-6">
            <div className="hidden lg:block">
              <p className="text-xs font-semibold text-ink-muted">منصة واحدة لكل فواتير التوصيل</p>
              <p className="mt-2 font-display text-lg font-extrabold leading-8">راجع فواتير هنقرستيشن وجاهز وكيتا قبل أن تدفعها.</p>
              <span aria-hidden="true" className="mt-4 flex">
                {PLATFORM_KEYS.map((key, index) => (
                  <PlatformIcon key={key} platform={key} className={cn("size-8 rounded-full ring-2 ring-ink", index > 0 && "-ms-2")} />
                ))}
              </span>
            </div>
            <div className="flex flex-1 gap-2 text-sm lg:flex-none lg:flex-col">
              <a
                href="/products"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 flex-1 items-center justify-between gap-2 rounded-full bg-primary lg:flex-none px-5 font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
              >
                كل المنتجات
                <ArrowLeft className="size-4" />
              </a>
              <a
                href="/guides"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 items-center gap-2 rounded-full px-5 font-semibold text-ink-foreground/85 ring-1 ring-white/15 transition-colors hover:bg-white/10"
              >
                <BookOpen className="size-4" />
                أدلة المراجعة
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The same product links for the phone menu: a collapsible group. */
export function ProductsMenuList({ onNavigate }: { onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold hover:bg-muted"
      >
        المنتجات
        <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <ul id={listId} hidden={!open} className="grid gap-1 px-2 pb-2 sm:grid-cols-2">
        {PRODUCT_PAGES.map((page) => {
          const product = PRODUCTS[page.product];
          return (
            <li key={page.slug}>
              <a href={page.path} onClick={onNavigate} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-muted">
                <ProductIcon product={page.product} className="size-9" />
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{product.name}</span>
                  <span className="block text-xs text-muted-foreground">{product.descriptor}</span>
                </span>
              </a>
            </li>
          );
        })}
        <li className="sm:col-span-2">
          <a href="/products" onClick={onNavigate} className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-semibold text-primary-text hover:bg-muted">
            كل المنتجات
            <ArrowLeft className="size-4" />
          </a>
        </li>
      </ul>
    </div>
  );
}
