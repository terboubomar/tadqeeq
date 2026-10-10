import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Loader2, Mail, Phone, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";
import { Button } from "@/components/ui/button";
import { contactTopicLabel } from "@/lib/contact";
import { opsCan } from "@/lib/ops";
import { listContactMessages, setContactMessageHandled } from "@/lib/ops.functions";

export const Route = createFileRoute("/ops/messages")({ component: Messages });

const when = (iso: string) => new Date(iso).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
/** wa.me needs digits only, without + or a leading 0. */
const whatsapp = (mobile: string) => `https://wa.me/${mobile.replace(/\D/g, "")}`;

function Messages() {
  const role = useOpsRole();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"new" | "handled" | "all">("new");
  const q = useQuery({ queryKey: ["ops-messages"], queryFn: () => listContactMessages({ data: {} }), enabled: opsCan(role, "clients") });
  const handle = useMutation({
    mutationFn: (input: { id: string; handled: boolean }) => setContactMessageHandled({ data: input }),
    onSuccess: (_, input) => {
      toast.success(input.handled ? "تم وضع الرسالة كمعالجة" : "أُعيد فتح الرسالة");
      void qc.invalidateQueries({ queryKey: ["ops-messages"] });
      void qc.invalidateQueries({ queryKey: ["ops-tasks"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!opsCan(role, "clients")) return <OpsDenied />;

  const all = q.data ?? [];
  const rows = all.filter((m) => filter === "all" || m.status === filter);
  const newCount = all.filter((m) => m.status === "new").length;

  return (
    <div>
      <OpsHeader title="رسائل التواصل" sub={`من صفحة «تواصل معنا» · ${newCount} جديدة`}>
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="new">جديدة</option>
          <option value="handled">تمت معالجتها</option>
          <option value="all">الكل</option>
        </select>
      </OpsHeader>
      {q.isLoading ? <Loader2 className="m-4 size-5 animate-spin" /> : null}
      {!q.isLoading && !rows.length ? (
        <section className="panel p-8 text-center text-sm text-muted-foreground">{filter === "new" ? "لا توجد رسائل جديدة." : "لا توجد رسائل."}</section>
      ) : null}
      <div className="space-y-3">
        {rows.map((m) => (
          <article key={m.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {m.name}
                  {m.company ? <span className="text-muted-foreground"> · {m.company}</span> : null}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5">{contactTopicLabel(m.topic)}</span> <span className="whitespace-nowrap tabular-nums">{when(m.createdAt)}</span>
                </p>
              </div>
              {m.status === "new" ? (
                <Button size="sm" onClick={() => handle.mutate({ id: m.id, handled: true })} disabled={handle.isPending}>
                  <Check className="size-4" /> تمت المعالجة
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => handle.mutate({ id: m.id, handled: false })} disabled={handle.isPending}>
                  <RotateCcw className="size-4" /> إعادة فتح
                </Button>
              )}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{m.message}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 hover:bg-muted" dir="ltr">
                <Mail className="size-3.5" /> {m.email}
              </a>
              <a href={`tel:${m.mobile}`} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 hover:bg-muted" dir="ltr">
                <Phone className="size-3.5" /> {m.mobile}
              </a>
              <a href={whatsapp(m.mobile)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 hover:bg-muted">
                واتساب
              </a>
            </div>
            {m.status === "handled" && m.handledAt ? (
              <p className="mt-3 text-xs text-muted-foreground">
                عولجت <span className="whitespace-nowrap tabular-nums">{when(m.handledAt)}</span>
                {m.handledBy ? ` · ${m.handledBy}` : ""}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
