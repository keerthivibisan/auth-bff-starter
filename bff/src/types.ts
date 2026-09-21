import "express-session";

interface PendingAuth {
  codeVerifier: string;
  state: string;
  nonce: string;
  returnTo: string;
  flow: "login" | "signup";
}

interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  /** Epoch seconds when the access token expires. */
  expiresAt: number;
  subject: string;
}

declare module "express-session" {
  interface SessionData {
    pendingAuth?: PendingAuth;
    tokens?: StoredTokens;
  }
}
