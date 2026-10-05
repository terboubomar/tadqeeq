/**
 * Tadqeeq's product names: one short Arabic name per product, its English twin, and a plain descriptor
 * that says what it does. Use these everywhere a product is named (app menu, page titles, homepage, plans,
 * guides, AI and SEO files) so a product is always called the same thing.
 *
 * In running Arabic text, quote the name: «استرداد».
 */

export type ProductKey = "mutabiq" | "kashif" | "radar" | "istirdad" | "aaid" | "raqeeb" | "ai";

export interface Product {
  key: ProductKey;
  name: string;
  nameEn: string;
  /** What it is, in plain words; shown under or after the name. */
  descriptor: string;
  descriptorEn: string;
  /** App screen. */
  path: string;
}

export const PRODUCTS: Record<ProductKey, Product> = {
  mutabiq: { key: "mutabiq", name: "مُطابِق", nameEn: "Mutabiq", descriptor: "مطابقة الفاتورة", descriptorEn: "Invoice check", path: "/invoice-check" },
  kashif: { key: "kashif", name: "كاشِف", nameEn: "Kashif", descriptor: "خريطة الرسوم", descriptorEn: "Fee map", path: "/charges" },
  radar: { key: "radar", name: "رادار", nameEn: "Radar", descriptor: "مركز الاستثناءات", descriptorEn: "Exceptions center", path: "/exceptions" },
  istirdad: { key: "istirdad", name: "استرداد", nameEn: "Istirdad", descriptor: "مركز التعويضات", descriptorEn: "Compensation center", path: "/compensation" },
  aaid: { key: "aaid", name: "عائد", nameEn: "Aaid", descriptor: "عائد العروض والإعلانات", descriptorEn: "Promotion & ad ROI", path: "/promotions" },
  raqeeb: { key: "raqeeb", name: "رقيب", nameEn: "Raqeeb", descriptor: "المراقب الذكي", descriptorEn: "Smart watch", path: "/dashboard" },
  ai: { key: "ai", name: "Tadqeeq AI", nameEn: "Tadqeeq AI", descriptor: "المساعد الذكي", descriptorEn: "AI assistant", path: "/ai" },
};

/** "مُطابِق · مطابقة الفاتورة": for titles where the name alone would not explain itself. */
export const productTitle = (key: ProductKey) => `${PRODUCTS[key].name} · ${PRODUCTS[key].descriptor}`;

/** Browser tab title for an app screen. */
export const productPageTitle = (key: ProductKey) => `${productTitle(key)} · تدقيق`;

/** The name as quoted in running Arabic text: «استرداد». */
export const productRef = (key: ProductKey) => `«${PRODUCTS[key].name}»`;
