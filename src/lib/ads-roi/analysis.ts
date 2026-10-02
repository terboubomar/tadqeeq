import { roundMoney } from "../analysis/parse";
import type { ParsedAdsReport, ParsedOrdersReport, StoreOrderStats } from "./reports";

/**
 * True profit of HungerStation ads. Amounts in the reports include VAT.
 *
 *   kept per 1 SAR of ad sales = 1/1.15 − commission − food cost/1.15
 *   profit = ad sales × kept − delivery offer per order × ad orders − ad spend
 *   break-even ROAS = 1 ÷ (kept − delivery offer per order ÷ average order)
 *
 * Commission comes from the orders report when it is uploaded (actual commission ÷ subtotal
 * per store), otherwise from the brand's setting, otherwise 15%. Food cost is the brand's
 * setting; without it the profit is "before food cost". The delivery offer (HungerStation
 * "Operational Charges") is only known from the orders report.
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
export type RateSource = "orders" | "settings" | "default";

export interface CampaignResult {
  key: string;
  restaurantId: string;
  branchName: string;
  brand: string;
  campaignId: string;
  clicks: number;
  orders: number | null;
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
  commissionRate: number;
  commissionSource: RateSource;
  deliveryOfferPerOrder: number | null;
}

export interface BrandResult {
  brand: string;
  commissionRate: number;
  commissionSource: RateSource;
  foodCostRate: number | null;
  /** Share of each SAR of ad sales left before the delivery offer and ad spend. */
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
  deliveryOfferIncluded: boolean;
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

function keptPerSar(commissionRate: number, foodCostRate: number | null): number {
  return 1 / (1 + VAT_RATE) - commissionRate - (foodCostRate ?? 0) / (1 + VAT_RATE);
}

function breakEven(kept: number, deliveryPerOrder: number | null, averageOrder: number | null): number | null {
  const perSar = kept - (deliveryPerOrder && averageOrder ? deliveryPerOrder / averageOrder : 0);
  return perSar > 0 ? roundMoney(1 / perSar) : null;
}

