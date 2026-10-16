import { requireWorkspacePermission } from "../server-auth.server";
import { storeConnection, type IntegrationStatus } from "./connections.server";
import { requestJson } from "./http.server";
import { QUICKBOOKS_AUTHORIZE_URL, QUICKBOOKS_SCOPE, quickBooksRealm, type QuickBooksCredentials } from "./quickbooks";
import { quickBooksAuthHeader, quickBooksClient, quickBooksCompanyUrl, quickBooksTokenRequest } from "./quickbooks.server";
import { signState, verifyState } from "./secret-box.server";

/** Starting and finishing the Intuit sign-in for QuickBooks Online (OAuth 2.0 authorization code). */
const MANAGE = "contracts.manage" as const;
const STATE_TTL_SECONDS = 15 * 60;

export async function startQuickBooksConnectOnServer(): Promise<{ url: string }> {
  const { workspaceId, actorUserId } = await requireWorkspacePermission(MANAGE);
  const { clientId, redirectUri } = quickBooksClient();
  const state = signState({ p: "quickbooks", w: workspaceId, u: actorUserId, e: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS });
  const params = new URLSearchParams({ client_id: clientId, response_type: "code", scope: QUICKBOOKS_SCOPE, redirect_uri: redirectUri, state });
  return { url: `${QUICKBOOKS_AUTHORIZE_URL}?${params.toString()}` };
}

export async function finishQuickBooksConnectOnServer(input: { code: string; state: string; realmId?: string }): Promise<IntegrationStatus> {
  const { workspaceId, actorUserId } = await requireWorkspacePermission(MANAGE);
  const state = verifyState(input.state);
  if (!state || state["p"] !== "quickbooks" || state["w"] !== workspaceId || state["u"] !== actorUserId || Number(state["e"]) < Date.now() / 1000) {
    throw new Error("انتهت صلاحية طلب الربط. اضغط «اربط» من جديد.");
  }
  const realmId = quickBooksRealm(input.realmId);
  if (!realmId) throw new Error("لم يُرجع QuickBooks رقم الشركة. اضغط «اربط» من جديد.");

  const { redirectUri, environment } = quickBooksClient();
  const tokens = await quickBooksTokenRequest({ grant_type: "authorization_code", code: input.code, redirect_uri: redirectUri });
  if (typeof tokens["refresh_token"] !== "string") throw new Error("لم يُرجع QuickBooks صلاحية دائمة. اضغط «اربط» من جديد.");

  // Proves the company can be read before anything is saved.
  await requestJson("QuickBooks", quickBooksCompanyUrl({ realmId, environment }, `companyinfo/${realmId}`), quickBooksAuthHeader(String(tokens["access_token"])));

  const credentials: QuickBooksCredentials = { refreshToken: tokens["refresh_token"], realmId, environment };
  return storeConnection({ workspaceId, actorUserId, provider: "quickbooks", secret: JSON.stringify(credentials), hint: realmId.slice(-4), site: null });
}
