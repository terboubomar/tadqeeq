import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { copyText } from "@/components/compensation/queries";
import { IntegrationLogoMark, type IntegrationLogo } from "@/components/integrations/IntegrationLogo";
import { AccountingDialog } from "@/components/integrations/AccountingDialog";
import { ACCOUNTING_PROVIDER_KEYS } from "@/components/integrations/providers";
import { INTEGRATION_STATUS_KEY, useIntegrationStatus } from "@/components/integrations/use-integration-status";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ActionBar, ActionDivider, PageHeader } from "@/components/workspace/PageKit";
import { finishZohoConnect } from "@/lib/integrations/connections.functions";
import type { AccountingProvider } from "@/lib/integrations/sendable";
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

type Category = "accounting" | "messaging" | "ai";
/** live: works today inside Tadqeeq · file: an import file today, a direct connection later. */
type Status = "live" | "file";

interface Integration {
  key: string;
  name: string;
  /** The word shown on the tile when there is no logo. */
  mark: string;
  /** Brand marks shown on the tile instead of the word. */
  logos?: IntegrationLogo[];
  /** The product's own logo file (public/integrations), shown on a tile of the logo's background colour. */
  image?: { src: string; className: string };
  line: string;
  category: Category;
  status: Status;
  /** Tile colour, close to the product's own (white for logos on white). */
  color: string;
  /** Dark text for the category label, on light tiles. */
  light?: boolean;
  to?: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  accounting: "المحاسبة",
  messaging: "التواصل",
  ai: "الذكاء الاصطناعي",
};

const MCP_URL = "https://tadqeeq.app/mcp";

const INTEGRATIONS: Integration[] = [
  { key: "qoyod", name: "قيود Qoyod", mark: "قيود", image: { src: "/integrations/qoyod.webp", className: "w-[62%]" }, line: "إرسال القيود مباشرة", category: "accounting", status: "file", color: "#162660", to: "/journal" },
  { key: "daftra", name: "دفترة Daftra", mark: "دفترة", image: { src: "/integrations/daftra.webp", className: "w-[62%]" }, line: "إرسال القيود مباشرة", category: "accounting", status: "file", color: "#FFFFFF", light: true, to: "/journal" },
  { key: "zoho", name: "Zoho Books", mark: "Zoho Books", image: { src: "/integrations/zoho-books.webp", className: "w-[66%]" }, line: "إرسال القيود مباشرة", category: "accounting", status: "file", color: "#FFFFFF", light: true, to: "/journal" },
  { key: "odoo", name: "Odoo", mark: "odoo", logos: ["odoo"], line: "قيود مع الحسابات التحليلية", category: "accounting", status: "file", color: "#714B67", to: "/journal" },
  { key: "quickbooks", name: "QuickBooks Online", mark: "QuickBooks", logos: ["quickbooks"], line: "قيود مع الفئة لكل فرع", category: "accounting", status: "file", color: "#2CA01C", to: "/journal" },
  { key: "telegram", name: "Telegram", mark: "Telegram", image: { src: "/integrations/telegram.webp", className: "w-[30%]" }, line: "أدلة الطلبات من قروبات الفروع", category: "messaging", status: "live", color: "#FFFFFF", light: true, to: "/compensation/branches" },
  { key: "email", name: "البريد الإلكتروني", mark: "البريد", image: { src: "/integrations/gmail.webp", className: "w-[34%]" }, line: "تقارير مجدولة إلى بريدك", category: "messaging", status: "live", color: "#FFFFFF", light: true, to: "/report-schedules" },
  { key: "assistant", name: "Claude و ChatGPT", mark: "AI", logos: ["claude", "openai"], line: "اسأل عن تدقيقك من مساعدك", category: "ai", status: "live", color: "#1E2A28" },
];

const isAccountingProvider = (key: string): key is AccountingProvider => (ACCOUNTING_PROVIDER_KEYS as string[]).includes(key);

/** Wordmarks that fill only a thin band of their square, so they are drawn larger. */
const WIDE_LOGOS: ReadonlySet<IntegrationLogo> = new Set(["odoo"]);

