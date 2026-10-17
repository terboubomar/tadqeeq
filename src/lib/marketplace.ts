import type { IntegrationLogo } from "@/components/integrations/IntegrationLogo";

/**
 * The public integrations marketplace (/marketplace and one page per integration). Content only: what each
 * integration does and how it is connected, as it works today inside Tadqeeq.
 */
export type MarketplaceCategory = "accounting" | "messaging" | "ai";

export interface MarketplaceItem {
  slug: string;
  path: string;
  name: string;
  /** The word shown on the tile when there is no logo. */
  mark: string;
  logos?: IntegrationLogo[];
  /** The product's own logo file (public/integrations). */
  image?: { src: string; className: string };
  /** Tile colour, close to the product's own (white for logos on white). */
  color: string;
  light?: boolean;
  category: MarketplaceCategory;
  /** One line on the card. */
  line: string;
  /** The detail page's lead and meta description. */
  summary: string;
  metaTitle: string;
  features: string[];
  steps: string[];
  facts: Array<[label: string, value: string]>;
  /** Step-by-step guide for this integration, where there is one. */
  guide?: string;
}

export const MARKETPLACE_CATEGORY_LABEL: Record<MarketplaceCategory, string> = {
  accounting: "المحاسبة",
  messaging: "التواصل",
  ai: "الذكاء الاصطناعي",
};

export const MARKETPLACE_UPDATED = "2026-10-17";

export const MARKETPLACE_INDEX = {
  path: "/marketplace",
  title: "متجر التطبيقات",
  metaTitle: "متجر تطبيقات تدقيق: الأنظمة المحاسبية والتواصل والذكاء الاصطناعي | تدقيق",
  description: "اربط تدقيق بقيود ودفترة وZoho Books وOdoo وQuickBooks وتيليجرام والبريد وClaude وChatGPT، وأرسل قيود تطبيقات التوصيل لكل فرع مباشرة.",
};

const ACCOUNTING_FEATURES = (extra: string) => [
  "يرسل قيد كل فرع من «القيود المحاسبية» بضغطة واحدة.",
  "يطابق الحسابات بأرقامها في دليل حساباتك، ويوقف الإرسال إن نقص رقم.",
  "لا يرسل القيد نفسه مرتين في الفترة ذاتها.",
  extra,
];

const item = (entry: Omit<MarketplaceItem, "path">): MarketplaceItem => ({ ...entry, path: `/marketplace/${entry.slug}` });

