import { Clipboard, Download, Eye, Loader2, Video } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { copyText, formatTimestamp } from "@/components/compensation/queries";
import { fetchEvidenceMedia, saveEvidenceFile, type EvidenceMediaFile } from "@/components/compensation/evidence-media";
import { caseStatusLabel } from "@/lib/compensation-overview";
import { cn } from "@/lib/utils";
import { ActionBar, PageHeader } from "@/components/workspace/PageKit";
import { PRODUCTS } from "@/lib/products";

/** Page header for «استرداد» pages: breadcrumb, title and subtitle, with the page's commands in an action bar. */
export function CompHeader({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 space-y-4">
      <PageHeader
        crumbs={[{ label: PRODUCTS.istirdad.name, to: "/compensation" }, { label: title }]}
        title={title}
        subtitle={sub}
      />
      {children ? <ActionBar>{children}</ActionBar> : null}
    </div>
  );
}

/**
 * Number card in the page-kit tile style: `featured` is the gold headline; `good` / `bad` colour the
 * figure only, so the grid keeps one card level. `unit` (e.g. ر.س) sits after the figure in body type.
 */
export function Kpi({
  label,
  value,
  unit,
  hint,
  tone,
  featured = false,
  className,
  children,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: "good" | "bad";
  featured?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-xl border p-4",
        featured ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
        className,
      )}
    >
      <p className={cn("text-[12.5px]", featured ? "text-primary-foreground/80" : "text-muted-foreground")}>{label}</p>
      <p
        className={cn(
          "mt-2 flex min-w-0 items-baseline gap-1.5 font-semibold",
          featured ? "text-[26px] sm:text-[34px]" : "text-[20px] sm:text-2xl",
          tone === "good" && !featured && "text-success",
          tone === "bad" && !featured && "text-destructive",
        )}
      >
        <span className="num truncate">{value}</span>
        {unit ? (
          <span className={cn("shrink-0 text-[12px] font-medium", featured ? "text-primary-foreground/80" : "text-muted-foreground")}>
            {unit}
          </span>
        ) : null}
      </p>
      {hint ? (
        <p className={cn("mt-1.5 text-xs leading-5", featured ? "text-primary-foreground/80" : "text-muted-foreground")}>{hint}</p>
      ) : null}
      {children}
    </div>
  );
}

/** A formatted date and time. Arabic month and day words stay in body type and RTL order (never `num`). */
export function Timestamp({ value, className }: { value: string; className?: string }) {
  return (
    <time dateTime={value} className={cn("whitespace-nowrap tabular-nums", className)}>
      {formatTimestamp(value)}
    </time>
  );
}

const STATUS_TONES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  ready: "bg-warning/15 text-warning",
  submitted: "bg-chart-2/15 text-chart-2",
  accepted: "bg-chart-2/15 text-chart-2",
  recovered: "bg-success/15 text-success",
  rejected: "bg-destructive/12 text-destructive",
  closed: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
        STATUS_TONES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {caseStatusLabel(status)}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

export function Tag({ positive, children }: { positive: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-1",
        positive ? "bg-success/10 text-success" : "bg-warning/15 text-warning",
      )}
    >
      {children}
    </span>
  );
}

export function DraftBox({ title, value, dir }: { title: string; value: string; dir?: "ltr" | "rtl" }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">{title}</h3>
        <Button type="button" variant="outline" size="sm" onClick={() => void copyText(value)}>
          <Clipboard className="size-3.5" />
          نسخ
        </Button>
      </div>
      <pre dir={dir} className="mt-3 whitespace-pre-wrap text-start font-sans text-sm leading-7">{value}</pre>
    </div>
  );
}

/**
 * Preview and download straight from Telegram. The file is fetched on demand, kept only in this
 * tab's memory while the preview is open, and released when it closes or after a download.
 */
export function EvidenceActions({ id }: { id: string }) {
  const [busy, setBusy] = useState<"preview" | "download" | null>(null);
  const [preview, setPreview] = useState<{ url: string; kind: EvidenceMediaFile["kind"] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  async function run(action: "preview" | "download") {
    if (action === "preview" && preview) {
      setPreview(null);
      return;
    }
    setBusy(action);
    setError(null);
    try {
      const file = await fetchEvidenceMedia(id, "full");
      if (action === "download") saveEvidenceFile(file);
      else setPreview({ url: URL.createObjectURL(file.blob), kind: file.kind });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "تعذّر جلب الدليل من Telegram.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-2" onClick={(event) => event.stopPropagation()}>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={busy !== null} onClick={() => void run("preview")} aria-busy={busy === "preview"}>
          {busy === "preview" ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
          {preview ? "إخفاء المعاينة" : "معاينة"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void run("download")} aria-busy={busy === "download"}>
          {busy === "download" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          تنزيل
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      {preview ? (
        <div className="mt-3 overflow-hidden rounded-md border border-border bg-muted">
          {preview.kind === "video" ? (
            <video src={preview.url} controls playsInline className="max-h-[60vh] w-full" />
          ) : (
            <img src={preview.url} alt="معاينة الدليل" className="max-h-[60vh] w-full object-contain" />
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Small preview loaded from Telegram on demand; nothing is cached by Tadqeeq. */
export function EvidenceThumb({ id, available, alt }: { id: string; available: boolean; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!available) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchEvidenceMedia(id, "thumb")
      .then((file) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(file.blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, available]);

  return url ? (
    <img src={url} alt={alt} className="h-full w-full object-cover" />
  ) : (
    <Video className="size-7 text-muted-foreground" />
  );
}

export function Denied({ message = "دورك لا يسمح بفتح هذا القسم." }: { message?: string }) {
  return <p className="panel mx-auto mt-10 max-w-md p-8 text-center text-sm">{message}</p>;
}
