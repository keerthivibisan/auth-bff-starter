import { Issuer, generators, type Client, type TokenSet } from "openid-client";
import { config } from "./config";

let issuer: Issuer<Client> | undefined;
let loginClient: Client | undefined;
let signupClient: Client | undefined;

/**
 * Runs OIDC discovery against Keycloak's well-known endpoint once at startup.
 * Keycloak's realm issuer URL doubles as the discovery document base
 * (`{issuer}/.well-known/openid-configuration`).
 */
export async function initOidc(): Promise<void> {
  issuer = await Issuer.discover(config.keycloak.issuerUrl);

  loginClient = new issuer.Client({
    client_id: config.keycloak.loginClientId,
    client_secret: config.keycloak.loginClientSecret,
    redirect_uris: [config.keycloak.redirectUri],
    response_types: ["code"],
  });

  signupClient =
    config.keycloak.signupClientId === config.keycloak.loginClientId
      ? loginClient
      : new issuer.Client({
          client_id: config.keycloak.signupClientId,
          client_secret: config.keycloak.signupClientSecret,
          redirect_uris: [config.keycloak.redirectUri],
          response_types: ["code"],
        });
}

export function getIssuer(): Issuer<Client> {
  if (!issuer) throw new Error("OIDC issuer not initialized. Call initOidc() first.");
  return issuer;
}

export function getClient(flow: "login" | "signup"): Client {
  const client = flow === "login" ? loginClient : signupClient;
  if (!client) throw new Error("OIDC client not initialized. Call initOidc() first.");
  return client;
}

export interface PkceParams {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  nonce: string;
}

export function createPkceParams(): PkceParams {
  const codeVerifier = generators.codeVerifier();
  return {
    codeVerifier,
    codeChallenge: generators.codeChallenge(codeVerifier),
    state: generators.state(),
    nonce: generators.nonce(),
  };
}

/**
 * Builds the authorization URL for a given flow. Keycloak has no distinct
 * OIDC "signup" grant, so the well-known convention is to point the browser
 * at Keycloak's registration endpoint (same params as the authorize
 * endpoint) instead of the login endpoint. See README for the
 * kc_action-based alternative if your Keycloak version prefers that.
 */
export function buildAuthorizationUrl(
  flow: "login" | "signup",
  pkce: PkceParams
): string {
  const client = getClient(flow);
  const url = client.authorizationUrl({
    scope: config.keycloak.scopes,
    redirect_uri: config.keycloak.redirectUri,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: "S256",
    state: pkce.state,
    nonce: pkce.nonce,
  });

  if (flow === "signup") {
    return url.replace(
      "/protocol/openid-connect/auth",
      "/protocol/openid-connect/registrations"
    );
  }
  return url;
}

export async function exchangeCodeForTokens(
  flow: "login" | "signup",
  callbackUrl: string,
  pkce: Pick<PkceParams, "codeVerifier" | "state" | "nonce">
): Promise<TokenSet> {
  const client = getClient(flow);
  const params = client.callbackParams(callbackUrl);
  return client.callback(config.keycloak.redirectUri, params, {
    code_verifier: pkce.codeVerifier,
    state: pkce.state,
    nonce: pkce.nonce,
  });
}

export async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  // Refresh always goes through the login client; a signup-flow session has
  // already converted to an ordinary authenticated session by this point.
  const client = getClient("login");
  return client.refresh(refreshToken);
}

export function buildEndSessionUrl(idToken: string | undefined): string {
  const client = getClient("login");
  return client.endSessionUrl({
    id_token_hint: idToken,
    post_logout_redirect_uri: config.keycloak.postLogoutRedirectUri,
  });
}
