import { Issuer, generators, type Client, type TokenSet } from "openid-client";
import { config } from "./config";

let issuer: Issuer<Client> | undefined;
let loginClient: Client | undefined;
let signupClient: Client | undefined;

/**
 * Runs OIDC discovery against the provider's well-known endpoint once at
 * startup (`{issuer}/.well-known/openid-configuration`). Works against any
 * standards-compliant OIDC provider — Keycloak, Auth0, Okta, Azure AD, etc.
 */
export async function initOidc(): Promise<void> {
  issuer = await Issuer.discover(config.oidc.issuerUrl);

  loginClient = new issuer.Client({
    client_id: config.oidc.loginClientId,
    client_secret: config.oidc.loginClientSecret,
    redirect_uris: [config.oidc.redirectUri],
    response_types: ["code"],
  });

  signupClient =
    config.oidc.signupClientId === config.oidc.loginClientId
      ? loginClient
      : new issuer.Client({
          client_id: config.oidc.signupClientId,
          client_secret: config.oidc.signupClientSecret,
          redirect_uris: [config.oidc.redirectUri],
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
 * Builds the authorization URL for a given flow. See config.ts for the
 * three supported OIDC_SIGNUP_MODE strategies — providers have no common
 * standard for "go straight to registration", so this is pluggable.
 */
export function buildAuthorizationUrl(flow: "login" | "signup", pkce: PkceParams): string {
  const client = getClient(flow);
  const params: Record<string, unknown> = {
    scope: config.oidc.scopes,
    redirect_uri: config.oidc.redirectUri,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: "S256",
    state: pkce.state,
    nonce: pkce.nonce,
  };

  const isSignup = flow === "signup";
  if (isSignup && config.oidc.signupMode === "param" && config.oidc.signupParam) {
    const separatorIndex = config.oidc.signupParam.indexOf("=");
    if (separatorIndex > 0) {
      const key = config.oidc.signupParam.slice(0, separatorIndex);
      const value = config.oidc.signupParam.slice(separatorIndex + 1);
      params[key] = value;
    }
  }

  const url = client.authorizationUrl(params);

  if (!isSignup || config.oidc.signupMode !== "endpoint") {
    return url;
  }

  const authorizationEndpoint = getIssuer().metadata.authorization_endpoint;
  if (!authorizationEndpoint || !url.startsWith(authorizationEndpoint)) {
    return url;
  }

  const signupEndpoint =
    config.oidc.signupAuthorizationEndpoint ??
    authorizationEndpoint.replace(/\/[^/]+$/, `/${config.oidc.signupEndpointSegment}`);

  return signupEndpoint + url.slice(authorizationEndpoint.length);
}

export async function exchangeCodeForTokens(
  flow: "login" | "signup",
  callbackUrl: string,
  pkce: Pick<PkceParams, "codeVerifier" | "state" | "nonce">
): Promise<TokenSet> {
  const client = getClient(flow);
  const params = client.callbackParams(callbackUrl);
  return client.callback(config.oidc.redirectUri, params, {
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
    post_logout_redirect_uri: config.oidc.postLogoutRedirectUri,
  });
}
