import type { Request } from "express";
import { refreshTokens } from "../oidc";

/** Refresh the access token slightly before it actually expires. */
const EXPIRY_SKEW_SECONDS = 30;

/**
 * Ensures the session's access token is valid, transparently refreshing it
 * server-side via the refresh token when it has expired. The SPA never
 * sees any of this — it only ever holds the session cookie.
 *
 * Returns false (and clears the session's tokens) if there is no session,
 * or if the refresh token itself is no longer valid — callers should treat
 * that as "not authenticated".
 */
export async function ensureFreshTokens(req: Request): Promise<boolean> {
  const tokens = req.session.tokens;
  if (!tokens) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (tokens.expiresAt - EXPIRY_SKEW_SECONDS > nowSeconds) {
    return true;
  }

  if (!tokens.refreshToken) {
    delete req.session.tokens;
    return false;
  }

  try {
    const refreshed = await refreshTokens(tokens.refreshToken);
    req.session.tokens = {
      accessToken: refreshed.access_token!,
      refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
      idToken: refreshed.id_token ?? tokens.idToken,
      expiresAt: refreshed.expires_at ?? nowSeconds + 60,
      subject: tokens.subject,
    };
    return true;
  } catch {
    // Refresh token expired, revoked, or the OIDC provider unreachable.
    delete req.session.tokens;
    return false;
  }
}
