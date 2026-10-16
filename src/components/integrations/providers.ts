import type { AccountingProvider } from "@/lib/integrations/sendable";

/** How each accounting system is named and where its API key is found. */
export const ACCOUNTING_PROVIDERS: Record<AccountingProvider, { title: string; name: string; keyHelp: string; needsSite: boolean }> = {
  qoyod: { title: "قيود Qoyod", name: "قيود", keyHelp: "من قيود: الإعدادات ‹ الإعدادات العامة ‹ مفتاح API.", needsSite: false },
  daftra: { title: "دفترة Daftra", name: "دفترة", keyHelp: "من دفترة: الإعدادات ‹ API ‹ مفتاح API، وعنوان موقعك من شريط المتصفح.", needsSite: true },
};

export const ACCOUNTING_PROVIDER_KEYS = Object.keys(ACCOUNTING_PROVIDERS) as AccountingProvider[];
