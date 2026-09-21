import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function optionalBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true";
}

const nodeEnv = optional("NODE_ENV", "development");
const isProduction = nodeEnv === "production";

export type SignupMode = "endpoint" | "param" | "same-as-login";

export const config = {
  nodeEnv,
  isProduction,
  port: parseInt(optional("PORT", "3001"), 10),

  // Public origin of this BFF and of the SPA it serves. Used to build the
  // OIDC redirect_uri / post_logout_redirect_uri and to validate returnTo.
  appBaseUrl: required("APP_BASE_URL", "http://localhost:5173"),
  bffBaseUrl: required("BFF_BASE_URL", "http://localhost:3001"),

  session: {
    secret: required("SESSION_SECRET"),
    cookieName: optional("SESSION_COOKIE_NAME", "bff_session"),
    maxAgeMs: parseInt(optional("SESSION_MAX_AGE_MS", String(8 * 60 * 60 * 1000)), 10),
    // Secure cookies require HTTPS. Default to true in production, allow
    // opt-out for local HTTP development.
    cookieSecure: optionalBool("COOKIE_SECURE", isProduction),
    cookieSameSite: optional("COOKIE_SAMESITE", "lax") as "lax" | "strict" | "none",
  },

  // Any standards-compliant OIDC provider works here (Keycloak, Auth0,
  // Okta, Azure AD / Entra ID, Google, ...) — this template only assumes
  // discovery (`{issuer}/.well-known/openid-configuration`), Authorization
  // Code + PKCE, and a refresh token grant, all of which are OIDC-standard.
  oidc: {
    issuerUrl: required("OIDC_ISSUER_URL"),
    scopes: optional("OIDC_SCOPES", "openid profile email"),

    loginClientId: required("OIDC_LOGIN_CLIENT_ID"),
    loginClientSecret: required("OIDC_LOGIN_CLIENT_SECRET"),

    // The signup ("registration") flow may reuse the login client, or point
    // at a dedicated client configured with its own flows/branding.
    signupClientId: optional("OIDC_SIGNUP_CLIENT_ID", required("OIDC_LOGIN_CLIENT_ID")),
    signupClientSecret: optional(
      "OIDC_SIGNUP_CLIENT_SECRET",
      required("OIDC_LOGIN_CLIENT_SECRET")
    ),

    redirectUri: optional(
      "OIDC_REDIRECT_URI",
      `${required("BFF_BASE_URL", "http://localhost:3001")}/api/auth/callback`
    ),
    postLogoutRedirectUri: optional(
      "OIDC_POST_LOGOUT_REDIRECT_URI",
      required("APP_BASE_URL", "http://localhost:5173")
    ),

    // How the Signup button reaches a different screen than Login at the
    // provider. Providers vary widely here, so this is pluggable — see
    // README "Pointing at a different OIDC provider" for examples.
    //   endpoint       (default) Keycloak-style: use a distinct
    //                  authorization endpoint for signup. Either set
    //                  OIDC_SIGNUP_AUTHORIZATION_ENDPOINT explicitly, or
    //                  let it default to swapping the last path segment of
    //                  the discovered authorization endpoint for
    //                  OIDC_SIGNUP_ENDPOINT_SEGMENT (Keycloak's own
    //                  convention: .../auth -> .../registrations).
    //   param          Auth0-style: append OIDC_SIGNUP_PARAM ("key=value",
    //                  e.g. "screen_hint=signup") to the normal
    //                  authorization URL.
    //   same-as-login  No special handling — the Signup button behaves
    //                  exactly like Login. Use this when your provider has
    //                  no redirect-based self-registration.
    signupMode: optional("OIDC_SIGNUP_MODE", "endpoint") as SignupMode,
    signupAuthorizationEndpoint: process.env.OIDC_SIGNUP_AUTHORIZATION_ENDPOINT,
    signupEndpointSegment: optional("OIDC_SIGNUP_ENDPOINT_SEGMENT", "registrations"),
    signupParam: process.env.OIDC_SIGNUP_PARAM,
  },
};
