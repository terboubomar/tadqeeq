/**
 * The executive dashboard's combined view: several companies and platforms added together for one month.
 *
 * Read-only reporting on stored period summaries, like the trends report (report-trends): it adds figures the
 * engine already produced, with the same platform-cost definition, and never recalculates a period.
 */
import { isTrialStatus, resolvePlanAccess, type PlanFeature } from "./plans";
import { buildTrendMonths, periodMonth, sumFigures, type TrendFigures, type TrendPlatform } from "./report-trends";
import type { StoredPeriod } from "./periods";
import { ROLE_PERMISSIONS, roleHasGlobalBranchAccess, type WorkspaceRole } from "./workspace-access";

export const COMBINED_PLATFORMS: TrendPlatform[] = ["hungerstation", "keeta", "jahez"];

export interface CombinedCompany {
  id: string;
  name: string;
  /** The company the person is working in now. */
  current: boolean;
}

/** A company the person belongs to that stays out of the totals, and why. */
export interface ExcludedCompany {
  name: string;
  reason: string;
}

/** A saved period with only what the combined view reads. */
export type CombinedPeriod = Pick<StoredPeriod, "id" | "label" | "platform" | "period_start" | "period_end" | "created_at" | "summary"> & {
  workspaceId: string;
};

export interface CombinedDashboardData {
  companies: CombinedCompany[];
  excluded: ExcludedCompany[];
  periods: CombinedPeriod[];
}

/**
 * Whether a company's figures can join the totals: the role must read periods across every branch (owner, admin,
 * auditor, viewer), the plan must include reports, and the company must be active or on its trial, the same rules
 * the company's own dashboard applies. A branch-limited role would make the totals partial, so it stays out.
 */
export function combinedAccess(input: {
  role: WorkspaceRole;
  onboardingStatus: string;
  isPlatformAdmin: boolean;
  planFeatures: readonly PlanFeature[] | null;
}): { included: true } | { included: false; reason: string } {
  if (!roleHasGlobalBranchAccess(input.role)) return { included: false, reason: "صلاحيتك فيها محدودة بفروع معيّنة" };
  const access = resolvePlanAccess({
    rolePermissions: ROLE_PERMISSIONS[input.role],
    onboardingStatus: input.onboardingStatus,
    isPlatformAdmin: input.isPlatformAdmin,
    planFeatures: input.planFeatures,
    uploadLimit: null,
    uploadsThisMonth: 0,
    trialUploads: 0,
  });
  if (input.onboardingStatus !== "active" && !isTrialStatus(input.onboardingStatus) && !input.isPlatformAdmin) {
    return { included: false, reason: "الحساب موقوف" };
  }
  if (!access.permissions.includes("periods.read")) return { included: false, reason: "التقارير غير متاحة لدورك أو باقتك" };
  return { included: true };
}

export type CompanyScope = "all" | string;
export type PlatformScope = "all" | TrendPlatform;

export interface CombinedRow {
  key: string;
  label: string;
  figures: TrendFigures;
}

export interface CombinedView {
  /** "YYYY-MM" shown; null when the scope has no periods at all. */
  month: string | null;
  /** Months with data in scope, newest first, for the month picker. */
  months: string[];
  total: TrendFigures;
  previous: TrendFigures | null;
  previousMonth: string | null;
  byCompany: CombinedRow[];
  byPlatform: CombinedRow[];
  /** The last six months with data in scope (oldest first), for the chart. */
  series: { month: string; figures: TrendFigures }[];
  /** Company and platform pairs with periods in earlier months but none in this one, so the total may be short. */
  missing: { company: string; platform: TrendPlatform }[];
}

/** The combined figures for one month of the chosen companies and platforms. */
export function buildCombinedView(
  data: CombinedDashboardData,
  scope: { company: CompanyScope; platform: PlatformScope; month?: string | null },
): CombinedView {
  const companies = data.companies.filter((c) => scope.company === "all" || c.id === scope.company);
  const ids = new Set(companies.map((c) => c.id));
  const inScope = data.periods.filter((p) => ids.has(p.workspaceId) && (scope.platform === "all" || p.platform === scope.platform));
  const asStored = (list: CombinedPeriod[]) => list as unknown as StoredPeriod[];

  const allMonths = buildTrendMonths(asStored(inScope));
  const months = allMonths.map((m) => m.month).reverse();
  const month = scope.month && months.includes(scope.month) ? scope.month : (months[0] ?? null);
  const index = allMonths.findIndex((m) => m.month === month);
  const current = index >= 0 ? allMonths[index]! : null;
  const before = index > 0 ? allMonths[index - 1]! : null;

  const inMonth = (p: CombinedPeriod) => month !== null && periodMonth(p) === month;
  const monthPeriods = inScope.filter(inMonth);

  const byCompany = companies
    .map((c) => ({
      key: c.id,
      label: c.name,
      figures: sumFigures(buildTrendMonths(asStored(monthPeriods.filter((p) => p.workspaceId === c.id))).map((m) => m.total)),
    }))
    .filter((row) => row.figures.periods > 0)
    .sort((a, b) => b.figures.grossSales - a.figures.grossSales);

  const byPlatform = COMBINED_PLATFORMS.map((platform) => ({
    key: platform,
    label: platform,
    figures: sumFigures([current?.byPlatform[platform]]),
  }))
    .filter((row) => row.figures.periods > 0)
    .sort((a, b) => b.figures.grossSales - a.figures.grossSales);

  const missing: CombinedView["missing"] = [];
  if (month) {
    for (const company of companies) {
      for (const platform of COMBINED_PLATFORMS) {
        const own = inScope.filter((p) => p.workspaceId === company.id && p.platform === platform);
        if (own.some((p) => periodMonth(p) < month) && !own.some(inMonth)) missing.push({ company: company.name, platform });
      }
    }
  }

  return {
    month,
    months,
    total: sumFigures([current?.total]),
    previous: before ? before.total : null,
    previousMonth: before?.month ?? null,
    byCompany,
    byPlatform,
    series: allMonths.slice(Math.max(0, index - 5), index + 1).map((m) => ({ month: m.month, figures: m.total })),
    missing,
  };
}
