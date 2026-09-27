import type { Tables } from "@/integrations/supabase/types";

import { roundMoney } from "./analysis/parse";
import { requireWorkspacePermission, type ServerUserClient } from "./server-auth.server";

type PromotionAuditRow = Tables<"promotion_audits">;

export interface PromotionAuditRecord {
  id: string;
  periodId: string;
  name: string;
  campaignRevenue: number;
  organicBaseline: number;
  restaurantFundedDiscount: number;
  platformFundedDiscount: number;
  unknownFundedDiscount: number;
  advertisingSpend: number;
  commissionFees: number;
  paymentFees: number;
  deliveryCampaignFees: number;
  otherMarketplaceFees: number;
  cogsAmount: number;
  platformRoas: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavePromotionAuditInput {
  id?: string;
  periodId: string;
  name: string;
  campaignRevenue: number;
  organicBaseline: number;
  restaurantFundedDiscount: number;
  platformFundedDiscount: number;
  unknownFundedDiscount: number;
  advertisingSpend: number;
  commissionFees: number;
  paymentFees: number;
  deliveryCampaignFees: number;
  otherMarketplaceFees: number;
  cogsAmount: number;
  platformRoas?: number | null;
  notes?: string | null;
}

function mapRecord(row: PromotionAuditRow): PromotionAuditRecord {
  return {
    id: row.id,
    periodId: row.period_id,
    name: row.name,
    campaignRevenue: row.campaign_revenue,
    organicBaseline: row.organic_baseline,
    restaurantFundedDiscount: row.restaurant_funded_discount,
    platformFundedDiscount: row.platform_funded_discount,
    unknownFundedDiscount: row.unknown_funded_discount,
    advertisingSpend: row.advertising_spend,
    commissionFees: row.commission_fees,
    paymentFees: row.payment_fees,
    deliveryCampaignFees: row.delivery_campaign_fees,
    otherMarketplaceFees: row.other_marketplace_fees,
    cogsAmount: row.cogs_amount,
    platformRoas: row.platform_roas,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nonNegativeMoney(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(label + " يجب أن يكون مبلغاً صالحاً غير سالب.");
  }
  return roundMoney(value);
}

function nonNegativeRatio(
  value: number | null | undefined,
  label: string,
): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(label + " يجب أن تكون قيمة صالحة غير سالبة.");
  }
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

async function assertOwnedPeriod(
  client: ServerUserClient,
  userId: string,
  periodId: string,
): Promise<void> {
  const { data, error } = await client
    .from("periods")
    .select("id")
    .eq("id", periodId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("تعذّر العثور على فترة التدقيق.");
}

export async function listPromotionAuditsOnServer(
  periodId: string,
): Promise<PromotionAuditRecord[]> {
  const { client, userId } = await requireWorkspacePermission("financials.read");
  await assertOwnedPeriod(client, userId, periodId);

  const { data, error } = await client
    .from("promotion_audits")
    .select("*")
    .eq("user_id", userId)
    .eq("period_id", periodId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRecord);
}

export async function savePromotionAuditOnServer(
  input: SavePromotionAuditInput,
): Promise<PromotionAuditRecord> {
  const { client, userId } = await requireWorkspacePermission("financials.read");
  await assertOwnedPeriod(client, userId, input.periodId);

  const name = input.name.trim();
  if (!name || name.length > 160) {
    throw new Error("اسم الحملة مطلوب ويجب ألا يتجاوز 160 حرفاً.");
  }

  const payload = {
    period_id: input.periodId,
    name,
    campaign_revenue: nonNegativeMoney(input.campaignRevenue, "مبيعات الحملة"),
    organic_baseline: nonNegativeMoney(input.organicBaseline, "خط الأساس العضوي"),
    restaurant_funded_discount: nonNegativeMoney(
      input.restaurantFundedDiscount,
      "خصم المطعم",
    ),
    platform_funded_discount: nonNegativeMoney(
      input.platformFundedDiscount,
      "خصم المنصة",
    ),
    unknown_funded_discount: nonNegativeMoney(
      input.unknownFundedDiscount,
      "الخصم غير المصنف",
    ),
    advertising_spend: nonNegativeMoney(input.advertisingSpend, "الإنفاق الإعلاني"),
    commission_fees: nonNegativeMoney(input.commissionFees, "العمولة"),
    payment_fees: nonNegativeMoney(input.paymentFees, "رسوم الدفع"),
    delivery_campaign_fees: nonNegativeMoney(
      input.deliveryCampaignFees,
      "تكلفة حملة التوصيل",
    ),
    other_marketplace_fees: nonNegativeMoney(
      input.otherMarketplaceFees,
      "رسوم المنصة الأخرى",
    ),
    cogs_amount: nonNegativeMoney(input.cogsAmount, "تكلفة البضاعة"),
    platform_roas: nonNegativeRatio(input.platformRoas, "ROAS المنصة"),
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (payload.notes && payload.notes.length > 4000) {
    throw new Error("الملاحظات يجب ألا تتجاوز 4000 حرف.");
  }

  if (input.id) {
    const { data, error } = await client
      .from("promotion_audits")
      .update(payload)
      .eq("id", input.id)
      .eq("user_id", userId)
      .eq("period_id", input.periodId)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("تعذّر العثور على تحليل الحملة لتحديثه.");
    return mapRecord(data);
  }

  const { data, error } = await client
    .from("promotion_audits")
    .insert({
      ...payload,
      user_id: userId,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapRecord(data);
}

export async function deletePromotionAuditOnServer(input: {
  id: string;
  periodId: string;
}): Promise<string> {
  const { client, userId } = await requireWorkspacePermission("financials.read");
  await assertOwnedPeriod(client, userId, input.periodId);

  const { data, error } = await client
    .from("promotion_audits")
    .delete()
    .eq("id", input.id)
    .eq("user_id", userId)
    .eq("period_id", input.periodId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("تعذّر العثور على تحليل الحملة لحذفه.");
  return data.id;
}