const CONNECTED_PILL = { label: "متصل", className: "bg-success-soft text-success" };

const STATUS_PILL: Record<Status, { label: string; className: string }> = {
  live: { label: "مفعّل", className: "bg-success-soft text-success" },
  file: { label: "ملف استيراد", className: "bg-secondary text-primary-text" },
};

function IntegrationsPage() {
  const [category, setCategory] = useState<Category | "all">("all");
  const [query, setQuery] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [accountingOpen, setAccountingOpen] = useState<AccountingProvider | null>(null);
  const { data: status } = useIntegrationStatus();
  const dialogs: Partial<Record<string, () => void>> = {
    assistant: () => setAssistantOpen(true),
    qoyod: () => setAccountingOpen("qoyod"),
    daftra: () => setAccountingOpen("daftra"),
    zoho: () => setAccountingOpen("zoho"),
  };
  useZohoReturn(() => setAccountingOpen("zoho"));

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
          {(["all", "accounting", "messaging", "ai"] as const).map((key) => (
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
              <IntegrationCard item={item} onOpen={dialogs[item.key]} connected={isAccountingProvider(item.key) && Boolean(status?.[item.key])} />
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

      {ACCOUNTING_PROVIDER_KEYS.map((provider) => (
        <AccountingDialog key={provider} provider={provider} open={accountingOpen === provider} onOpenChange={(open) => setAccountingOpen(open ? provider : null)} />
      ))}

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

/**
 * Zoho sends people back here after they approve (or refuse) Tadqeeq, with ?code, ?state and their data center.
 * Finishes the connection once, then removes those values from the address bar.
 */
function useZohoReturn(onDone: () => void) {
  const queryClient = useQueryClient();
  const started = useRef(false);
  const finish = useMutation({
    mutationFn: (data: { code: string; state: string; accountsServer?: string }) => finishZohoConnect({ data }),
    onSuccess: (status) => {
      queryClient.setQueryData(INTEGRATION_STATUS_KEY, status);
      toast.success("رُبط Zoho Books.");
      onDone();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر ربط Zoho Books."),
  });
  useEffect(() => {
    if (started.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const refused = params.get("error");
    if (!state || (!code && !refused)) return;
    started.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    if (refused || !code) {
      toast.error("لم يكتمل ربط Zoho Books.");
      return;
    }
    finish.mutate({ code, state, accountsServer: params.get("accounts-server") ?? undefined });
  }, [finish]);
}

/** A coloured tile with the product's name and category (as on POS app marketplaces), then one line and its status. */
function IntegrationCard({ item, onOpen, connected = false }: { item: Integration; onOpen?: () => void; connected?: boolean }) {
  const pill = connected ? CONNECTED_PILL : STATUS_PILL[item.status];
  const body = (
    <>
      <span
        className={cn(
          "relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl text-white",
          item.light && "ring-1 ring-inset ring-border",
        )}
        style={{ backgroundColor: item.color }}
      >
        {item.image ? (
          <img src={item.image.src} alt={item.name} loading="lazy" decoding="async" className={cn("h-auto -translate-y-2 object-contain", item.image.className)} />
        ) : item.logos?.length ? (
          <span className="flex items-center gap-4">
            {item.logos.map((logo) => (
              <IntegrationLogoMark key={logo} logo={logo} className={WIDE_LOGOS.has(logo) ? "size-24 sm:size-28" : "size-11 sm:size-12"} />
            ))}
          </span>
        ) : (
          <span className="font-display text-[22px] font-extrabold tracking-[-0.01em] sm:text-[26px]" dir="auto">
            {item.mark}
          </span>
        )}
        <span className={cn("absolute inset-x-0 bottom-2 text-center text-[11px] font-semibold", item.light ? "text-muted-foreground" : "text-white/80")}>
          {CATEGORY_LABEL[item.category]}
        </span>
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

  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} className={cn(frame, interactive, "w-full")}>
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
