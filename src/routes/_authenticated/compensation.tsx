import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clipboard,
  Link2,
  Search,
  Send,
  ShieldCheck,
  Video,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  configureTelegramWebhook,
  createTelegramBranchConnection,
  getCompensationCases,
  getTelegramBranchConnections,
  getTelegramIntegrationStatus,
  saveCompensationCase,
  searchCompensationEvidence,
  setTelegramBranchConnectionActive,
} from "@/lib/compensation-evidence.functions";
import type {
  CompensationCaseRecord,
  CompensationEvidenceRecord,
  JahezCompensationMatchRecord,
} from "@/lib/compensation-evidence.server";
import { sar } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/compensation")({
  head: () => ({
    meta: [
      { title: "مركز التعويضات · تدقيق" },
      {
        name: "description",
        content:
          "ربط أدلة الفروع من Telegram بأرقام الطلبات وبناء ملف اعتراض جاهز للإرسال إلى منصة التوصيل.",
      },
    ],
  }),
  component: CompensationPage,
});

type Platform = "hungerstation" | "keeta" | "jahez";

function CompensationPage() {
  const queryClient = useQueryClient();
  const [branchName, setBranchName] = useState("");
  const [connectionCode, setConnectionCode] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [selectedEvidence, setSelectedEvidence] =
    useState<CompensationEvidenceRecord | null>(null);
  const [platform, setPlatform] = useState<Platform>("jahez");
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [caseBranch, setCaseBranch] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [explanation, setExplanation] = useState("");
  const [generatedCase, setGeneratedCase] =
    useState<CompensationCaseRecord | null>(null);

  const statusQuery = useQuery({
    queryKey: ["telegram-integration-status"],
    queryFn: () => getTelegramIntegrationStatus({ data: {} }),
  });

  const connectionsQuery = useQuery({
    queryKey: ["telegram-branch-connections"],
    queryFn: () => getTelegramBranchConnections({ data: {} }),
  });

  const casesQuery = useQuery({
    queryKey: ["compensation-cases"],
    queryFn: () => getCompensationCases({ data: {} }),
  });

  const webhookMutation = useMutation({
    mutationFn: () => configureTelegramWebhook({ data: {} }),
    onSuccess: async () => {
      toast.success("تم تفعيل Telegram webhook");
      await queryClient.invalidateQueries({
        queryKey: ["telegram-integration-status"],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const connectMutation = useMutation({
    mutationFn: (name: string) =>
      createTelegramBranchConnection({ data: { branchName: name } }),
    onSuccess: async (result) => {
      setConnectionCode(result.code);
      setBranchName("");
      toast.success("تم إنشاء رمز ربط صالح لمدة 30 دقيقة");
      await queryClient.invalidateQueries({
        queryKey: ["telegram-branch-connections"],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setTelegramBranchConnectionActive({ data: { id, active } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["telegram-branch-connections"],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const searchMutation = useMutation({
    mutationFn: (value: string) =>
      searchCompensationEvidence({ data: { orderNumber: value } }),
    onSuccess: (result) => {
      setGeneratedCase(null);
      setSelectedEvidence(result.evidence[0] ?? null);
      if (result.evidence[0]) setCaseBranch(result.evidence[0].branchName);
      if (result.jahezMatches[0]) {
        applyJahezMatch(result.jahezMatches[0]);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const compensationAmount = Number(amount.replace(/,/g, ""));
      if (!Number.isFinite(compensationAmount) || compensationAmount < 0) {
        throw new Error("أدخل مبلغ تعويض صالحاً.");
      }
      return saveCompensationCase({
        data: {
          platform,
          orderNumber: orderNumber.trim(),
          periodId,
          evidenceId: selectedEvidence?.id ?? null,
          branchName: caseBranch.trim() || null,
          compensationAmount,
          compensationReason: reason,
          employeeExplanation: explanation,
        },
      });
    },
    onSuccess: async (result) => {
      setGeneratedCase(result);
      toast.success("تم إنشاء ملف الاعتراض");
      await queryClient.invalidateQueries({ queryKey: ["compensation-cases"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const connectedCount = useMemo(
    () =>
      (connectionsQuery.data ?? []).filter(
        (item) => item.active && item.chatId !== null,
      ).length,
    [connectionsQuery.data],
  );

  function applyJahezMatch(match: JahezCompensationMatchRecord) {
    setPlatform("jahez");
    setPeriodId(match.periodId);
    setCaseBranch(match.matchedBranch || match.branch || "");
    setAmount(String(match.amount));
    setReason(match.reason || "تعويض من تقرير جاهز");
  }

  async function copy(value: string, label = "تم النسخ") {
    await navigator.clipboard.writeText(value);
    toast.success(label);
  }

  return (
    <div className="space-y-7">
      <header>
        <h1 className="audit-heading">مركز التعويضات</h1>
        <p className="audit-subtitle max-w-4xl">
          Telegram هو قناة جمع الدليل من الفروع. Tadqeeq يربط الدليل برقم الطلب،
          يعرض بيانات التعويض المتاحة، ثم يبني صيغة اعتراض تعتمد على البيانات
          المؤكدة وشرح الموظف.
        </p>
      </header>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="rounded-[10px] border border-border bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-bold">ربط Telegram</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Bot واحد لكل Tadqeeq، وقروب خاص لكل فرع.
              </p>
            </div>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-semibold",
                statusQuery.data?.webhookActive
                  ? "bg-success/15 text-success"
                  : "bg-warning/15 text-warning",
              )}
            >
              {statusQuery.data?.webhookActive ? "Webhook فعال" : "غير مفعل"}
            </span>
          </div>

          {statusQuery.data?.configured ? (
            <div className="mt-4 rounded-lg border border-border bg-surface-raised p-3 text-sm">
              <p>
                البوت:{" "}
                <span className="font-semibold">
                  {statusQuery.data.botUsername
                    ? "@" + statusQuery.data.botUsername
                    : "مهيأ"}
                </span>
              </p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {statusQuery.data.webhookUrl || "لا يوجد webhook مسجل حالياً"}
              </p>
              {!statusQuery.data.webhookActive ? (
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  disabled={webhookMutation.isPending}
                  onClick={() => webhookMutation.mutate()}
                >
                  <Link2 className="size-4" />
                  تفعيل Webhook
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
              <p className="font-semibold">إعداد واحد مطلوب على الخادم</p>
              <p className="mt-1">
                أضف <code>TELEGRAM_BOT_TOKEN</code> و{" "}
                <code>TELEGRAM_WEBHOOK_SECRET</code>. بعدها يمكن تفعيل الربط من
                هذه الصفحة بدون كشف أي مفتاح للمستخدم.
              </p>
            </div>
          )}

          <div className="mt-5 border-t border-border pt-4">
            <label className="text-xs font-semibold text-muted-foreground">
              اسم الفرع
            </label>
            <div className="mt-2 flex gap-2">
              <Input
                value={branchName}
                onChange={(event) => setBranchName(event.target.value)}
                placeholder="مثال: Past Al Rakah"
              />
              <Button
                type="button"
                disabled={!branchName.trim() || connectMutation.isPending}
                onClick={() => connectMutation.mutate(branchName.trim())}
              >
                إنشاء رمز
              </Button>
            </div>

            {connectionCode ? (
              <div className="mt-3 rounded-lg border border-primary/20 bg-secondary/60 p-3">
                <p className="text-xs text-muted-foreground">
                  أرسل هذا الأمر داخل قروب الفرع خلال 30 دقيقة:
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <code className="text-base font-bold" dir="ltr">
                    /connect {connectionCode}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copy("/connect " + connectionCode)}
                  >
                    <Clipboard className="size-3.5" />
                    نسخ
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-5 space-y-2">
            {(connectionsQuery.data ?? []).map((connection) => (
              <div
                key={connection.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{connection.branchName}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {connection.chatId
                      ? connection.chatTitle || String(connection.chatId)
                      : "بانتظار /connect"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={activeMutation.isPending}
                  onClick={() =>
                    activeMutation.mutate({
                      id: connection.id,
                      active: !connection.active,
                    })
                  }
                >
                  {connection.active ? "إيقاف" : "تفعيل"}
                </Button>
              </div>
            ))}
            {!connectionsQuery.isLoading &&
            (connectionsQuery.data?.length ?? 0) === 0 ? (
              <p className="py-5 text-center text-sm text-muted-foreground">
                لا توجد فروع مربوطة بعد.
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-[10px] border border-border bg-white p-5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-primary" />
            <div>
              <h2 className="font-bold">طريقة العمل في الفرع</h2>
              <p className="text-sm text-muted-foreground">
                لا يحتاج الكاشير إلى حساب Tadqeeq.
              </p>
            </div>
          </div>
          <ol className="mt-5 space-y-4 text-sm">
            <Instruction number="1">
              يسجل فيديو الطلب قبل التسليم أو الإغلاق حسب الإجراء التشغيلي
              المعتمد.
            </Instruction>
            <Instruction number="2">
              يرسل الفيديو في قروب Telegram الخاص بالفرع ويكتب رقم الطلب في
              Caption.
            </Instruction>
            <Instruction number="3">
              إذا نسي Caption، يرد على نفس الفيديو برقم الطلب فقط.
            </Instruction>
            <Instruction number="4">
              Tadqeeq يحفظ مرجع الفيديو وThumbnail خاص ويربطه بالطلب تلقائياً.
            </Instruction>
          </ol>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Metric label="فروع متصلة" value={String(connectedCount)} />
            <Metric
              label="حالات اعتراض"
              value={String(casesQuery.data?.length ?? 0)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-[10px] border border-border bg-white p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1">
            <label className="text-xs font-semibold text-muted-foreground">
              رقم الطلب
            </label>
            <div className="relative mt-2">
              <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value)}
                placeholder="اكتب رقم الطلب كما يظهر في المنصة"
                className="ps-9"
                dir="ltr"
              />
            </div>
          </div>
          <Button
            type="button"
            disabled={orderNumber.trim().length < 3 || searchMutation.isPending}
            onClick={() => searchMutation.mutate(orderNumber.trim())}
          >
            <Search className="size-4" />
            بحث
          </Button>
        </div>

        {searchMutation.data ? (
          <div className="mt-6 grid gap-5 xl:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold">دليل Telegram</h3>
              <div className="mt-3 space-y-3">
                {searchMutation.data.evidence.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setSelectedEvidence(item);
                      setCaseBranch(item.branchName);
                    }}
                    className={cn(
                      "flex w-full gap-3 rounded-lg border p-3 text-start transition-colors",
                      selectedEvidence?.id === item.id
                        ? "border-primary bg-secondary/50"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={"دليل الطلب " + item.orderNumber}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Video className="size-7 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{item.branchName}</p>
                      <p className="num mt-1 text-xs text-muted-foreground">
                        {formatTimestamp(item.capturedAt)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.senderName || "مرسل غير معروف"}
                      </p>
                      {item.telegramUrl ? (
                        <a
                          href={item.telegramUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary"
                        >
                          <Video className="size-3.5" />
                          فتح الفيديو في Telegram
                        </a>
                      ) : null}
                    </div>
                  </button>
                ))}
                {searchMutation.data.evidence.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    لا يوجد دليل Telegram بهذا الرقم حتى الآن.
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold">بيانات التعويض المتاحة</h3>
              <div className="mt-3 space-y-3">
                {searchMutation.data.jahezMatches.map((match, index) => (
                  <div
                    key={match.periodId + ":" + index}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">جاهز · {match.periodLabel}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {match.branch} · {match.transactionType}
                        </p>
                      </div>
                      <span className="num font-semibold">{sar(match.amount)}</span>
                    </div>
                    <p className="mt-2 text-sm">{match.reason || "بدون سبب مسجل"}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      <Tag positive={match.match !== "unknown"}>
                        {match.match === "current"
                          ? "طلب من الفترة"
                          : match.match === "historical"
                            ? "طلب تاريخي"
                            : "طلب غير معروف"}
                      </Tag>
                      {match.duplicateCandidate ? (
                        <Tag positive={false}>اشتباه تكرار</Tag>
                      ) : null}
                      {match.branchMismatch ? (
                        <Tag positive={false}>اختلاف فرع</Tag>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => applyJahezMatch(match)}
                    >
                      استخدام بيانات جاهز
                    </Button>
                  </div>
                ))}
                {searchMutation.data.jahezMatches.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    لا توجد حركة تعويض جاهز مطابقة في الفترات الحالية. يمكن
                    إنشاء الاعتراض يدوياً لهنقرستيشن أو كيتا أو جاهز.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-[10px] border border-border bg-white p-5">
        <h2 className="font-bold">بناء ملف الاعتراض</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          الموظف يشرح الواقعة. Tadqeeq يبني الرسالة من الوقائع المختارة بدون
          تحويل رأي الموظف إلى حقيقة مالية آلية.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="المنصة">
            <Select
              value={platform}
              onValueChange={(value) => {
                setPlatform(value as Platform);
                if (value !== "jahez") setPeriodId(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hungerstation">هنقرستيشن</SelectItem>
                <SelectItem value="keeta">كيتا</SelectItem>
                <SelectItem value="jahez">جاهز</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="رقم الطلب">
            <Input value={orderNumber} readOnly dir="ltr" />
          </Field>

          <Field label="الفرع">
            <Input
              value={caseBranch}
              onChange={(event) => setCaseBranch(event.target.value)}
              placeholder="اسم الفرع"
            />
          </Field>

          <Field label="مبلغ التعويض">
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              dir="ltr"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Field label="سبب التعويض المسجل في المنصة">
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="مثال: Missing item"
            />
          </Field>

          <Field label="الدليل المختار">
            <div className="min-h-10 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
              {selectedEvidence
                ? selectedEvidence.branchName +
                  " · " +
                  formatTimestamp(selectedEvidence.capturedAt)
                : "لا يوجد دليل مختار"}
            </div>
          </Field>
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold text-muted-foreground">
            شرح الموظف
          </label>
          <textarea
            value={explanation}
            onChange={(event) => setExplanation(event.target.value)}
            rows={5}
            placeholder="اكتب ما حدث فعلياً في الفرع، وما الذي يظهره الدليل، ولماذا يجب مراجعة التعويض."
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
          />
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            disabled={
              saveMutation.isPending ||
              orderNumber.trim().length < 3 ||
              !reason.trim() ||
              !explanation.trim()
            }
            onClick={() => saveMutation.mutate()}
          >
            <Send className="size-4" />
            إنشاء رسالة الاعتراض
          </Button>
        </div>

        {generatedCase ? (
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <DraftBox
              title="العربية"
              value={generatedCase.draftAr}
              onCopy={() => copy(generatedCase.draftAr)}
            />
            <DraftBox
              title="English"
              value={generatedCase.draftEn}
              onCopy={() => copy(generatedCase.draftEn)}
            />
          </div>
        ) : null}
      </section>

      <section className="rounded-[10px] border border-border bg-white p-5">
        <h2 className="font-bold">آخر حالات التعويض</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <Th>الطلب</Th>
                <Th>المنصة</Th>
                <Th>الفرع</Th>
                <Th>المبلغ</Th>
                <Th>الحالة</Th>
                <Th>آخر تحديث</Th>
              </tr>
            </thead>
            <tbody>
              {(casesQuery.data ?? []).slice(0, 20).map((item) => (
                <tr key={item.id} className="border-b border-border/60">
                  <Td mono>{item.orderNumber}</Td>
                  <Td>{platformLabel(item.platform)}</Td>
                  <Td>{item.branchName || "—"}</Td>
                  <Td mono>{sar(item.compensationAmount)}</Td>
                  <Td>
                    <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold">
                      {caseStatusLabel(item.status)}
                    </span>
                  </Td>
                  <Td mono>{formatTimestamp(item.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Instruction({
  number,
  children,
}: {
  number: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-secondary font-bold">
        {number}
      </span>
      <span className="pt-1">{children}</span>
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="num mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function DraftBox({
  title,
  value,
  onCopy,
}: {
  title: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">{title}</h3>
        <Button type="button" variant="outline" size="sm" onClick={onCopy}>
          <Clipboard className="size-3.5" />
          نسخ
        </Button>
      </div>
      <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-7">
        {value}
      </pre>
    </div>
  );
}

function Tag({
  positive,
  children,
}: {
  positive: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-1",
        positive
          ? "bg-success/10 text-success"
          : "bg-warning/15 text-warning",
      )}
    >
      {children}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-start font-semibold">{children}</th>;
}

function Td({
  children,
  mono = false,
}: {
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <td className={cn("px-3 py-3", mono && "num")}>{children}</td>
  );
}

function platformLabel(value: string): string {
  if (value === "hungerstation") return "هنقرستيشن";
  if (value === "keeta") return "كيتا";
  return "جاهز";
}

function caseStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    draft: "مسودة",
    ready: "جاهز",
    submitted: "مرسل",
    accepted: "مقبول",
    rejected: "مرفوض",
    recovered: "مسترد",
    closed: "مغلق",
  };
  return labels[value] ?? value;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
