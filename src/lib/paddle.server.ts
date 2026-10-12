import { Environment, Paddle, EventName } from "@paddle/paddle-node-sdk";

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export { EventName };
export type PaddleEnv = "sandbox" | "live";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev/paddle";

export function getConnectionApiKey(env: PaddleEnv): string {
  return env === "sandbox" ? getEnv("PADDLE_SANDBOX_API_KEY") : getEnv("PADDLE_LIVE_API_KEY");
}

export function getPaddleClient(env: PaddleEnv): Paddle {
  const connectionApiKey = getConnectionApiKey(env);
  return new Paddle(connectionApiKey, {
    environment: GATEWAY_BASE_URL as unknown as Environment,
    customHeaders: { "X-Connection-Api-Key": connectionApiKey, "Lovable-API-Key": getEnv("LOVABLE_API_KEY") },
  });
}

export async function gatewayFetch(env: PaddleEnv, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${GATEWAY_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Connection-Api-Key": getConnectionApiKey(env),
      "Lovable-API-Key": getEnv("LOVABLE_API_KEY"),
      ...init?.headers,
    },
  });
}

export async function resolvePriceId(env: PaddleEnv, externalId: string): Promise<string> {
  const response = await gatewayFetch(env, `/prices?external_id=${encodeURIComponent(externalId)}`);
  const result = (await response.json()) as { data?: Array<{ id: string }> };
  const id = result.data?.[0]?.id;
  if (!id) throw new Error("Price not found");
  return id;
}

export async function verifyWebhook(req: Request, env: PaddleEnv) {
  const signature = req.headers.get("paddle-signature");
  const body = await req.text();
  const secret = env === "sandbox" ? getEnv("PAYMENTS_SANDBOX_WEBHOOK_SECRET") : getEnv("PAYMENTS_LIVE_WEBHOOK_SECRET");
  if (!signature || !body) throw new Error("Missing signature or body");
  return await getPaddleClient(env).webhooks.unmarshal(body, secret, signature);
}
