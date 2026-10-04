import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getAccount from "./tools/get-account";
import startAudit from "./tools/start-audit";
import getAuditResult from "./tools/get-audit-result";
import listPeriods from "./tools/list-periods";
import getPeriodSummary from "./tools/get-period-summary";
import getBranchPerformance from "./tools/get-branch-performance";
import listExceptions from "./tools/list-exceptions";
import listBranches from "./tools/list-branches";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "tadqeeq",
  title: "Tadqeeq",
  version: "0.2.0",
  instructions: [
    "Tadqeeq audits delivery-platform invoices (HungerStation, Keeta, Jahez) for Saudi restaurants. Answer in the user's language (usually Arabic).",
    "To audit new files: ask for the platform (and for HungerStation the card fee %), call start_audit, give the user the upload_url, and when they say they are done call get_audit_result.",
    "For past audits: list_periods, then get_period_summary, get_branch_performance or list_exceptions.",
    "All money values are SAR from Tadqeeq's accounting engine. Explain them; never recalculate or invent numbers.",
    "Available on the الشاملة plan, or with the add-on on any plan. If a tool says the plan does not include it, or returns nothing, call get_account and tell the user.",
  ].join(" "),
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getAccount, startAudit, getAuditResult, listPeriods, getPeriodSummary, getBranchPerformance, listExceptions, listBranches],
});
