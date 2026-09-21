const DEFAULT_HOURLY_LIMIT = 30;

export type AiUsageFeature =
  | "exception_explainer"
  | "period_summary"
  | "period_intelligence"
  | "analyst_chat";

export interface AiUsageContext {
  accessToken: string;
  userId: string;
  feature: AiUsageFeature;
  expectedModel: string;
  promptVersion: string;
  periodId: string | null;
  exceptionId?: string | null;
  supabaseUrl: string;
  supabaseKey: string;
}

export interface ReservedAiResult {
  model: string;
}

function configuredHourlyLimit(): number {
  const configured = Number.parseInt(
    process.env["TADQEEQ_AI_MAX_REQUESTS_PER_HOUR"] ?? "",
    10,
  );
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_HOURLY_LIMIT;
}

function usageHeaders(context: AiUsageContext): Record<string, string> {
  return {
    apikey: context.supabaseKey,
    Authorization: "Bearer " + context.accessToken,
    "Content-Type": "application/json",
  };
}

export async function reserveAiUsage(context: AiUsageContext): Promise<string> {
  const response = await fetch(
    context.supabaseUrl + "/rest/v1/rpc/reserve_ai_call",
    {
      method: "POST",
      headers: {
        ...usageHeaders(context),
        Accept: "application/json",
      },
      body: JSON.stringify({
        p_feature: context.feature,
        p_model: context.expectedModel,
        p_prompt_version: context.promptVersion,
        p_period_id: context.periodId,
        p_exception_id: context.exceptionId ?? null,
        p_limit: configuredHourlyLimit(),
      }),
    },
  );

  const raw = await response.text();

  if (!response.ok) {
    if (raw.includes("AI_RATE_LIMIT_EXCEEDED")) {
      throw new Error(
        "تم الوصول إلى حد استخدام Tadqeeq AI لهذه الساعة. جرّب مرة أخرى لاحقاً.",
      );
    }

    console.error(
      "Failed to reserve Tadqeeq AI usage",
      response.status,
      raw.slice(0, 500),
    );
    throw new Error("تعذّر حجز استخدام Tadqeeq AI. حاول مرة أخرى.");
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "string" && parsed) return parsed;
  } catch {
    // Fall through to the explicit error below.
  }

  throw new Error("تعذّر قراءة حجز استخدام Tadqeeq AI من الخادم.");
}

export async function finalizeAiUsage(
  context: AiUsageContext,
  usageId: string,
  status: "succeeded" | "failed",
  model?: string,
): Promise<void> {
  const url = new URL(context.supabaseUrl + "/rest/v1/ai_usage");
  url.searchParams.set("id", "eq." + usageId);
  url.searchParams.set("user_id", "eq." + context.userId);

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        ...usageHeaders(context),
        Prefer: "return=representation",
        Accept: "application/json",
      },
      body: JSON.stringify({
        status,
        ...(model ? { model } : {}),
      }),
    });

    if (!response.ok) {
      console.error(
        "Failed to finalize Tadqeeq AI usage",
        usageId,
        response.status,
      );
      return;
    }

    const rows = (await response.json()) as Array<{ id?: string }>;
    if (!rows.some((row) => row.id === usageId)) {
      console.error(
        "Tadqeeq AI usage reservation was not finalized",
        usageId,
      );
    }
  } catch (error) {
    console.error("Failed to finalize Tadqeeq AI usage", usageId, error);
  }
}

export async function runWithAiUsageReservation<T extends ReservedAiResult>(
  context: AiUsageContext,
  operation: () => Promise<T>,
): Promise<T> {
  const usageId = await reserveAiUsage(context);

  try {
    const result = await operation();
    await finalizeAiUsage(context, usageId, "succeeded", result.model);
    return result;
  } catch (error) {
    await finalizeAiUsage(context, usageId, "failed");
    throw error;
  }
}
