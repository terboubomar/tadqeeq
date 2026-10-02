import { roundMoney } from "../analysis/parse";
import type { ParsedAdsReport, ParsedOrdersReport, StoreOrderStats } from "./reports";

/**
 * True profit of HungerStation ads. Amounts in the reports include VAT, and ad sales
 * ("Total GMV") are taken at menu price, before the restaurant's own discount, the same
 * basis as the orders report's "Subtotal".
 *
 * Every cost is a share of each SAR of ad sales:
 *   your discount      restaurant-funded discounts and vouchers ÷ subtotal
 *   VAT                (1 − discount) × 15/115 (VAT is due on what the customer paid)
 *   commission, payment fee, delivery offer (Operational Charges), other platform fees ÷ subtotal
 *   food cost          food cost % × 1/1.15 (a share of the menu price before VAT)
 *   kept               what is left to cover the ad
 *
 *   profit after the ad = ad sales × kept − ad spend
 *   break-even ROAS     = 1 ÷ kept
 *
 * With the orders report each branch uses its own actual shares (or its brand's average when
 * the branch is not in the orders report). Without it only VAT, commission (brand setting,
 * else 15%) and food cost are known; discounts and fees are then left out and the page says so.
 */

export const VAT_RATE = 0.15;
export const DEFAULT_COMMISSION_RATE = 0.15;
/** A campaign with ROAS under this multiple of its break-even is "thin": profitable, but barely. */
export const THIN_MARGIN_MULTIPLE = 2;
/** Cost per click this many times the overall average counts as expensive. */
export const HIGH_CPC_MULTIPLE = 1.5;

export interface BrandSetting {
  /** Fraction, e.g. 0.15. */
  commissionRate: number | null;
  /** Fraction of the price before VAT, e.g. 0.3. */
  foodCostRate: number | null;
}

export type BrandSettings = Record<string, BrandSetting>;

export type CampaignStatus = "loss" | "thin" | "profit";
export type CampaignAction = "stop" | "lower_bid" | "watch" | "keep";
/** Where a branch's cost shares come from. */
export type CostSource = "orders" | "brand_orders" | "settings" | "default";

/** Shares of one SAR of ad sales. They add up to 1. */
export interface CostShares {
  discount: number;
  vat: number;
  commission: number;
  paymentFee: number;
  deliveryOffer: number;
  otherFees: number;
  foodCost: number;
  kept: number;
}

export interface CampaignResult {
  key: string;
  restaurantId: string;
  branchName: string;
  brand: string;
  campaignId: string;
  clicks: number;
  orders: number | null;
  /** Some days gave one order count for several campaigns; their share was estimated from sales. */
  ordersEstimated: boolean;
  gmv: number;
  spent: number;
  cpc: number | null;
  roas: number | null;
  platformRoas: number | null;
  breakEvenRoas: number | null;
  profit: number;
  status: CampaignStatus;
  action: CampaignAction;
  expensiveClicks: boolean;
}

export interface BranchResult {
  restaurantId: string;
  branchName: string;
  brand: string;
  campaigns: number;
  clicks: number;
  orders: number;
  gmv: number;
  spent: number;
  costPerOrder: number | null;
  roas: number | null;
  breakEvenRoas: number | null;
  profit: number;
  costs: CostShares;
  costSource: CostSource;
}

export interface BrandResult {
  brand: string;
  costs: CostShares;
  costSource: CostSource;
  /** Commission share; editable on the page unless it comes from the orders report. */
  commissionRate: number;
  foodCostRate: number | null;
  keptPerSar: number;
  breakEvenRoas: number | null;
}

export interface BudgetShift {
  restaurantId: string;
  branchName: string;
  weak: CampaignResult;
  strong: CampaignResult;
}

export interface AdsRoiTotals {
  spent: number;
  gmv: number;
  orders: number;
  clicks: number;
  cpc: number | null;
  costPerOrder: number | null;
  clickToOrder: number | null;
  roas: number | null;
  profit: number;
}