export const MARKETPLACE: MarketplaceItem[] = [
  item({
    slug: "qoyod",
    name: "قيود Qoyod",
    mark: "قيود",
    image: { src: "/integrations/qoyod.webp", className: "w-[62%]" },
    color: "#162660",
    category: "accounting",
    line: "إرسال القيود مباشرة",
    summary: "اربط تدقيق بقيود بمفتاح API، وأرسل قيود تطبيقات التوصيل لكل فرع إلى دفاترك مباشرة.",
    metaTitle: "ربط تدقيق مع قيود Qoyod وإرسال القيود | تدقيق",
    features: ACCOUNTING_FEATURES("يُرحَّل القيد في قيود ومرجع تدقيق في آخر وصفه."),
    steps: ["انسخ مفتاح API من الإعدادات العامة في قيود.", "الصقه في بطاقة قيود في «التكاملات».", "أرسل القيود من «القيود المحاسبية»."],
    facts: [
      ["طريقة الربط", "مفتاح API"],
      ["مركز التكلفة", "لا يُرسل"],
      ["مرجع تدقيق", "آخر وصف القيد"],
    ],
    guide: "/guides/accounting-integrations#qoyod",
  }),
  item({
    slug: "daftra",
    name: "دفترة Daftra",
    mark: "دفترة",
    image: { src: "/integrations/daftra.webp", className: "w-[62%]" },
    color: "#FFFFFF",
    light: true,
    category: "accounting",
    line: "إرسال القيود مباشرة",
    summary: "اربط تدقيق بدفترة بعنوان موقعك ومفتاح API، وأرسل قيود تطبيقات التوصيل لكل فرع مباشرة.",
    metaTitle: "ربط تدقيق مع دفترة Daftra وإرسال القيود | تدقيق",
    features: ACCOUNTING_FEATURES("يُرحَّل القيد في دفترة ومرجع تدقيق في آخر وصفه."),
    steps: ["انسخ مفتاح API من إعدادات دفترة.", "اكتب عنوان موقعك والمفتاح في بطاقة دفترة.", "أرسل القيود من «القيود المحاسبية»."],
    facts: [
      ["طريقة الربط", "عنوان الموقع ومفتاح API"],
      ["مركز التكلفة", "لا يُرسل"],
      ["مرجع تدقيق", "آخر وصف القيد"],
    ],
    guide: "/guides/accounting-integrations#daftra",
  }),
  item({
    slug: "zoho-books",
    name: "Zoho Books",
    mark: "Zoho Books",
    image: { src: "/integrations/zoho-books.webp", className: "w-[66%]" },
    color: "#FFFFFF",
    light: true,
    category: "accounting",
    line: "إرسال القيود مباشرة",
    summary: "اربط تدقيق بحساب Zoho Books بتسجيل الدخول، وأرسل قيود تطبيقات التوصيل لكل فرع دون نسخ أي مفتاح.",
    metaTitle: "ربط تدقيق مع Zoho Books وإرسال القيود | تدقيق",
    features: ACCOUNTING_FEATURES("مرجع تدقيق في حقل رقم المرجع."),
    steps: ["اضغط «اربط عبر Zoho» في بطاقة Zoho Books.", "سجّل الدخول ووافق على الصلاحية.", "أرسل القيود من «القيود المحاسبية»."],
    facts: [
      ["طريقة الربط", "تسجيل الدخول"],
      ["مركز التكلفة", "لا يُرسل"],
      ["مرجع تدقيق", "رقم المرجع"],
    ],
    guide: "/guides/accounting-integrations#zoho",
  }),
  item({
    slug: "odoo",
    name: "Odoo",
    mark: "odoo",
    logos: ["odoo"],
    color: "#714B67",
    category: "accounting",
    line: "إرسال القيود مع الحسابات التحليلية",
    summary: "اربط تدقيق بأودو من الإصدار 16 فأحدث، وأرسل قيد كل فرع مع حسابه التحليلي.",
    metaTitle: "ربط تدقيق مع Odoo وإرسال القيود والحسابات التحليلية | تدقيق",
    features: ACCOUNTING_FEATURES("مركز تكلفة الفرع يُرسل حساباً تحليلياً."),
    steps: ["أنشئ مفتاح API من تفضيلات حسابك في أودو.", "اكتب العنوان واسم الدخول والمفتاح في بطاقة أودو.", "أرسل القيود من «القيود المحاسبية»."],
    facts: [
      ["طريقة الربط", "مفتاح API واسم الدخول"],
      ["مركز التكلفة", "الحساب التحليلي"],
      ["مرجع تدقيق", "حقل المرجع"],
    ],
    guide: "/guides/accounting-integrations#odoo",
  }),
  item({
    slug: "quickbooks",
    name: "QuickBooks Online",
    mark: "QuickBooks",
    logos: ["quickbooks"],
    color: "#2CA01C",
    category: "accounting",
    line: "إرسال القيود مع الفئة لكل فرع",
    summary: "اربط تدقيق بحساب QuickBooks Online بتسجيل الدخول، وأرسل قيد كل فرع مع فئته.",
    metaTitle: "ربط تدقيق مع QuickBooks Online وإرسال القيود | تدقيق",
    features: ACCOUNTING_FEATURES("مركز تكلفة الفرع يُرسل فئة، والمنصة عميلاً على سطور الذمم."),
    steps: ["اضغط «اربط عبر Intuit» في بطاقة QuickBooks.", "سجّل الدخول واختر الشركة.", "أرسل القيود من «القيود المحاسبية»."],
    facts: [
      ["طريقة الربط", "تسجيل الدخول"],
      ["مركز التكلفة", "الفئة"],
      ["مرجع تدقيق", "رقم القيد"],
    ],
    guide: "/guides/accounting-integrations#quickbooks",
  }),
  item({
    slug: "telegram",
    name: "Telegram",
    mark: "Telegram",
    image: { src: "/integrations/telegram.webp", className: "w-[30%]" },
    color: "#FFFFFF",
    light: true,
    category: "messaging",
    line: "أدلة الطلبات من قروبات الفروع",
    summary: "بوت تدقيق في قروب كل فرع يستقبل صور الطلبات ومقاطعها، ويضعها أدلة في مركز التعويضات.",
    metaTitle: "ربط تيليجرام بتدقيق لجمع أدلة التعويضات من الفروع | تدقيق",
    features: [
      "موظف الفرع يرسل صورة الطلب أو مقطعه في قروب الفرع.",
      "يصل الدليل إلى «استرداد» مع طلبه وفرعه.",
      "كل فرع في قروبه الخاص.",
    ],
    steps: ["أضف بوت تدقيق إلى قروب الفرع مشرفاً.", "أرسل رمز الربط في القروب.", "يبدأ الفريق بإرسال الأدلة."],
    facts: [
      ["طريقة الربط", "رمز لمرة واحدة"],
      ["يعمل مع", "مركز التعويضات"],
    ],
  }),
  item({
    slug: "email-reports",
    name: "البريد الإلكتروني",
    mark: "البريد",
    image: { src: "/integrations/gmail.webp", className: "w-[34%]" },
    color: "#FFFFFF",
    light: true,
    category: "messaging",
    line: "تقارير مجدولة إلى بريدك",
    summary: "تقرير مجدول يصل إلى بريدك وبريد فريقك، فيه المبيعات والطلبات ونسبة تكلفة المنصات والتغيّر عن الشهر السابق.",
    metaTitle: "تقارير تدقيق المجدولة بالبريد الإلكتروني | تدقيق",
    features: ["شهرياً أو أسبوعياً أو بعد رفع فترة جديدة.", "حتى 10 مستلمين لكل جدول.", "ملخص المبيعات والطلبات ونسبة تكلفة المنصات."],
    steps: ["افتح «جدولة التقارير».", "اختر التوقيت والمستلمين.", "يصل التقرير في موعده."],
    facts: [
      ["طريقة الربط", "بدون ربط"],
      ["المستلمون", "حتى 10"],
    ],
  }),
  item({
    slug: "claude-chatgpt",
    name: "Claude و ChatGPT",
    mark: "AI",
    logos: ["claude", "openai"],
    color: "#1E2A28",
    category: "ai",
    line: "اسأل عن تدقيقك من مساعدك",
    summary: "أضف تدقيق موصلاً في Claude أو ChatGPT، واسأل عن نتائج تدقيقك بصلاحيات حسابك.",
    metaTitle: "ربط Claude وChatGPT بتدقيق عبر موصل مخصص | تدقيق",
    features: ["اسأل عن الفروقات والتعويضات وتكلفة المنصات بلغتك.", "يقرأ المساعد نتائج التدقيق بصلاحياتك فقط.", "رابط واحد يعمل في المساعدين."],
    steps: ["أضف موصلاً مخصصاً في مساعدك.", "الصق رابط تدقيق tadqeeq.app/mcp فيه.", "سجّل الدخول بحساب تدقيق."],
    facts: [
      ["طريقة الربط", "موصل مخصص"],
      ["الصلاحيات", "صلاحيات حسابك"],
    ],
  }),
];

export function marketplaceItem(slug: string): MarketplaceItem {
  const found = MARKETPLACE.find((entry) => entry.slug === slug);
  if (!found) throw new Error(`Unknown marketplace item: ${slug}`);
  return found;
}
