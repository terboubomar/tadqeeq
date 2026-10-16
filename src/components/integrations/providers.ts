import type { AccountingProvider } from "@/lib/integrations/sendable";

/** How each accounting system is named and where its API key is found. */
export const ACCOUNTING_PROVIDERS: Record<
  AccountingProvider,
  { title: string; name: string; keyHelp: string; needsSite: boolean; signIn: boolean; hintLabel: string }
> = {
  qoyod: { title: "قيود Qoyod", name: "قيود", keyHelp: "من قيود: الإعدادات ‹ الإعدادات العامة ‹ مفتاح API.", needsSite: false, signIn: false, hintLabel: "المفتاح ينتهي بـ" },
  daftra: {
    title: "دفترة Daftra",
    name: "دفترة",
    keyHelp: "من دفترة: الإعدادات ‹ API ‹ مفتاح API، وعنوان موقعك من شريط المتصفح.",
    needsSite: true,
    signIn: false,
    hintLabel: "المفتاح ينتهي بـ",
  },
  zoho: { title: "Zoho Books", name: "Zoho Books", keyHelp: "سجّل الدخول إلى Zoho ووافق على الربط.", needsSite: false, signIn: true, hintLabel: "المؤسسة رقم …" },
};

export const ACCOUNTING_PROVIDER_KEYS = Object.keys(ACCOUNTING_PROVIDERS) as AccountingProvider[];
