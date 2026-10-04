/**
 * Public product facts shared by the homepage, its structured data and the machine-readable files
 * (llms.txt, llms-full.txt, pricing.md), so people and AI assistants read the same answers.
 * Each FAQ answer stands on its own: it is quoted without the page around it.
 */

/** Last meaningful change to the public content (YYYY-MM-DD). */
export const CONTENT_UPDATED = "2026-10-04";

/** "4 أكتوبر 2026" for visible last-updated lines. */
export function formatArabicDate(date: string): string {
  const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${months[(month ?? 1) - 1]} ${year}`;
}

export const FAQS: Array<[question: string, answer: string]> = [
  [
    "ما هو تدقيق؟",
    "تدقيق منصة سعودية لمراجعة فواتير تطبيقات التوصيل. ترفع ملف الطلبات وفاتورة هنقرستيشن أو كيتا أو جاهز، فيعيد تدقيق احتساب العمولة ورسوم الدفع والحملات والتعويضات من بياناتك وعقدك، ويعرض كل فرق باسم الفرع والمبلغ مع مصدره، ويجهّز مطالبة التعويض بأدلتها.",
  ],
  [
    "هل يمكنني تجربة تدقيق قبل الاشتراك؟",
    "نعم. أنشئ حساباً مجانياً وارفع ملفات منصة واحدة لفترة واحدة، وشاهد اللوحة التنفيذية ومطابقة الفاتورة وخريطة الرسوم وتقارير الفروع كاملة. للاشتراك وفتح بقية الأقسام تواصل معنا من داخل الحساب.",
  ],
  [
    // Keep in step with the plans in the ops console (migration 0038 set these prices).
    "كم سعر تدقيق؟",
    "تدفع حسب عدد طلباتك الشهرية من كل تطبيقات التوصيل: البداية 299 ر.س شهرياً حتى 15,000 طلب، والنمو 499 ر.س حتى 45,000 طلب، والشاملة 799 ر.س بطلبات بلا حدود ومعها Tadqeeq AI ومركز التعويضات. الفروع والمنصات والمستخدمون بلا حدود في كل الباقات، والاشتراك السنوي يوفر شهرين. تبدأ بتجربة مجانية، والأسعار لا تشمل ضريبة القيمة المضافة.",
  ],
  [
    "ما المنصات التي يدعمها تدقيق؟",
    "يدعم تدقيق هنقرستيشن وكيتا وجاهز. يقرأ ملف الطلبات من بوابة التاجر بصيغة Excel أو CSV، وفاتورة المنصة بصيغة PDF، ويتعرف تلقائياً على المنصة والفترة والفروع. الحد الأقصى لكل ملف 25 ميجابايت، ويكفي لشهر كامل لمجموعة مطاعم كبيرة.",
  ],
  ["ما الملفات التي أحتاجها؟", "ملف الطلبات من بوابة التاجر وفاتورة المنصة لنفس الفترة. نقبل Excel وCSV وPDF."],
  [
    "كيف أعرف أن عمولة المنصة صحيحة؟",
    "تدقيق يعيد احتساب العمولة لكل طلب من قيمة الطلب ونسبة عقدك لذلك الفرع والقناة، ثم يقارن المجموع بما خصمته المنصة في الفاتورة. أي فرق يظهر باسم الفرع والمبلغ والنسبة المحتسبة مقابل النسبة المتفق عليها، ويتحول إلى استثناء له مسؤول وحالة حتى يُغلق.",
  ],
  [
    "كيف أعترض على تعويض خصمته المنصة؟",
    "الكاشير يصوّر الطلب والفاتورة قبل تسليمه ويرسلها في قروب الفرع على Telegram، وبوت تدقيق يربطها برقم الطلب. عند خصم تعويض يبحث موظفك برقم الطلب في مركز التعويضات، فيجد الدليل ويحصل على طلب مراجعة جاهز بالعربي والإنجليزي يرسله للمنصة.",
  ],
  ["هل يحتاج موظف الفرع تطبيقاً لإرسال الأدلة؟", "لا. يرسل الصورة أو الفيديو في قروب الفرع على Telegram، والبوت يربطه برقم الطلب."],
  [
    "لماذا يختلف ما خصمته كيتا عن فاتورتها الضريبية؟",
    "فاتورة كيتا الضريبية تشمل عمولة الطلبات ورسوم الإعلانات، لكن كيتا تخصم من التحويل مبالغ أخرى خارج الفاتورة، مثل خصومات الأصناف التي تموّلها وأقساط أجهزة POS. تدقيق يعرض الفاتورة الضريبية والمصاريف الأخرى كلاً على حدة، فيطابق الرقم الأول فاتورتك تماماً.",
  ],
  [
    "ما هو المراقب الذكي في تدقيق؟",
    "بعد كل رفع يقارن المراقب الذكي العمولة والرسوم والتعويضات لكل فرع بأشهره السابقة وبالفروع المشابهة، وينبّهك لما هو غير معتاد مرتباً حسب أثره بالريال، مثل ارتفاع عمولة طلبات الاستلام في فرع واحد. التنبيه لا يغيّر الأرقام؛ يوجّهك لما يستحق المراجعة أولاً.",
  ],
  [
    "ماذا لو غيّرت المنصة صيغة ملفاتها؟",
    "تدقيق يتعرف على الأعمدة التي تغيّر اسمها ويطلب منك تأكيداً بسيطاً، وينبهك لأي عمود مالي جديد أو مختفٍ بدلاً من احتساب نتيجة غير موثوقة.",
  ],
  [
    "هل أستطيع استخدام تدقيق من ChatGPT أو Claude؟",
    "نعم، في باقة الشاملة. تربط حسابك بـ Claude أو ChatGPT، وتكتب مثلاً «دقق فاتورة هنقرستيشن لشهر سبتمبر ونسبة رسوم البنك 1.8%»، فيعطيك رابط رفع آمن جاهز بالمنصة والنسبة. بعد الرفع يشرح لك النتيجة في المحادثة: الفروقات وما تستطيع المطالبة به وأعلى الفروع تكلفة. الأرقام دائماً من المحرك المحاسبي في تدقيق.",
  ],
  ["هل يغيّر الذكاء الاصطناعي أي رقم؟", "لا. الأرقام من المحرك المحاسبي، والذكاء الاصطناعي يشرح ويلخص النتائج فقط."],
  ["هل بيانات شركتي منفصلة؟", "نعم. لكل شركة مساحة خاصة، مع صلاحيات تحدد ما يراه ويعدله كل موظف."],
];

/** What the product does, one line each (structured data featureList and the AI files). */
export const FEATURES: Array<{ name: string; nameEn: string; description: string }> = [
  {
    name: "مطابقة الفاتورة",
    nameEn: "Invoice check",
    description:
      "Upload the platform invoice (PDF) and the merchant order file (Excel or CSV); every line is recalculated from the orders and the contract by a versioned engine, so the same files always give the same result.",
  },
  {
    name: "خريطة الرسوم",
    nameEn: "Charges map",
    description:
      "Commission, payment fees, free-delivery campaigns, VAT on fees, offers, compensations and unclassified lines, per platform and branch. For Keeta, the tax invoice and the deductions outside it are shown separately.",
  },
  {
    name: "مركز الاستثناءات",
    nameEn: "Exceptions center",
    description: "Each difference gets a severity, the source invoice line, the formula, an owner and a status until it is closed.",
  },
  {
    name: "مركز التعويضات",
    nameEn: "Compensation center",
    description:
      "Branch staff send order videos or receipt photos in the branch Telegram group; the bot links them to the order number (read from the caption or the receipt photo); staff search by order number and get a review request in Arabic and English. Photos and videos stay in Telegram.",
  },
  {
    name: "عائد الإعلانات الحقيقي",
    nameEn: "Real ad return",
    description: "Profit per campaign after commission, discounts and ad spend, not the platform's reported return; losing campaigns and budget moves.",
  },
  {
    name: "المراقب الذكي",
    nameEn: "Smart Watch",
    description: "Compares each branch with its own history and similar branches after every upload, and ranks unusual fees by their impact in SAR.",
  },
  {
    name: "قراءة ذكية للملفات",
    nameEn: "Smart file reading",
    description:
      "Matches renamed columns after a one-time confirmation and warns about new or vanished money columns instead of computing an unreliable result. Large monthly exports (up to 25 MB per file) are supported.",
  },
  {
    name: "تدقيق من داخل Claude وChatGPT",
    nameEn: "Tadqeeq in Claude and ChatGPT (MCP)",
    description:
      "On the الشاملة plan, connect Tadqeeq to Claude or ChatGPT: ask for an audit in the chat, upload the files through a secure pre-filled link, then ask about the result (differences to claim, costliest branches, month comparisons). Numbers come from the accounting engine.",
  },
  {
    name: "Tadqeeq AI",
    nameEn: "Tadqeeq AI",
    description: "Answers questions about the numbers in plain Arabic; numbers come from the accounting engine and the AI never changes them.",
  },
];

/** The short explainer film on the homepage. */
export const EXPLAINER_VIDEO = {
  src: "/video/tadqeeq-explainer.mp4",
  poster: "/video/tadqeeq-explainer-poster.jpg",
  mobileSrc: "/video/tadqeeq-explainer-mobile.mp4",
  mobilePoster: "/video/tadqeeq-explainer-mobile-poster.jpg",
  /** 12 s silent loop (≈35 KB) that plays inside the widget. */
  preview: "/video/tadqeeq-explainer-preview.mp4",
  previewPoster: "/video/tadqeeq-explainer-preview.jpg",
  durationIso: "PT1M55S",
  uploadDate: "2026-10-04",
};
