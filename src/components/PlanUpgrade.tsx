import { Link } from "@tanstack/react-router";
import { ArrowLeft, Lock, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { lockedFeatureLabel } from "@/lib/plans";
import type { WorkspacePermission } from "@/lib/workspace-access";

/** Strip at the top of the app while the workspace is on the free trial. */
export function TrialBanner({ uploadsUsed, uploadLimit }: { uploadsUsed: number; uploadLimit: number | null }) {
  const used = uploadLimit !== null && uploadsUsed >= uploadLimit;
  return (
    <div
      data-noprint
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/25 bg-secondary px-4 py-2.5 text-[13px] sm:px-5"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">
        <Sparkles className="size-3" />
        تجربة مجانية
      </span>
      <p className="min-w-0 flex-1 text-foreground/85">
        {used
          ? "استخدمت الرفع المتاح في التجربة. اشترك لرفع فترات ومنصات أخرى وفتح مركز الاستثناءات والتعويضات والعقود وTadqeeq AI."
          : "ارفع ملفات منصة واحدة لفترة واحدة وشاهد تحليل فاتورتك كاملاً. بقية الأقسام تُفتح بعد الاشتراك."}
        {uploadLimit !== null ? (
          <span className="ms-2 text-muted-foreground">
            الرفع{" "}
            <span className="num">
              {Math.min(uploadsUsed, uploadLimit)} / {uploadLimit}
            </span>
          </span>
        ) : null}
      </p>
      <Button asChild size="sm" className="h-8">
        <Link to="/subscribe">
          اشترك الآن
          <ArrowLeft className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}

/** Shown instead of a page the plan or trial does not include. */
export function UpgradeCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="panel mx-auto mt-10 max-w-lg p-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-primary-text">
        <Lock className="size-5" />
      </span>
      <h1 className="mt-4 text-lg font-bold">{title}</h1>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{body}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link to="/subscribe">
            اشترك وتواصل معنا
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/dashboard">العودة إلى التحليل</Link>
        </Button>
      </div>
    </div>
  );
}

export function LockedFeatureCard({ permission, trial }: { permission: WorkspacePermission; trial: boolean }) {
  const label = lockedFeatureLabel(permission);
  return (
    <UpgradeCard
      title={`${label} غير متاح في ${trial ? "التجربة المجانية" : "باقتك الحالية"}`}
      body={
        trial
          ? "التجربة تفتح رفع ملف واحد وتحليل الفاتورة والتقارير. اشترك لفتح هذا القسم وبقية أدوات تدقيق."
          : "هذا القسم ضمن باقات أعلى. تواصل معنا لترقية باقتك وفتحه لفريقك."
      }
    />
  );
}
