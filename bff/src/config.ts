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

  keycloak: {
    issuerUrl: required("KEYCLOAK_ISSUER_URL"),
    scopes: optional("KEYCLOAK_SCOPES", "openid profile email"),

    loginClientId: required("KEYCLOAK_LOGIN_CLIENT_ID"),
    loginClientSecret: required("KEYCLOAK_LOGIN_CLIENT_SECRET"),

    // The signup ("registration") flow may reuse the login client, or point
    // at a dedicated client configured with its own flows/branding.
    signupClientId: optional("KEYCLOAK_SIGNUP_CLIENT_ID", required("KEYCLOAK_LOGIN_CLIENT_ID")),
    signupClientSecret: optional(
      "KEYCLOAK_SIGNUP_CLIENT_SECRET",
      required("KEYCLOAK_LOGIN_CLIENT_SECRET")
    ),

    redirectUri: optional(
      "KEYCLOAK_REDIRECT_URI",
      `${required("BFF_BASE_URL", "http://localhost:3001")}/api/auth/callback`
    ),
    postLogoutRedirectUri: optional(
      "KEYCLOAK_POST_LOGOUT_REDIRECT_URI",
      required("APP_BASE_URL", "http://localhost:5173")
    ),
  },
};