export function analyzeAdsRoi(input: {
  report: ParsedAdsReport;
  settings?: BrandSettings;
  orders?: ParsedOrdersReport | null;
}): AdsRoiResult {
  const { report } = input;
  const settings = input.settings ?? {};
  const storeStats = new Map<string, StoreOrderStats>((input.orders?.stores ?? []).map((store) => [store.storeId, store]));

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

  // Aggregate campaigns and branches over all days in the report.
  interface Acc { clicks: number; orders: number | null; gmv: number; spent: number; platformWeight: number; platformRoasWeighted: number; outletName: string; restaurantId: string; campaignId: string }
  const campaignAcc = new Map<string, Acc>();
  for (const day of report.campaigns) {
    const key = day.restaurantId + "|" + day.campaignId;
    const acc = campaignAcc.get(key) ?? {
      clicks: 0, orders: 0, gmv: 0, spent: 0, platformWeight: 0, platformRoasWeighted: 0,
      outletName: day.outletName, restaurantId: day.restaurantId, campaignId: day.campaignId,
    };
    acc.clicks += day.clicks;
    acc.orders = acc.orders == null || day.orders == null ? null : acc.orders + day.orders;
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
  const branchGmv = new Map<string, number>();
  for (const acc of campaignAcc.values()) {
    branchGmv.set(acc.restaurantId, (branchGmv.get(acc.restaurantId) ?? 0) + acc.gmv);
  }

  const brandRate = (brand: string, restaurantId: string): { rate: number; source: RateSource } => {
    const stats = storeStats.get(restaurantId);
    if (stats && stats.subtotal > 0) return { rate: stats.commission / stats.subtotal, source: "orders" };
    const setting = settings[brand]?.commissionRate;
    if (setting != null) return { rate: setting, source: "settings" };
    return { rate: DEFAULT_COMMISSION_RATE, source: "default" };
  };
  const deliveryPerOrder = (restaurantId: string): number | null => {
    const stats = storeStats.get(restaurantId);
    return stats && stats.orders > 0 ? stats.operationalCharges / stats.orders : null;
  };

  const totalsClicks = [...campaignAcc.values()].reduce((sum, acc) => sum + acc.clicks, 0);
  const totalsSpent = roundMoney([...campaignAcc.values()].reduce((sum, acc) => sum + acc.spent, 0));
  const averageCpc = totalsClicks > 0 ? totalsSpent / totalsClicks : null;

  const campaigns: CampaignResult[] = [...campaignAcc.entries()].map(([key, acc]) => {
    const brand = brandKey(acc.outletName);
    const { rate } = brandRate(brand, acc.restaurantId);
    const food = settings[brand]?.foodCostRate ?? null;
    const kept = keptPerSar(rate, food);
    const delivery = deliveryPerOrder(acc.restaurantId);
    const branchTotalOrders = branchOrders.get(acc.restaurantId) ?? 0;
    const branchTotalGmv = branchGmv.get(acc.restaurantId) ?? 0;
    // Orders the report did not split per campaign are shared by sales.
    const orders = acc.orders ?? (branchTotalGmv > 0 ? (branchTotalOrders * acc.gmv) / branchTotalGmv : 0);
    const averageOrder = orders > 0 ? acc.gmv / orders : branchTotalOrders > 0 ? branchTotalGmv / branchTotalOrders : null;
    const profit = roundMoney(acc.gmv * kept - (delivery ?? 0) * orders - acc.spent);
    const roas = ratio(acc.gmv, acc.spent);
    const breakEvenRoas = breakEven(kept, delivery, averageOrder);
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
      orders: acc.orders,
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
    const brand = brandKey(campaign.branchName.split(" · ")[0] ?? campaign.branchName);
    const commission = brandRate(brand, campaign.restaurantId);
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
      breakEvenRoas: null,
      profit: campaign.profit,
      commissionRate: commission.rate,
      commissionSource: commission.source,
      deliveryOfferPerOrder: deliveryPerOrder(campaign.restaurantId),
    });
  }
  const branches = [...branchMap.values()].map((branch) => {
    const food = settings[brandKey(branch.brand)]?.foodCostRate ?? null;
    return {
      ...branch,
      costPerOrder: ratio(branch.spent, branch.orders),
      roas: ratio(branch.gmv, branch.spent),
      breakEvenRoas: breakEven(
        keptPerSar(branch.commissionRate, food),
        branch.deliveryOfferPerOrder,
        branch.orders > 0 ? branch.gmv / branch.orders : null,
      ),
    };
  });
  branches.sort((a, b) => a.profit - b.profit);

  const brandKeys = [...new Set(campaigns.map((campaign) => brandKey(campaign.brand)))].sort();
  const brands: BrandResult[] = brandKeys.map((key) => {
    const setting = settings[key];
    const fromOrders = branches.filter((branch) => brandKey(branch.brand) === key && branch.commissionSource === "orders");
    const commission: { rate: number; source: RateSource } =
      fromOrders.length > 0
        ? { rate: fromOrders.reduce((sum, branch) => sum + branch.commissionRate, 0) / fromOrders.length, source: "orders" }
        : setting?.commissionRate != null
          ? { rate: setting.commissionRate, source: "settings" }
          : { rate: DEFAULT_COMMISSION_RATE, source: "default" };
    const foodCostRate = setting?.foodCostRate ?? null;
    const kept = keptPerSar(commission.rate, foodCostRate);
    return {
      brand: brandName(key),
      commissionRate: commission.rate,
      commissionSource: commission.source,
      foodCostRate,
      keptPerSar: roundMoney(kept, 4),
      breakEvenRoas: breakEven(kept, null, null),
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
  const outletsWith = (kind: "orders_not_split" | "orders_missing") =>
    [...new Set(report.notes.filter((note) => note.kind === kind).map((note) => displayBranchName(note.outletName)))];

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
      defaultCommissionBrands: brands.filter((brand) => brand.commissionSource === "default").map((brand) => brand.brand),
      missingFoodCostBrands: brands.filter((brand) => brand.foodCostRate == null).map((brand) => brand.brand),
      deliveryOfferIncluded: storeStats.size > 0,
    },
  };
}
