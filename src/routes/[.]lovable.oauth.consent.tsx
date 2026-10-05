import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { loadSupabase } from "@/integrations/supabase/lazy-client";
import { needsMfaCode } from "@/lib/mfa";

type OAuthResult = { data: { redirect_url?: string; redirect_to?: string; client?: { name?: string } } | null; error: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
const oauth = async () => ((await loadSupabase()).auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  head: () => ({ meta: [{ title: "ربط تطبيق · تدقيق" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s["authorization_id"] === "string" ? s["authorization_id"] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const supabase = await loadSupabase();
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr } });
    // Claude / ChatGPT tokens stay at aal1, so approving them must pass the code for accounts that use it.
    const { data: levels } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (needsMfaCode(levels)) throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr } });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await (await oauth()).getAuthorizationDetails(id);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main dir="rtl" className="grid min-h-screen place-items-center p-6 text-sm">تعذّر تحميل طلب الربط: {error.message}</main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = details?.client?.name ?? "تطبيق خارجي";

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await (await oauth()).approveAuthorization(authorization_id)
      : await (await oauth()).denyAuthorization(authorization_id);
    const target = data?.redirect_url ?? data?.redirect_to;
    if (error || !target) {
      setBusy(false);
      setError(error?.message ?? "لم يُرجع الخادم رابط المتابعة.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main dir="rtl" className="grid min-h-screen place-items-center bg-background px-4">
      <div className="panel w-full max-w-md p-7 text-center">
        <h1 className="font-display text-xl font-bold">ربط {name} بحسابك في تدقيق</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">سيتمكن {name} من قراءة فترات الفواتير والفروع في مساحة عملك نيابةً عنك.</p>
        {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
        <div className="mt-6 flex gap-3">
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>موافقة</Button>
          <Button className="flex-1" variant="outline" disabled={busy} onClick={() => decide(false)}>رفض</Button>
        </div>
      </div>
    </main>
  );
}
