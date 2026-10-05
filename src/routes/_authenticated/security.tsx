import { createFileRoute } from "@tanstack/react-router";

import { TwoFactorSettings } from "@/components/TwoFactor";

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({ meta: [{ title: "أمان الحساب · تدقيق" }] }),
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">أمان الحساب</h1>
        <p className="mt-1 text-sm text-muted-foreground">إعدادات تسجيل الدخول لحسابك أنت، ولا تؤثر على بقية مستخدمي الشركة.</p>
      </div>
      <TwoFactorSettings />
    </div>
  );
}
