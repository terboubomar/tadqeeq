/**
 * Public product facts shared by the homepage, its structured data and the machine-readable files
 * (llms.txt, llms-full.txt, pricing.md), so people and AI assistants read the same answers.
 * Each FAQ answer stands on its own: it is quoted without the page around it.
 */

/** Last meaningful change to the public content (YYYY-MM-DD). */
export const CONTENT_UPDATED = "2026-10-14";

/** "4 أكتوبر 2026" for visible last-updated lines. */
export function formatArabicDate(date: string): string {
  const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${months[(month ?? 1) - 1]} ${year}`;
}

export const FAQS: Array<[question: string, answer: string]> = [
  [
    "ما هو تدقيق؟",
    "تدقيق منصة سعودية لمراجعة فواتير تطبيقات التوصيل. ترفع ملف الطلبات وفاتورة هنقرستيشن أو كيتا أو جاهز، فيعيد تدقيق احتساب العمولة ورسوم الدفع والحملات والتعويضات من ملفاتك، ويعرض كل فرق باسم الفرع والمبلغ مع مصدره، ويجهّز مطالبة التعويض بأدلتها.",
  ],
  [
    "هل يمكنني تجربة تدقيق قبل الاشتراك؟",
    "نعم. أنشئ حساباً مجانياً وارفع ملفات منصة واحدة لفترة واحدة، وشاهد اللوحة التنفيذية ومطابقة الفاتورة وخريطة الرسوم وتقارير الفروع كاملة. للاشتراك وفتح بقية الأقسام تواصل معنا من داخل الحساب.",
  ],
  [
    // Keep in step with the plans in the ops console (migration 0038 set these prices).
    "كم سعر تدقيق؟",
    "تدفع حسب عدد طلباتك الشهرية من كل تطبيقات التوصيل: البداية 299 ر.س شهرياً حتى 15,000 طلب، والنمو 499 ر.س حتى 45,000 طلب، والشاملة 799 ر.س بطلبات بلا حدود ومعها «استرداد» لمركز التعويضات و Tadqeeq AI. الفروع والمنصات والمستخدمون بلا حدود في كل الباقات، والاشتراك السنوي يوفر شهرين. تبدأ بتجربة مجانية، والأسعار لا تشمل ضريبة القيمة المضافة.",
  ],
  [
    "ما منتجات تدقيق؟",
    "مُطابِق لمطابقة الفاتورة مع طلباتك، وكاشِف لخريطة كل رسم تخصمه المنصة، ورادار لمتابعة الفروقات حتى تُغلق، واسترداد للاعتراض على التعويضات بأدلة Telegram، وعائد لربح كل عرض وإعلان بعد العمولة، ورقيب لتنبيهك لما هو غير معتاد في كل فرع، ونَبْض لمتابعة المبيعات وتكلفة كل منصة يوماً بيوم، و Tadqeeq AI للإجابة عن أسئلتك عن أرقامك.",
  ],
  [
    "ما المنصات التي يدعمها تدقيق؟",
    "يدعم تدقيق هنقرستيشن وكيتا وجاهز. يقرأ ملف الطلبات من بوابة التاجر بصيغة Excel أو CSV، وفاتورة المنصة بصيغة PDF، ويتعرف تلقائياً على المنصة والفترة والفروع. الحد الأقصى لكل ملف 25 ميجابايت، ويكفي لشهر كامل لمجموعة مطاعم كبيرة.",
  ],
  ["ما الملفات التي أحتاجها؟", "ملف الطلبات من بوابة التاجر وفاتورة المنصة لنفس الفترة. نقبل Excel وCSV وPDF."],
  [
    "كيف أعرف أن عمولة المنصة صحيحة؟",
    "تدقيق يعيد احتساب العمولة لكل طلب من بياناته في ملف الطلبات لذلك الفرع والقناة، ثم يقارن المجموع بما خصمته المنصة في الفاتورة. أي فرق يظهر باسم الفرع والمبلغ في الفاتورة مقابل المبلغ المحتسب من طلباتك، ويتحول إلى استثناء له مسؤول وحالة حتى يُغلق.",
  ],
  [
    "كيف أعترض على تعويض خصمته المنصة؟",
    "الكاشير يصوّر الطلب والفاتورة قبل تسليمه ويرسلها في قروب الفرع على Telegram، وبوت تدقيق يربطها برقم الطلب. عند خصم تعويض يبحث موظفك برقم الطلب في «استرداد» (مركز التعويضات)، فيجد الدليل ويحصل على طلب مراجعة جاهز بالعربي والإنجليزي يرسله للمنصة.",
  ],
  ["هل يحتاج موظف الفرع تطبيقاً لإرسال الأدلة؟", "لا. يرسل الصورة أو الفيديو في قروب الفرع على Telegram، والبوت يربطه برقم الطلب."],
  [
    "لماذا يختلف ما خصمته كيتا عن فاتورتها الضريبية؟",
    "فاتورة كيتا الضريبية تشمل عمولة الطلبات ورسوم الإعلانات، لكن كيتا تخصم من التحويل مبالغ أخرى خارج الفاتورة، مثل خصومات الأصناف التي تموّلها وأقساط أجهزة POS. تدقيق يعرض الفاتورة الضريبية والمصاريف الأخرى كلاً على حدة، فيطابق الرقم الأول فاتورتك تماماً.",
  ],
  [
    "ما هو «رقيب» (المراقب الذكي) في تدقيق؟",
    "بعد كل رفع يقارن «رقيب» العمولة والرسوم والتعويضات لكل فرع بأشهره السابقة وبالفروع المشابهة، وينبّهك لما هو غير معتاد مرتباً حسب أثره بالريال، مثل ارتفاع عمولة طلبات الاستلام في فرع واحد. التنبيه لا يغيّر الأرقام؛ يوجّهك لما يستحق المراجعة أولاً.",
  ],
  [
    "كيف أتابع تكلفة تطبيقات التوصيل يومياً قبل وصول الفاتورة؟",
    "من «نَبْض» (المتابعة اليومية) في تدقيق: ترفع ملف الطلبات اليومي من بوابة هنقرستيشن أو كيتا أو جاهز، فيعرض مبيعات اليوم ونسبة تكلفة المنصة من المبيعات والتحويل المتوقع لنهاية الشهر لكل فرع. وإذا صُدّر الملف قبل أن تحسب المنصة العمولة والأرباح، ينبّهك لإعادة تصديره بدلاً من عرض نسبة أقل من الحقيقة.",
  ],
  [
    "هل يجهّز تدقيق القيود المحاسبية لنظامي؟",
    "نعم. من نتيجة التدقيق يجهّز تدقيق قيداً لكل فرع ومنصة يشمل المبيعات والعمولة ورسوم الدفع والضريبة والإعلانات والأجهزة والاشتراكات، مع مركز تكلفة لكل فرع. تختار حساباتك مرة واحدة، ثم تصدّر القيود بصيغة Excel أو Odoo أو Zoho Books أو QuickBooks أو قيود أو دفترة.",
  ],
  [
    "ماذا لو غيّرت المنصة صيغة ملفاتها؟",
    "تدقيق يتعرف على الأعمدة التي تغيّر اسمها ويطلب منك تأكيداً بسيطاً، وينبهك لأي عمود مالي جديد أو مختفٍ بدلاً من احتساب نتيجة غير موثوقة.",
  ],
  [
    "هل أستطيع استخدام تدقيق من ChatGPT أو Claude؟",
    "نعم، في باقة الشاملة، أو مع الإضافة (399 ر.س كل 4 أشهر) في البداية والنمو. تربط حسابك بـ Claude أو ChatGPT، وتكتب مثلاً «دقق فاتورة هنقرستيشن لشهر سبتمبر ونسبة رسوم البنك 1.8%»، فيعطيك رابط رفع آمن جاهز بالمنصة والنسبة. بعد الرفع يشرح لك النتيجة في المحادثة: الفروقات وما تستطيع المطالبة به وأعلى الفروع تكلفة. الأرقام دائماً من المحرك المحاسبي في تدقيق.",
  ],
  ["هل يغيّر الذكاء الاصطناعي أي رقم؟", "لا. الأرقام من المحرك المحاسبي، والذكاء الاصطناعي يشرح ويلخص النتائج فقط."],
  ["هل بيانات شركتي منفصلة؟", "نعم. لكل شركة مساحة خاصة، مع صلاحيات تحدد ما يراه ويعدله كل موظف."],
  [
    "هل أستطيع إدارة أكثر من شركة أو علامة تجارية في حساب واحد؟",
    "نعم. لكل شركة أو علامة تجارية مساحة مستقلة ببياناتها وفروعها وفريقها، وتنتقل بينها من أعلى الشاشة دون تسجيل خروج. عدد الشركات المتاح يظهر في جدول مقارنة الباقات.",
  ],
  [
    "هل أستطيع تحديد ما يراه كل موظف؟",
    "نعم. لكل موظف دخول مستقل ودور: المالك أو المدير أو المدقق المالي أو مسؤول التعويضات أو مدير الفرع أو المشاهد. ويمكن حصر مدير الفرع في فروعه فقط. وكل تسجيل دخول بكلمة المرور يحتاج رمزاً من 6 أرقام يصل إلى البريد.",
  ],
];

/** What the product does, one line each (structured data featureList and the AI files). */
export const FEATURES: Array<{ name: string; nameEn: string; description: string }> = [
  {
    name: "مُطابِق · مطابقة الفاتورة",
    nameEn: "Mutabiq · Invoice check",
    description:
      "Upload the platform invoice (PDF) and the merchant order file (Excel or CSV); every line is recalculated from the orders by a versioned engine, so the same files always give the same result.",
  },
  {
    name: "كاشِف · خريطة الرسوم",
    nameEn: "Kashif · Fee map",
    description:
      "Commission, payment fees, free-delivery campaigns, VAT on fees, offers, compensations and unclassified lines, per platform and branch. For Keeta, the tax invoice and the deductions outside it are shown separately; HungerStation CPC ad invoices are split per branch.",
  },
  {
    name: "رادار · مركز الاستثناءات",
    nameEn: "Radar · Exceptions center",
    description: "Each difference gets a severity, the source invoice line, the formula, an owner and a status until it is closed.",
  },
  {
    name: "استرداد · مركز التعويضات",
    nameEn: "Istirdad · Compensation center",
    description:
      "Branch staff send order videos or receipt photos in the branch Telegram group; the bot links them to the order number (read from the caption or the receipt photo); staff search by order number and get a review request in Arabic and English. Photos and videos stay in Telegram.",
  },
  {
    name: "عائد · عائد العروض والإعلانات",
    nameEn: "Aaid · Promotion & ad ROI",
    description: "Profit per campaign after commission, discounts and ad spend, not the platform's reported return; losing campaigns and budget moves.",
  },
  {
    name: "رقيب · المراقب الذكي",
    nameEn: "Raqeeb · Smart watch",
    description: "Compares each branch with its own history and similar branches after every upload, and ranks unusual fees by their impact in SAR.",
  },
  {
    name: "نَبْض · المتابعة اليومية",
    nameEn: "Nabd · Daily tracking",
    description:
      "Upload the daily order file from HungerStation, Keeta or Jahez to follow sales, platform cost as a share of sales, cost per order and the month-end payout forecast per platform and branch. Files exported before the platform settled commissions are flagged instead of showing a cost that is too low.",
  },
  {
    name: "القيود المحاسبية",
    nameEn: "Journal entries",
    description:
      "One journal entry per branch and platform from the audit result (sales, commission, payment fees, VAT, ads, devices, subscriptions) with a cost center per branch, exported for Excel, Odoo, Zoho Books, QuickBooks, Qoyod or Daftra.",
  },
  {
    name: "عدة شركات وأدوار بنطاق الفروع",
    nameEn: "Multiple companies, roles and branch scope",
    description:
      "One account holds several companies or brands, each with its own data, branches and team. Six roles (owner, admin, auditor, compensation officer, branch manager, viewer); branch managers can be limited to their branches. Password sign-ins need a 6-digit code sent by email, or an authenticator app.",
  },
  {
    name: "التقارير وأرشيف الفترات",
    nameEn: "Reports and period archive",
    description:
      "Executive dashboard, branch, daily and line-item reports, saved periods with one-click re-analysis, and branch names matched once and remembered.",
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
      "On the الشاملة plan, or with the add-on on any plan, connect Tadqeeq to Claude or ChatGPT: ask for an audit in the chat, upload the files through a secure pre-filled link, then ask about the result (differences to claim, costliest branches, month comparisons). Numbers come from the accounting engine.",
  },
  {
    name: "Tadqeeq AI",
    nameEn: "Tadqeeq AI",
    description: "Answers questions about the numbers in plain Arabic; numbers come from the accounting engine and the AI never changes them.",
  },
];

/**
 * The homepage film: a tour of every product with an Arabic voiceover. New file names on each new film,
 * because /video/* is cached for 30 days.
 */
export const EXPLAINER_VIDEO = {
  src: "/video/tadqeeq-features.mp4",
  poster: "/video/tadqeeq-features-poster.jpg",
  mobileSrc: "/video/tadqeeq-features-mobile.mp4",
  mobilePoster: "/video/tadqeeq-features-mobile-poster.jpg",
  /** 12 s silent loop (≈37 KB) that plays inside the widget. */
  preview: "/video/tadqeeq-features-preview.mp4",
  previewPoster: "/video/tadqeeq-features-preview.jpg",
  /** Shown on the widget and in the pop-up description. */
  durationLabel: "1:44",
  durationIso: "PT1M44S",
  // Full date-time with the Riyadh offset: Google rejects a bare date for VideoObject.uploadDate.
  uploadDate: "2026-10-10T05:00:00+03:00",
};
