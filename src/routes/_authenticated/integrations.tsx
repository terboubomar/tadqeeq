import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { copyText } from "@/components/compensation/queries";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ActionBar, ActionDivider, PageHeader } from "@/components/workspace/PageKit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({
    meta: [
      { title: "التكاملات · تدقيق" },
      { name: "description", content: "الأنظمة المرتبطة بتدقيق والقادمة قريباً." },
    ],
  }),
  component: IntegrationsPage,
});

type Category = "pos" | "accounting" | "messaging" | "ai";
/** live: works today inside Tadqeeq · file: an import file today, a direct connection later · soon: not yet available. */
type Status = "live" | "file" | "soon";

interface Integration {
  key: string;
  name: string;
  /** The word shown on the tile: the product's name in plain text, no logo artwork. */
  mark: string;
  line: string;
  category: Category;
  status: Status;
  /** Tile colour, close to the product's own. */
  color: string;
  to?: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  pos: "نقاط البيع",
  accounting: "المحاسبة",
  messaging: "التواصل",
  ai: "الذكاء الاصطناعي",
};

const MCP_URL = "https://tadqeeq.app/mcp";

const INTEGRATIONS: Integration[] = [
  { key: "foodics", name: "Foodics", mark: "foodics", line: "مطابقة طلبات نقطة البيع مع المنصات", category: "pos", status: "soon", color: "#4B0EA1" },
  { key: "qoyod", name: "قيود Qoyod", mark: "قيود", line: "إرسال القيود مباشرة كمسودة", category: "accounting", status: "file", color: "#0E7C86", to: "/journal" },
  { key: "daftra", name: "دفترة Daftra", mark: "دفترة", line: "إرسال القيود مع مراكز التكلفة", category: "accounting", status: "file", color: "#1D5FD1", to: "/journal" },
  { key: "zoho", name: "Zoho Books", mark: "Zoho Books", line: "إرسال القيود إلى دفاترك", category: "accounting", status: "file", color: "#D6342B", to: "/journal" },
  { key: "odoo", name: "Odoo", mark: "odoo", line: "قيود مع الحسابات التحليلية", category: "accounting", status: "file", color: "#714B67", to: "/journal" },
  { key: "quickbooks", name: "QuickBooks Online", mark: "QuickBooks", line: "قيود مع الفئة لكل فرع", category: "accounting", status: "file", color: "#2C8A1C", to: "/journal" },
  { key: "telegram", name: "Telegram", mark: "Telegram", line: "أدلة الطلبات من قروبات الفروع", category: "messaging", status: "live", color: "#1F8FCB", to: "/compensation/branches" },
  { key: "email", name: "البريد الإلكتروني", mark: "البريد", line: "تقارير مجدولة إلى بريدك", category: "messaging", status: "live", color: "#3A4250", to: "/report-schedules" },
  { key: "assistant", name: "Claude و ChatGPT", mark: "AI", line: "اسأل عن تدقيقك من مساعدك", category: "ai", status: "live", color: "#1E2A28" },
];

const STATUS_PILL: Record<Status, { label: string; className: string }> = {
  live: { label: "مفعّل", className: "bg-success-soft text-success" },
  file: { label: "ملف استيراد", className: "bg-secondary text-primary-text" },
  soon: { label: "قريباً", className: "bg-muted text-muted-foreground" },
};

function IntegrationsPage() {
  const [category, setCategory] = useState<Category | "all">("all");
  const [query, setQuery] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return INTEGRATIONS.filter(
      (item) =>
        (category === "all" || item.category === category) &&
        (!needle || `${item.name} ${item.line} ${CATEGORY_LABEL[item.category]}`.toLowerCase().includes(needle)),
    );
  }, [category, query]);

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "الإعداد" }, { label: "التكاملات" }]}
        title="التكاملات"
        subtitle="اربط تدقيق بأنظمتك."
      />

      <ActionBar>
        <div role="group" aria-label="الفئة" className="flex flex-wrap gap-1">
          {(["all", "pos", "accounting", "messaging", "ai"] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={category === key}
              onClick={() => setCategory(key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                category === key ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground/30",
              )}
            >
              {key === "all" ? "الكل" : CATEGORY_LABEL[key]}
            </button>
          ))}
        </div>
        <ActionDivider />
        <div className="relative min-w-0 flex-[1_1_200px]">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث عن نظام…"
            aria-label="بحث في التكاملات"
            className="h-9 border-0 bg-transparent ps-9 shadow-none focus-visible:ring-1"
          />
        </div>
      </ActionBar>

      {shown.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((item) => (
            <li key={item.key}>
              <IntegrationCard item={item} onOpenAssistant={() => setAssistantOpen(true)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">لا يوجد نظام بهذا الاسم.</p>
      )}

      <p className="text-[12.5px] text-muted-foreground">
        تريد نظاماً غير موجود؟{" "}
        <Link to="/contact" className="font-semibold text-primary-text underline-offset-4 hover:underline">
          اطلبه منا
        </Link>
      </p>

      <Dialog open={assistantOpen} onOpenChange={setAssistantOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>اربط Claude أو ChatGPT</DialogTitle>
            <DialogDescription>أضف هذا الرابط كموصل مخصص في مساعدك، ثم سجّل الدخول بحساب تدقيق.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-raised px-3 py-2.5">
            <code dir="ltr" className="num min-w-0 flex-1 truncate text-[13px]">
              {MCP_URL}
            </code>
            <button
              type="button"
              onClick={() => void copyText(MCP_URL, "نُسخ الرابط")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[12px] font-semibold"
            >
              <Copy className="size-3.5" />
              نسخ
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A coloured tile with the product's name and category (as on POS app marketplaces), then one line and its status. */
function IntegrationCard({ item, onOpenAssistant }: { item: Integration; onOpenAssistant: () => void }) {
  const pill = STATUS_PILL[item.status];
  const body = (
    <>
      <span
        className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl text-white"
        style={{ backgroundColor: item.color }}
      >
        <span className="font-display text-[22px] font-extrabold tracking-[-0.01em] sm:text-[26px]" dir="auto">
          {item.mark}
        </span>
        <span className="absolute inset-x-0 bottom-2 text-center text-[11px] font-semibold text-white/80">{CATEGORY_LABEL[item.category]}</span>
        {item.status === "soon" ? <span className="absolute inset-0 bg-background/10" aria-hidden /> : null}
      </span>
      <span className="mt-2.5 block px-0.5">
        <span className="block text-[14px] font-bold leading-6">{item.name}</span>
        <span className="block text-[12.5px] leading-5 text-muted-foreground">{item.line}</span>
        <span className={cn("mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", pill.className)}>{pill.label}</span>
      </span>
    </>
  );
  const frame = "block h-full rounded-2xl border border-border bg-card p-2.5 text-start transition-[transform,border-color] duration-200";
  const interactive = "hover:-translate-y-0.5 hover:border-foreground/25 active:translate-y-0";

  if (item.key === "assistant") {
    return (
      <button type="button" onClick={onOpenAssistant} className={cn(frame, interactive, "w-full")}>
        {body}
      </button>
    );
  }
  if (item.to) {
    return (
      <Link to={item.to} className={cn(frame, interactive)}>
        {body}
      </Link>
    );
  }
  return <div className={cn(frame, "opacity-90")}>{body}</div>;
}
