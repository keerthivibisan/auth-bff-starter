import { Router, type Request, type Response } from "express";
import { config } from "../config";
import {
  buildAuthorizationUrl,
  buildEndSessionUrl,
  createPkceParams,
  exchangeCodeForTokens,
  getClient,
} from "../oidc";
import { ensureFreshTokens } from "../middleware/refreshToken";

export const authRouter = Router();

/** Only allow redirecting back to a same-app relative path, never an absolute/external URL. */
function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function startAuthFlow(flow: "login" | "signup") {
  return (req: Request, res: Response) => {
    const pkce = createPkceParams();
    req.session.pendingAuth = {
      codeVerifier: pkce.codeVerifier,
      state: pkce.state,
      nonce: pkce.nonce,
      returnTo: sanitizeReturnTo(req.query.returnTo),
      flow,
    };

    req.session.save((err: unknown) => {
      if (err) {
        res.redirect(`${config.appBaseUrl}/?error=session_error`);
        return;
      }
      try {
        const url = buildAuthorizationUrl(flow, pkce);
        res.redirect(url);
      } catch {
        res.redirect(`${config.appBaseUrl}/?error=idp_unreachable`);
      }
    });
  };
}

authRouter.get("/login", startAuthFlow("login"));
authRouter.get("/signup", startAuthFlow("signup"));

authRouter.get("/callback", async (req, res) => {
  const pending = req.session.pendingAuth;
  delete req.session.pendingAuth;

  if (!pending) {
    res.redirect(`${config.appBaseUrl}/?error=login_failed`);
    return;
  }

  if (req.query.error) {
    // e.g. user cancelled, or access_denied
    res.redirect(`${config.appBaseUrl}/?error=login_failed`);
    return;
  }

  try {
    const callbackUrl = `${config.oidc.redirectUri}?${new URLSearchParams(
      req.query as Record<string, string>
    ).toString()}`;

    const tokenSet = await exchangeCodeForTokens(pending.flow, callbackUrl, pending);
    const claims = tokenSet.claims();

    req.session.regenerate((err) => {
      if (err) {
        res.redirect(`${config.appBaseUrl}/?error=session_error`);
        return;
      }
      req.session.tokens = {
        accessToken: tokenSet.access_token!,
        refreshToken: tokenSet.refresh_token,
        idToken: tokenSet.id_token,
        expiresAt: tokenSet.expires_at ?? Math.floor(Date.now() / 1000) + 60,
        subject: claims.sub,
      };
      req.session.save((saveErr) => {
        if (saveErr) {
          res.redirect(`${config.appBaseUrl}/?error=session_error`);
          return;
        }
        res.redirect(`${config.appBaseUrl}${pending.returnTo}`);
      });
    });
  } catch {
    res.redirect(`${config.appBaseUrl}/?error=login_failed`);
  }
});

authRouter.get("/session", async (req, res) => {
  const authenticated = await ensureFreshTokens(req);
  if (!authenticated || !req.session.tokens) {
    res.json({ authenticated: false });
    return;
  }

  try {
    const client = getClient("login");
    const userinfo = await client.userinfo(req.session.tokens.accessToken);
    res.json({
      authenticated: true,
      user: {
        sub: userinfo.sub,
        name: userinfo.name ?? userinfo.preferred_username,
        email: userinfo.email,
      },
    });
  } catch {
    res.json({ authenticated: false });
  }
});

authRouter.post("/logout", (req, res) => {
  const idToken = req.session.tokens?.idToken;

  req.session.destroy(() => {
    res.clearCookie(config.session.cookieName, { path: "/" });
    try {
      res.json({ logoutUrl: buildEndSessionUrl(idToken) });
    } catch {
      // Provider unreachable: the local session is already cleared, so
      // send the SPA home rather than failing the logout outright.
      res.json({ logoutUrl: config.appBaseUrl });
    }
  });
});