export interface AdsRoiNotes {
  platformRoasMismatches: number;
  campaignsWithPlatformRoas: number;
  ordersNotSplit: string[];
  ordersMissing: string[];
  packedRows: number;
  defaultCommissionBrands: string[];
  missingFoodCostBrands: string[];
  /** The orders report was uploaded: discounts, payment fees and the delivery offer are counted. */
  ordersIncluded: boolean;
  /** Branches with ads but no orders in the orders report (they use their brand's average or the settings). */
  branchesWithoutOrders: string[];
  /** The orders report covers different days than the ads report. */
  ordersPeriodDiffers: boolean;
}

export interface AdsRoiResult {
  dateFrom: string;
  dateTo: string;
  days: number;
  totals: AdsRoiTotals;
  verdict: Record<CampaignStatus, { campaigns: number; spent: number; profit: number }>;
  campaigns: CampaignResult[];
  branches: BranchResult[];
  brands: BrandResult[];
  shifts: BudgetShift[];
  notes: AdsRoiNotes;
}

function ratio(numerator: number, denominator: number, decimals = 2): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return roundMoney(numerator / denominator, decimals);
}

/** "PAST - Uhud" → "PAST"; brands are compared case-insensitively. */
export function brandKey(outletName: string): string {
  const brand = outletName.split(/\s+-\s+/)[0] ?? outletName;
  return brand.trim().toUpperCase();
}

export function displayBranchName(outletName: string): string {
  return outletName.replace(/\s+-\s+/, " · ").trim();
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000) + 1;
}

interface PlatformShares {
  discount: number;
  commission: number;
  paymentFee: number;
  deliveryOffer: number;
  otherFees: number;
}

/** Platform shares from orders-report totals (one store or several added together). */
function sharesFromOrders(stats: StoreOrderStats[]): PlatformShares | null {
  const subtotal = stats.reduce((sum, store) => sum + store.subtotal, 0);
  if (subtotal <= 0) return null;
  const share = (pick: (store: StoreOrderStats) => number) => stats.reduce((sum, store) => sum + pick(store), 0) / subtotal;
  return {
    discount: share((store) => store.restaurantDiscounts),
    commission: share((store) => store.commission),
    paymentFee: share((store) => store.paymentFees ?? 0),
    deliveryOffer: share((store) => store.operationalCharges),
    otherFees: share((store) => store.otherFees ?? 0),
  };
}

export function costShares(platform: PlatformShares, foodCostRate: number | null): CostShares {
  const vat = ((1 - platform.discount) * VAT_RATE) / (1 + VAT_RATE);
  const foodCost = (foodCostRate ?? 0) / (1 + VAT_RATE);
  const kept =
    1 - platform.discount - vat - platform.commission - platform.paymentFee - platform.deliveryOffer - platform.otherFees - foodCost;
  return { ...platform, vat, foodCost, kept };
}

function breakEven(kept: number): number | null {
  return kept > 0 ? roundMoney(1 / kept) : null;
}

