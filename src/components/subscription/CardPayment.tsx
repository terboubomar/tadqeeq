import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cardPrice, planForPriceId, type CardCycle } from "@/lib/card-plans";
import { changeCardPlan, getCardPortalUrl, getMyCardSubscription, prepareCardCheckout } from "@/lib/card-payments.functions";
import { getPaddleEnvironment, initializePaddle } from "@/lib/paddle";

type PlanCode = "start" | "growth" | "unlimited";
const isCode = (code: string | null): code is PlanCode => code === "start" || code === "growth" || code === "unlimited";

export function useCardSubscription() {
  const env = getPaddleEnvironment();
  return useQuery({ queryKey: ["my-card-subscription", env], queryFn: () => getMyCardSubscription({ data: { env } }) });
}

export function PaymentTestModeBanner() {
  if (getPaddleEnvironment() !== "sandbox") return null;
  return (
    <p className="rounded-md bg-warning/15 px-4 py-2 text-center text-xs text-foreground">
      وضع تجريبي: الدفع في المعاينة لا يخصم مالاً حقيقياً.
    </p>
  );
}

/** Pay the chosen plan by card, or switch an existing card subscription from the next billing date. */
export function CardPayButton({ planCode, planName, cycle }: { planCode: string | null; planName: string; cycle: CardCycle }) {
  const env = getPaddleEnvironment();
  const qc = useQueryClient();
  const sub = useCardSubscription();
  const price = cardPrice(planCode, cycle);

  const pay = useMutation({
    mutationFn: async () => {
      if (!isCode(planCode)) throw new Error("هذه الباقة لا تُدفع بالبطاقة.");
      const [checkout] = await Promise.all([prepareCardCheckout({ data: { planCode, cycle, env } }), initializePaddle()]);
      window.Paddle.Checkout.open({
        items: [{ priceId: checkout.paddlePriceId, quantity: 1 }],
        customer: checkout.email ? { email: checkout.email } : undefined,
        customData: { workspaceId: checkout.workspaceId, userId: checkout.userId },
        settings: { displayMode: "overlay", locale: "ar", allowLogout: false, variant: "one-page", successUrl: `${window.location.origin}/subscribe?checkout=success` },
      });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const change = useMutation({
    mutationFn: () => {
      if (!isCode(planCode)) throw new Error("هذه الباقة لا تُدفع بالبطاقة.");
      return changeCardPlan({ data: { planCode, cycle, env } });
    },
    onSuccess: () => {
      toast.success(`ستنتقل إلى ${planName} من تاريخ التجديد القادم.`);
      void qc.invalidateQueries({ queryKey: ["my-card-subscription"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!price) return null;
  const busy = pay.isPending || change.isPending;
  if (sub.data) {
    if (sub.data.priceId === price.priceId) return null;
    return (
      <Button variant="outline" disabled={busy} onClick={() => change.mutate()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
        انتقل إلى هذه الباقة من التجديد القادم
      </Button>
    );
  }
  return (
    <div className="space-y-1">
      <Button className="w-full" disabled={busy || sub.isLoading} onClick={() => pay.mutate()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
        ادفع الآن بالبطاقة
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        يُحصّل بالدولار: <span className="num">${price.usd}</span> {cycle === "yearly" ? "سنوياً" : "شهرياً"} · تُفعّل الباقة فور الدفع
      </p>
    </div>
  );
}

/** For a card subscriber: renewal date, a waiting plan change, and the billing portal (cancel, card, invoices). */
export function CardSubscriptionPanel() {
  const env = getPaddleEnvironment();
  const sub = useCardSubscription();
  const portal = useMutation({
    mutationFn: () => getCardPortalUrl({ data: { env } }),
    onSuccess: (url) => window.open(url, "_blank", "noopener"),
    onError: (e) => toast.error((e as Error).message),
  });
  if (!sub.data) return null;
  const end = sub.data.currentPeriodEnd ? new Date(sub.data.currentPeriodEnd).toLocaleDateString("ar-SA-u-nu-latn") : null;
  const pending = sub.data.pendingPriceId ? planForPriceId(sub.data.pendingPriceId) : null;
  return (
    <section className="panel flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
      <div className="space-y-1">
        <p className="font-bold">اشتراك بالبطاقة</p>
        {end ? <p className="text-muted-foreground">{sub.data.cancelAtPeriodEnd ? `أُلغي الاشتراك ويبقى متاحاً حتى ${end}` : `التجديد القادم ${end}`}</p> : null}
        {pending ? <p className="text-muted-foreground">تغيير الباقة يبدأ من التجديد القادم.</p> : null}
        {sub.data.status === "overdue" ? <p className="text-destructive">تعذّر تحصيل الدفعة الأخيرة. حدّث بطاقتك.</p> : null}
      </div>
      <Button variant="outline" disabled={portal.isPending} onClick={() => portal.mutate()}>
        إدارة الدفع أو الإلغاء
      </Button>
    </section>
  );
}
