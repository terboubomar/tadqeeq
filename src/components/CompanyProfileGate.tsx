import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { useCompanyProfileStatus } from "@/hooks/use-company-profile-status";

/** Sends the owner of a new workspace to /onboarding until the company details are saved. */
export function CompanyProfileGate({ children }: { children: ReactNode }) {
  const status = useCompanyProfileStatus();
  const navigate = useNavigate();
  useEffect(() => {
    if (status === "required") void navigate({ to: "/onboarding", replace: true });
  }, [status, navigate]);
  if (status !== "ok") return <div className="min-h-[100dvh] bg-background" aria-busy="true" />;
  return <>{children}</>;
}
