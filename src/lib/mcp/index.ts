import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listPeriods from "./tools/list-periods";
import getPeriodSummary from "./tools/get-period-summary";
import listBranches from "./tools/list-branches";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "tadqeeq",
  title: "Tadqeeq",
  version: "0.1.0",
  instructions:
    "Read-only access to the caller's Tadqeeq workspace: delivery-platform invoice periods (HungerStation, Keeta, Jahez), their summaries, and branches. Use list_periods first, then get_period_summary.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listPeriods, getPeriodSummary, listBranches],
});