export function analyzeAdsRoi(input: {
  report: ParsedAdsReport;
  settings?: BrandSettings;
  orders?: ParsedOrdersReport | null;
}): AdsRoiResult {
  const { report } = input;
  const settings = input.settings ?? {};
  const orderStores = input.orders?.stores ?? [];
  const storeStats = new Map<string, StoreOrderStats>(orderStores.map((store) => [store.storeId, store]));

  // Brand display names: the most common spelling in the report.
  const spellings = new Map<string, Map<string, number>>();
  for (const row of report.branchDays) {
    const key = brandKey(row.outletName);
    const raw = (row.outletName.split(/\s+-\s+/)[0] ?? row.outletName).trim();
    const counts = spellings.get(key) ?? new Map<string, number>();
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
    spellings.set(key, counts);
  }
  const brandName = (key: string) =>
    [...(spellings.get(key) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? key;

  // Platform shares: per store from the orders report, else the brand's average there, else settings.
  const brandOrderShares = new Map<string, PlatformShares | null>();
  const brandSharesFromOrders = (brand: string) => {
    if (!brandOrderShares.has(brand)) {
      brandOrderShares.set(brand, sharesFromOrders(orderStores.filter((store) => brandKey(store.outletName) === brand)));
    }
    return brandOrderShares.get(brand) ?? null;
  };
  const settingsShares = (brand: string): { shares: PlatformShares; source: CostSource } => {
    const commission = settings[brand]?.commissionRate;
    return {
      shares: { discount: 0, commission: commission ?? DEFAULT_COMMISSION_RATE, paymentFee: 0, deliveryOffer: 0, otherFees: 0 },
      source: commission != null ? "settings" : "default",
    };
  };
  const branchCosts = (brand: string, restaurantId: string): { costs: CostShares; source: CostSource } => {
    const food = settings[brand]?.foodCostRate ?? null;
    const store = storeStats.get(restaurantId);
    const own = store ? sharesFromOrders([store]) : null;
    if (own) return { costs: costShares(own, food), source: "orders" };
    const fromBrand = brandSharesFromOrders(brand);
    if (fromBrand) return { costs: costShares(fromBrand, food), source: "brand_orders" };
    const fallback = settingsShares(brand);
    return { costs: costShares(fallback.shares, food), source: fallback.source };
  };

  // Aggregate campaigns over all days in the report.
  interface Acc {
    clicks: number;
    orders: number | null;
    gmv: number;
    spent: number;
    platformWeight: number;
    platformRoasWeighted: number;
    outletName: string;
    restaurantId: string;
    campaignId: string;
    ordersEstimated: boolean;
  }
  // Days where the report gave one order count for several campaigns: share it by sales.
  const dayKey = (date: string, restaurantId: string) => date + "|" + restaurantId;
  const branchDayOrders = new Map(report.branchDays.map((day) => [dayKey(day.date, day.restaurantId), day.orders]));
  const branchDayGmv = new Map<string, number>();
  for (const day of report.campaigns) {
    const key = dayKey(day.date, day.restaurantId);
    branchDayGmv.set(key, (branchDayGmv.get(key) ?? 0) + day.gmv);
  }

  const campaignAcc = new Map<string, Acc>();
  for (const day of report.campaigns) {
    const key = day.restaurantId + "|" + day.campaignId;
    const acc = campaignAcc.get(key) ?? {
      clicks: 0,
      orders: 0,
      gmv: 0,
      spent: 0,
      platformWeight: 0,
      platformRoasWeighted: 0,
      outletName: day.outletName,
      restaurantId: day.restaurantId,
      campaignId: day.campaignId,
      ordersEstimated: false,
    };
    acc.clicks += day.clicks;
    if (day.orders == null) {
      const key = dayKey(day.date, day.restaurantId);
      const dayGmv = branchDayGmv.get(key) ?? 0;
      acc.orders = (acc.orders ?? 0) + (dayGmv > 0 ? ((branchDayOrders.get(key) ?? 0) * day.gmv) / dayGmv : 0);
      acc.ordersEstimated = true;
    } else {
      acc.orders = (acc.orders ?? 0) + day.orders;
    }
    acc.gmv = roundMoney(acc.gmv + day.gmv);
    acc.spent = roundMoney(acc.spent + day.spent);
    if (day.platformRoas != null) {
      acc.platformWeight += day.spent;
      acc.platformRoasWeighted += day.platformRoas * day.spent;
    }
    campaignAcc.set(key, acc);
  }

  const branchOrders = new Map<string, number>();
  for (const day of report.branchDays) {
    branchOrders.set(day.restaurantId, (branchOrders.get(day.restaurantId) ?? 0) + day.orders);
  }

  const totalsClicks = [...campaignAcc.values()].reduce((sum, acc) => sum + acc.clicks, 0);
  const totalsSpent = roundMoney([...campaignAcc.values()].reduce((sum, acc) => sum + acc.spent, 0));
  const averageCpc = totalsClicks > 0 ? totalsSpent / totalsClicks : null;

  const branchCostCache = new Map<string, { costs: CostShares; source: CostSource }>();
  const costsFor = (brand: string, restaurantId: string) => {
    const cached = branchCostCache.get(restaurantId);
    if (cached) return cached;
    const next = branchCosts(brand, restaurantId);
    branchCostCache.set(restaurantId, next);
    return next;
  };

  const campaigns: CampaignResult[] = [...campaignAcc.entries()].map(([key, acc]) => {
    const brand = brandKey(acc.outletName);
    const { costs } = costsFor(brand, acc.restaurantId);
    const profit = roundMoney(acc.gmv * costs.kept - acc.spent);
    const roas = ratio(acc.gmv, acc.spent);
    const breakEvenRoas = breakEven(costs.kept);
    const cpc = ratio(acc.spent, acc.clicks);
    const expensiveClicks = cpc != null && averageCpc != null && cpc >= averageCpc * HIGH_CPC_MULTIPLE;
    const status: CampaignStatus =
      profit < 0 || breakEvenRoas == null
        ? "loss"
        : roas != null && roas < breakEvenRoas * THIN_MARGIN_MULTIPLE
          ? "thin"
          : "profit";
    const action: CampaignAction =
      status === "loss" ? "stop" : status === "thin" ? (expensiveClicks ? "lower_bid" : "watch") : "keep";
    return {
      key,
      restaurantId: acc.restaurantId,
      branchName: displayBranchName(acc.outletName),
      brand: brandName(brand),
      campaignId: acc.campaignId,
      clicks: acc.clicks,
      orders: acc.orders == null ? null : Math.round(acc.orders),
      ordersEstimated: acc.ordersEstimated,
      gmv: acc.gmv,
      spent: acc.spent,
      cpc,
      roas,
      platformRoas: acc.platformWeight > 0 ? roundMoney(acc.platformRoasWeighted / acc.platformWeight, 4) : null,
      breakEvenRoas,
      profit,
      status,
      action,
      expensiveClicks,
    };
  });
  campaigns.sort((a, b) => a.profit - b.profit || b.spent - a.spent);

  const branchMap = new Map<string, BranchResult>();
  for (const campaign of campaigns) {
    const existing = branchMap.get(campaign.restaurantId);
    if (existing) {
      existing.campaigns += 1;
      existing.clicks += campaign.clicks;
      existing.gmv = roundMoney(existing.gmv + campaign.gmv);
      existing.spent = roundMoney(existing.spent + campaign.spent);
      existing.profit = roundMoney(existing.profit + campaign.profit);
      continue;
    }
    const { costs, source } = costsFor(brandKey(campaign.brand), campaign.restaurantId);
    branchMap.set(campaign.restaurantId, {
      restaurantId: campaign.restaurantId,
      branchName: campaign.branchName,
      brand: campaign.brand,
      campaigns: 1,
      clicks: campaign.clicks,
      orders: branchOrders.get(campaign.restaurantId) ?? 0,
      gmv: campaign.gmv,
      spent: campaign.spent,
      costPerOrder: null,
      roas: null,
      breakEvenRoas: breakEven(costs.kept),
      profit: campaign.profit,
      costs,
      costSource: source,
    });
  }
  const branches = [...branchMap.values()].map((branch) => ({
    ...branch,
    costPerOrder: ratio(branch.spent, branch.orders),
    roas: ratio(branch.gmv, branch.spent),
  }));
  branches.sort((a, b) => a.profit - b.profit);

  // A brand's shares: its branches weighted by ad sales.
  const brandKeys = [...new Set(campaigns.map((campaign) => brandKey(campaign.brand)))].sort();
  const brands: BrandResult[] = brandKeys.map((key) => {
    const own = branches.filter((branch) => brandKey(branch.brand) === key);
    const weight = own.reduce((sum, branch) => sum + branch.gmv, 0);
    const average = (pick: (costs: CostShares) => number) =>
      weight > 0
        ? own.reduce((sum, branch) => sum + pick(branch.costs) * branch.gmv, 0) / weight
        : own.reduce((sum, branch) => sum + pick(branch.costs), 0) / Math.max(own.length, 1);
    const costs: CostShares = {
      discount: average((c) => c.discount),
      vat: average((c) => c.vat),
      commission: average((c) => c.commission),
      paymentFee: average((c) => c.paymentFee),
      deliveryOffer: average((c) => c.deliveryOffer),
      otherFees: average((c) => c.otherFees),
      foodCost: average((c) => c.foodCost),
      kept: average((c) => c.kept),
    };
    const sources = new Set(own.map((branch) => branch.costSource));
    const costSource: CostSource = sources.has("orders")
      ? "orders"
      : sources.has("brand_orders")
        ? "brand_orders"
        : sources.has("settings")
          ? "settings"
          : "default";
    return {
      brand: brandName(key),
      costs,
      costSource,
      commissionRate: costs.commission,
      foodCostRate: settings[key]?.foodCostRate ?? null,
      keptPerSar: roundMoney(costs.kept, 4),
      breakEvenRoas: breakEven(costs.kept),
    };
  });

  const shifts: BudgetShift[] = [];
  for (const branch of branches) {
    const own = campaigns.filter((campaign) => campaign.restaurantId === branch.restaurantId && campaign.roas != null);
    if (own.length < 2) continue;
    const sorted = [...own].sort((a, b) => (a.roas ?? 0) - (b.roas ?? 0));
    const weak = sorted[0]!;
    const strong = sorted[sorted.length - 1]!;
    const weakEnough = weak.status !== "profit" || (weak.roas ?? 0) < (strong.roas ?? 0) / 3;
    if (weak.spent > strong.spent && weakEnough) {
      shifts.push({ restaurantId: branch.restaurantId, branchName: branch.branchName, weak, strong });
    }
  }

  shifts.sort((a, b) => b.weak.spent - a.weak.spent);

  const gmv = roundMoney(campaigns.reduce((sum, campaign) => sum + campaign.gmv, 0));
  const orders = report.branchDays.reduce((sum, day) => sum + day.orders, 0);
  const profit = roundMoney(campaigns.reduce((sum, campaign) => sum + campaign.profit, 0));

  const verdict = (["loss", "thin", "profit"] as const).reduce(
    (acc, status) => {
      const subset = campaigns.filter((campaign) => campaign.status === status);
      acc[status] = {
        campaigns: subset.length,
        spent: roundMoney(subset.reduce((sum, campaign) => sum + campaign.spent, 0)),
        profit: roundMoney(subset.reduce((sum, campaign) => sum + campaign.profit, 0)),
      };
      return acc;
    },
    {} as AdsRoiResult["verdict"],
  );

  const withPlatformRoas = campaigns.filter((campaign) => campaign.platformRoas != null && campaign.roas != null);
  const mismatches = withPlatformRoas.filter(
    (campaign) => Math.abs((campaign.platformRoas ?? 0) - (campaign.roas ?? 0)) > Math.max(0.01, (campaign.roas ?? 0) * 0.01),
  );
  const outletsWith = (kind: "orders_not_split" | "orders_missing") => [
    ...new Set(report.notes.filter((note) => note.kind === kind).map((note) => displayBranchName(note.outletName))),
  ];
  const ordersIncluded = orderStores.length > 0;

  return {
    dateFrom: report.dateFrom,
    dateTo: report.dateTo,
    days: daysBetween(report.dateFrom, report.dateTo),
    totals: {
      spent: totalsSpent,
      gmv,
      orders,
      clicks: totalsClicks,
      cpc: ratio(totalsSpent, totalsClicks),
      costPerOrder: ratio(totalsSpent, orders),
      clickToOrder: ratio(orders, totalsClicks, 4),
      roas: ratio(gmv, totalsSpent),
      profit,
    },
    verdict,
    campaigns,
    branches,
    brands,
    shifts,
    notes: {
      platformRoasMismatches: mismatches.length,
      campaignsWithPlatformRoas: withPlatformRoas.length,
      ordersNotSplit: outletsWith("orders_not_split"),
      ordersMissing: outletsWith("orders_missing"),
      packedRows: report.packedRows,
      defaultCommissionBrands: brands.filter((brand) => brand.costSource === "default").map((brand) => brand.brand),
      missingFoodCostBrands: brands.filter((brand) => brand.foodCostRate == null).map((brand) => brand.brand),
      ordersIncluded,
      branchesWithoutOrders: ordersIncluded
        ? branches.filter((branch) => branch.costSource !== "orders").map((branch) => branch.branchName)
        : [],
      ordersPeriodDiffers:
        ordersIncluded &&
        Boolean(input.orders?.dateFrom) &&
        (input.orders?.dateFrom !== report.dateFrom || input.orders?.dateTo !== report.dateTo),
    },
  };
}
