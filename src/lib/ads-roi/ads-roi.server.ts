import { roundMoney } from "../analysis/parse";
import { requireWorkspacePermission } from "../server-auth.server";
import type { BrandSettings } from "./analysis";
import type { ParsedAdsReport, ParsedOrdersReport } from "./reports";

/**
 * Saved ads analyses (migration 0033). Only the figures read from the reports are stored;
 * results are recalculated from them, so a change to brand settings applies to old days too.
 * Tables are not in the generated Supabase types yet (see Phase 9), hence the loose client.
 */

export interface AdsRoiAnalysisSummary {
  id: string;
  dateFrom: string;
  dateTo: string;
  sourceFileName: string | null;
  ordersFileName: string | null;
  hasOrders: boolean;
  spent: number;
  gmv: number;
  updatedAt: string;
}

export interface AdsRoiAnalysisRecord extends AdsRoiAnalysisSummary {
  report: ParsedAdsReport;
  orders: ParsedOrdersReport | null;
}

interface AnalysisRow {
  id: string;
  date_from: string;
  date_to: string;
  source_file_name: string | null;
  orders_file_name: string | null;
  orders?: ParsedOrdersReport | null;
  spent: number | string;
  gmv: number | string;
  updated_at: string;
  report?: ParsedAdsReport;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any };

const SUMMARY_COLUMNS = "id,date_from,date_to,source_file_name,orders_file_name,spent,gmv,updated_at";

const TABLE_MISSING = "ميزة حفظ تحليلات الإعلانات تحتاج تحديث قاعدة البيانات (migration 0033).";

function tableError(error: { code?: string; message: string }): Error {
  if (error.code === "42P01" || (/ads_roi_/.test(error.message) && /does not exist|schema cache/i.test(error.message))) {
    return new Error(TABLE_MISSING);
  }
  return new Error(error.message);
}

function summary(row: AnalysisRow): AdsRoiAnalysisSummary {
  return {
    id: row.id,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    sourceFileName: row.source_file_name,
    ordersFileName: row.orders_file_name,
    hasOrders: row.orders_file_name != null,
    spent: Number(row.spent),
    gmv: Number(row.gmv),
    updatedAt: row.updated_at,
  };
}

export async function listAdsRoiAnalysesOnServer(): Promise<AdsRoiAnalysisSummary[]> {
  const { client, workspaceId } = await requireWorkspacePermission("financials.read");
  const { data, error } = await (client as unknown as LooseClient)
    .from("ads_roi_analyses")
    .select(SUMMARY_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("date_from", { ascending: false })
    .limit(120);
  if (error) throw tableError(error);
  return ((data ?? []) as AnalysisRow[]).map(summary);
}

export async function getAdsRoiAnalysisOnServer(id: string): Promise<AdsRoiAnalysisRecord> {
  const { client, workspaceId } = await requireWorkspacePermission("financials.read");
  const { data, error } = await (client as unknown as LooseClient)
    .from("ads_roi_analyses")
    .select(SUMMARY_COLUMNS + ",report,orders")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw tableError(error);
  if (!data) throw new Error("التحليل غير موجود.");
  const row = data as AnalysisRow;
  return { ...summary(row), report: row.report as ParsedAdsReport, orders: row.orders ?? null };
}

export async function saveAdsRoiAnalysisOnServer(input: {
  report: ParsedAdsReport;
  orders: ParsedOrdersReport | null;
  sourceFileName: string | null;
  ordersFileName: string | null;
}): Promise<AdsRoiAnalysisSummary> {
  const { client, workspaceId, userId, actorUserId } = await requireWorkspacePermission("imports.create");
  const spent = roundMoney(input.report.campaigns.reduce((sum, campaign) => sum + campaign.spent, 0));
  const gmv = roundMoney(input.report.campaigns.reduce((sum, campaign) => sum + campaign.gmv, 0));
  const { data, error } = await (client as unknown as LooseClient)
    .from("ads_roi_analyses")
    .upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        created_by: actorUserId,
        platform: "hungerstation",
        date_from: input.report.dateFrom,
        date_to: input.report.dateTo,
        source_file_name: input.sourceFileName,
        orders_file_name: input.orders ? input.ordersFileName ?? "orders" : null,
        report: input.report,
        orders: input.orders,
        spent,
        gmv,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,platform,date_from,date_to" },
    )
    .select(SUMMARY_COLUMNS)
    .single();
  if (error) throw tableError(error);
  return summary(data as AnalysisRow);
}

export async function deleteAdsRoiAnalysisOnServer(id: string): Promise<void> {
  const { client, workspaceId } = await requireWorkspacePermission("imports.create");
  const { data, error } = await (client as unknown as LooseClient)
    .from("ads_roi_analyses")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw tableError(error);
  if (!data) throw new Error("التحليل غير موجود.");
}

export async function getAdsRoiSettingsOnServer(): Promise<BrandSettings> {
  const { client, workspaceId } = await requireWorkspacePermission("financials.read");
  const { data, error } = await (client as unknown as LooseClient)
    .from("ads_roi_brand_settings")
    .select("brand_key,commission_rate,food_cost_rate")
    .eq("workspace_id", workspaceId);
  if (error) throw tableError(error);
  const settings: BrandSettings = {};
  for (const row of (data ?? []) as Array<{ brand_key: string; commission_rate: number | string | null; food_cost_rate: number | string | null }>) {
    settings[row.brand_key] = {
      commissionRate: row.commission_rate == null ? null : Number(row.commission_rate),
      foodCostRate: row.food_cost_rate == null ? null : Number(row.food_cost_rate),
    };
  }
  return settings;
}

export async function saveAdsRoiSettingsOnServer(
  brands: Array<{ brandKey: string; commissionRate: number | null; foodCostRate: number | null }>,
): Promise<BrandSettings> {
  const { client, workspaceId, userId } = await requireWorkspacePermission("imports.create");
  if (brands.length > 0) {
    const { error } = await (client as unknown as LooseClient).from("ads_roi_brand_settings").upsert(
      brands.map((brand) => ({
        workspace_id: workspaceId,
        user_id: userId,
        brand_key: brand.brandKey.trim().toUpperCase(),
        commission_rate: brand.commissionRate,
        food_cost_rate: brand.foodCostRate,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "workspace_id,brand_key" },
    );
    if (error) throw tableError(error);
  }
  return getAdsRoiSettingsOnServer();
}
