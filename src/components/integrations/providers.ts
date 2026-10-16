import type { AccountingProvider } from "@/lib/integrations/sendable";

/** How each accounting system is named and where its API key is found. */
export const ACCOUNTING_PROVIDERS: Record<
  AccountingProvider,
  {
    title: string;
    name: string;
    keyHelp: string;
    needsSite: boolean;
    signIn: boolean;
    hintLabel: string;
    /** Placeholder of the site field. */
    sitePlaceholder?: string;
    /** Odoo also needs the database (optional on Odoo Online) and the login the key belongs to. */
    needsLogin?: boolean;
  }
> = {
  qoyod: { title: "قيود Qoyod", name: "قيود", keyHelp: "من قيود: الإعدادات ‹ الإعدادات العامة ‹ مفتاح API.", needsSite: false, signIn: false, hintLabel: "المفتاح ينتهي بـ" },
  daftra: {
    title: "دفترة Daftra",
    name: "دفترة",
    keyHelp: "من دفترة: الإعدادات ‹ API ‹ مفتاح API، وعنوان موقعك من شريط المتصفح.",
    needsSite: true,
    signIn: false,
    hintLabel: "المفتاح ينتهي بـ",
    sitePlaceholder: "mystore.daftra.com",
  },
  zoho: { title: "Zoho Books", name: "Zoho Books", keyHelp: "سجّل الدخول إلى Zoho ووافق على الربط.", needsSite: false, signIn: true, hintLabel: "المؤسسة رقم …" },
  odoo: {
    title: "Odoo",
    name: "Odoo",
    keyHelp: "من Odoo: التفضيلات ‹ أمان الحساب ‹ مفتاح API جديد. قاعدة البيانات اختيارية في Odoo Online.",
    needsSite: true,
    signIn: false,
    hintLabel: "المفتاح ينتهي بـ",
    sitePlaceholder: "mycompany.odoo.com",
    needsLogin: true,
  },
};

export const ACCOUNTING_PROVIDER_KEYS = Object.keys(ACCOUNTING_PROVIDERS) as AccountingProvider[];
