import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const env = z.enum(["sandbox", "live"]);
const choice = z.object({ planCode: z.enum(["start", "growth", "unlimited"]), cycle: z.enum(["monthly", "yearly"]), env });

export const prepareCardCheckout = createServerFn({ method: "POST" })
  .validator(choice)
  .handler(async ({ data }) => (await import("./card-payments.server")).prepareCardCheckoutOnServer(data));

export const getMyCardSubscription = createServerFn({ method: "POST" })
  .validator(z.object({ env }))
  .handler(async ({ data }) => (await import("./card-payments.server")).getMyCardSubscriptionOnServer(data.env));

export const changeCardPlan = createServerFn({ method: "POST" })
  .validator(choice)
  .handler(async ({ data }) => (await import("./card-payments.server")).changeCardPlanOnServer(data));

export const getCardPortalUrl = createServerFn({ method: "POST" })
  .validator(z.object({ env }))
  .handler(async ({ data }) => (await import("./card-payments.server")).getCardPortalUrlOnServer(data.env));
