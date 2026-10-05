import { LEGAL_COMPANY } from "./legal";

export type ContactTopic = "sales" | "support" | "billing" | "other";

export const CONTACT_TOPICS: { key: ContactTopic; label: string }[] = [
  { key: "sales", label: "الباقات وعرض توضيحي" },
  { key: "support", label: "دعم فني" },
  { key: "billing", label: "الفواتير والاشتراك" },
  { key: "other", label: "أخرى" },
];

export const CONTACT_HOURS = "الأحد إلى الخميس، من 10 صباحاً إلى 5 مساءً بتوقيت السعودية.";

export interface ContactMessage {
  topic: ContactTopic;
  name: string;
  company: string;
  phone: string;
  message: string;
}

/** mailto: link with the subject and body filled in from the contact form. */
export function contactMailto(input: ContactMessage, email: string = LEGAL_COMPANY.email): string {
  const topic = CONTACT_TOPICS.find((t) => t.key === input.topic)?.label ?? "تواصل";
  const subject = `${topic}${input.company.trim() ? ` · ${input.company.trim()}` : ""}`;
  const body = [
    input.message.trim(),
    "",
    `الاسم: ${input.name.trim()}`,
    ...(input.company.trim() ? [`المنشأة: ${input.company.trim()}`] : []),
    ...(input.phone.trim() ? [`الجوال: ${input.phone.trim()}`] : []),
  ].join("\n");
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
