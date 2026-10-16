import { requireWorkspacePermission } from "../server-auth.server";
import { storeConnection, type IntegrationStatus } from "./connections.server";
import { requestJson } from "./http.server";
import { signState, verifyState } from "./secret-box.server";
import { ZOHO_SCOPES, zohoAccountsServer, zohoApiDomain, type ZohoCredentials } from "./zoho";
import { zohoAuthHeader, zohoClient, zohoTokenRequest } from "./zoho.server";

/** Starting and finishing the Zoho Books sign-in (OAuth, authorization code with a refresh token). */
const MANAGE = "contracts.manage" as const;
const STATE_TTL_SECONDS = 15 * 60;

/** Where to send the person to approve Tadqeeq in Zoho; the signed state ties the answer to them and this workspace. */
export async function startZohoConnectOnServer(): Promise<{ url: string }> {
  const { workspaceId, actorUserId } = await requireWorkspacePermission(MANAGE);
  const { clientId, redirectUri } = zohoClient();
  const state = signState({ p: "zoho", w: workspaceId, u: actorUserId, e: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS });
  const params = new URLSearchParams({
    scope: ZOHO_SCOPES,
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return { url: `https://accounts.zoho.com/oauth/v2/auth?${params.toString()}` };
}

export async function finishZohoConnectOnServer(input: { code: string; state: string; accountsServer?: string }): Promise<IntegrationStatus> {
  const { workspaceId, actorUserId } = await requireWorkspacePermission(MANAGE);
  const state = verifyState(input.state);
  if (!state || (state["p"] ?? "zoho") !== "zoho" || state["w"] !== workspaceId || state["u"] !== actorUserId || Number(state["e"]) < Date.now() / 1000) {
    throw new Error("انتهت صلاحية طلب الربط. اضغط «اربط» من جديد.");
  }
  const accountsServer = zohoAccountsServer(input.accountsServer ?? "https://accounts.zoho.com");
  if (!accountsServer) throw new Error("ردّ Zoho من عنوان غير معروف. اضغط «اربط» من جديد.");

  const { clientId, clientSecret, redirectUri } = zohoClient();
  const tokens = await zohoTokenRequest(accountsServer, {
    code: input.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const apiDomain = zohoApiDomain(tokens["api_domain"]);
  if (!tokens["refresh_token"] || !tokens["access_token"] || !apiDomain) {
    throw new Error("لم يُرجع Zoho صلاحية دائمة. اضغط «اربط» من جديد ووافق على الربط.");
  }

  const { organizations = [] } = await requestJson<{ organizations?: Array<{ organization_id?: string | number; is_default_org?: boolean }> }>(
    "Zoho Books",
    `${apiDomain}/books/v3/organizations`,
    zohoAuthHeader(tokens["access_token"]),
  );
  const organization = organizations.find((candidate) => candidate.is_default_org) ?? organizations[0];
  if (!organization?.organization_id) throw new Error("لا توجد مؤسسة في Zoho Books لهذا الحساب.");
  const organizationId = String(organization.organization_id);

  const credentials: ZohoCredentials = { refreshToken: tokens["refresh_token"], accountsServer, apiDomain, organizationId };
  return storeConnection({
    workspaceId,
    actorUserId,
    provider: "zoho",
    secret: JSON.stringify(credentials),
    hint: organizationId.slice(-4),
    site: new URL(apiDomain).host,
  });
}
