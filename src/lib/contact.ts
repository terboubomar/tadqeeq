import { normalizeDigits, normalizeSaudiMobile } from "./onboarding";

export type ContactTopic = "sales" | "support" | "billing" | "other";

export const CONTACT_TOPICS: { key: ContactTopic; label: string }[] = [
  { key: "sales", label: "الباقات وعرض توضيحي" },
  { key: "support", label: "دعم فني" },
  { key: "billing", label: "الفواتير والاشتراك" },
  { key: "other", label: "أخرى" },
];

export const CONTACT_HOURS = "الأحد إلى الخميس، من 10 صباحاً إلى 5 مساءً بتوقيت السعودية.";

export const contactTopicLabel = (topic: string) => CONTACT_TOPICS.find((t) => t.key === topic)?.label ?? topic;

/** Repeated sends allowed per hour, from one network address and from one email. */
export const CONTACT_LIMIT_PER_IP_HOUR = 5;
export const CONTACT_LIMIT_PER_EMAIL_HOUR = 3;

export interface ContactInput {
  topic: string;
  name: string;
  company: string;
  email: string;
  mobile: string;
  message: string;
}

export interface ContactMessage {
  topic: ContactTopic;
  name: string;
  company: string | null;
  email: string;
  mobile: string;
  message: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Saudi mobiles become +9665XXXXXXXX; other countries are accepted as +<8–15 digits>. */
export function normalizeContactMobile(value: string): string | null {
  const saudi = normalizeSaudiMobile(value);
  if (saudi) return saudi;
  const digits = normalizeDigits(value).replace(/[\s()-]/g, "");
  const international = digits.startsWith("00") ? `+${digits.slice(2)}` : digits;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
}

/** Checks and cleans the contact form; the same rules run in the browser and on the server. */
export function validateContact(input: ContactInput): { ok: true; value: ContactMessage } | { ok: false; error: string } {
  const topic = CONTACT_TOPICS.some((t) => t.key === input.topic) ? (input.topic as ContactTopic) : null;
  const name = input.name.trim();
  const company = input.company.trim();
  const email = input.email.trim().toLowerCase();
  const message = input.message.trim();
  if (!topic) return { ok: false, error: "اختر موضوع الرسالة." };
  if (!name || name.length > 120) return { ok: false, error: "اكتب اسمك." };
  if (company.length > 160) return { ok: false, error: "اسم المنشأة طويل جداً." };
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, error: "اكتب بريداً إلكترونياً صحيحاً." };
  const mobile = normalizeContactMobile(input.mobile);
  if (!mobile) return { ok: false, error: "اكتب رقم جوال صحيحاً (05XXXXXXXX)." };
  if (!message) return { ok: false, error: "اكتب رسالتك." };
  if (message.length > 2000) return { ok: false, error: "الرسالة أطول من 2000 حرف." };
  return { ok: true, value: { topic, name, company: company || null, email, mobile, message } };
}
