# auth-bff-starter

A minimal, fork-and-go base template for frontend projects that need
authentication against **any standards-compliant OIDC provider** —
Keycloak, Auth0, Okta, Azure AD / Entra ID, Google, or your own. It has
exactly one feature: log in, stay logged in, log out. Everything else —
your actual app — starts on top of it.

The template assumes only what OIDC guarantees: discovery
(`{issuer}/.well-known/openid-configuration`), Authorization Code + PKCE,
and a refresh token grant. Keycloak ships as the bundled local-dev provider
(see [`docker-compose.yml`](docker-compose.yml)) purely for convenience —
swap it for whatever you actually run, in dev or production, via env vars.

## Architecture: Backend for Frontend (BFF)

```
Browser (SPA)  <-- HttpOnly session cookie only -->  BFF  <-- tokens -->  OIDC provider
```

- The **SPA** (`frontend/`) never sees an access token, refresh token, or ID
  token. It only ever holds a session cookie, and that cookie is `HttpOnly`
  so client-side JS can't read it either.
- The **BFF** (`bff/`) is a confidential OIDC client registered with your
  provider (client secret + PKCE). It runs the Authorization Code + PKCE
  flow, exchanges the code for tokens, and stores those tokens server-side
  keyed by an express session. It refreshes them transparently when they
  expire.
- The SPA talks only to its own BFF (`/api/auth/...`). The BFF is the only
  thing that ever talks to the OIDC provider or to downstream APIs on the
  user's behalf, attaching the access token itself.

This is the pattern OAuth/OIDC guidance (e.g. the IETF BCP for browser-based
apps) currently recommends over doing PKCE directly in the SPA: no tokens
in browser storage, no XSS-exfiltration surface, and refresh happens off
the client entirely.

## Repo layout

```
frontend/   Vite + React + TypeScript SPA (login/signup screen + authenticated screen)
bff/        Express + TypeScript BFF (OIDC flow, session cookie, token refresh)
docker-compose.yml   Local Keycloak (the bundled example provider), realm inlined
```

## Prerequisites

- Node.js >= 18
- Docker (only if you want the bundled local Keycloak; skip it if you're
  pointing at your own provider)

## Quick start (bundled local Keycloak)

1. Clone and install dependencies:

   ```bash
   git clone https://github.com/keerthivibisan/auth-bff-starter.git
   cd auth-bff-starter
   npm install
   ```

2. Start a local Keycloak preloaded with a test realm/client/user — this is
   just the example provider for getting the template running; see
   [Pointing at a different OIDC provider](#pointing-at-a-different-oidc-provider)
   to use your own instead:

   ```bash
   npm run keycloak:up
   ```

   This uses the realm inlined in [`docker-compose.yml`](docker-compose.yml) to
   create:
   - Realm: `app-realm`
   - Confidential client `app-bff` (PKCE required, redirect URI
     `http://localhost:3001/api/auth/callback`, secret `change-me`)
   - Registration enabled on the realm (so the "Sign up" button works)
   - Test user: `testuser` / `testpassword`

   Keycloak's admin console is at http://localhost:8080 (admin/admin).

3. Copy the env files and adjust if needed (defaults already match the
   bundled realm):

   ```bash
   cp bff/.env.example bff/.env
   cp frontend/.env.example frontend/.env
   ```

   Generate a real session secret rather than using the placeholder:

   ```bash
   openssl rand -base64 32
   ```

4. Run both apps:

   ```bash
   npm run dev
   ```

   - SPA: http://localhost:5173
   - BFF: http://localhost:3001 (the SPA's dev server proxies `/api/*` to it)

5. Open http://localhost:5173. You should see Login / Sign up buttons.
   Log in with `testuser` / `testpassword`. Refresh the page — you stay
   logged in. Click Logout — you're returned to the login screen and the
   provider's session is cleared too.

## Pointing at a different OIDC provider

Everything is environment-driven — nothing below is hardcoded in source.

Edit `bff/.env`:

| Variable | Meaning |
|---|---|
| `OIDC_ISSUER_URL` | Issuer URL serving `/.well-known/openid-configuration` — e.g. `http://localhost:8080/realms/app-realm` (Keycloak), `https://YOUR_TENANT.auth0.com/` (Auth0), `https://YOUR_ORG.okta.com/oauth2/default` (Okta) |
| `OIDC_LOGIN_CLIENT_ID` / `OIDC_LOGIN_CLIENT_SECRET` | Confidential client used for the **Login** button |
| `OIDC_SIGNUP_CLIENT_ID` / `OIDC_SIGNUP_CLIENT_SECRET` | Optional — a distinct client for the **Sign up** button. Omit to reuse the login client. |
| `OIDC_SCOPES` | Space-separated scopes, defaults to `openid profile email` |
| `OIDC_REDIRECT_URI` | Must be registered as a valid redirect URI on the client(s) at your provider |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | Must be registered under the client's allowed post-logout redirect URIs |
| `APP_BASE_URL` / `BFF_BASE_URL` | Public origins of the SPA and BFF |

The client(s) at your provider must be:
- **Confidential**, with a client secret
- **PKCE enabled**, S256
- **Authorization Code** flow enabled
- Direct access grants / implicit flow: disabled (not used here)

### How "Sign up" works

OIDC has no standard grant for registration, so providers all do this
differently. `OIDC_SIGNUP_MODE` in `bff/.env` picks the strategy:

| Mode | Behavior | Fits |
|---|---|---|
| `endpoint` (default) | Uses a distinct authorization endpoint for signup — swaps the discovered endpoint's last path segment for `OIDC_SIGNUP_ENDPOINT_SEGMENT` (default `registrations`), or set `OIDC_SIGNUP_AUTHORIZATION_ENDPOINT` to override outright | Keycloak's `.../auth` → `.../registrations` convention out of the box |
| `param` | Appends `OIDC_SIGNUP_PARAM` (`key=value`) to the normal authorization URL | Auth0's `screen_hint=signup`, or similar provider-specific hints |
| `same-as-login` | No special handling — Signup behaves exactly like Login | Providers with no redirect-based self-registration |

The logic lives in `buildAuthorizationUrl` in
[`bff/src/oidc.ts`](bff/src/oidc.ts) — it's a single small function if you
need a strategy this doesn't cover.

## How the flow works, end to end

1. Browser loads the SPA, which calls `GET /api/auth/session`. No session
   cookie yet → `{ authenticated: false }` → login/signup screen is shown.
2. User clicks **Login**. This is a normal full-page navigation (not a
   fetch) to `GET /api/auth/login?returnTo=<current path>`.
3. The BFF generates a PKCE `code_verifier`/`code_challenge`, `state`, and
   `nonce`, stashes them in the (server-side) session, and redirects the
   browser to the provider's authorization endpoint.
4. User authenticates at the provider. It redirects back to
   `GET /api/auth/callback` with an authorization `code`.
5. The BFF exchanges the code (+ `code_verifier`) for tokens directly with
   the provider (this call never touches the browser), validates `state`,
   stores the tokens in the session, and redirects the browser back to the
   originally requested page.
6. On every subsequent `/api/auth/session` call (or any protected BFF
   route), the BFF checks the access token's expiry and silently refreshes
   it via the refresh token if needed — the SPA never notices.
7. **Sign up** follows the identical flow, just starting at
   `GET /api/auth/signup`, routed per `OIDC_SIGNUP_MODE` (see above).
8. **Logout**: SPA calls `POST /api/auth/logout`. The BFF destroys its
   session and returns the provider's end-session URL (with
   `id_token_hint`); the SPA navigates the browser there, which clears the
   provider's own SSO session and returns to the app.

## Session cookie

Configured in [`bff/src/session.ts`](bff/src/session.ts):

- `HttpOnly` — not readable from JS
- `Secure` in production (`COOKIE_SECURE=true`, requires HTTPS)
- `SameSite=Lax` by default (works with the OIDC redirect flow; override
  with `COOKIE_SAMESITE` if you need `none` for a cross-site embed)
- Server-side session store defaults to in-memory, which is fine for local
  dev only. For anything real, swap in a shared store such as
  `connect-redis` — see the comment in `bff/src/session.ts`.

## Error handling

Failed logins, cancelled consent, or an unreachable OIDC provider all
redirect back to the SPA with `?error=<code>`, which the login screen
renders as a banner instead of a blank page. See `ERROR_MESSAGES` in
[`frontend/src/components/LoginScreen.tsx`](frontend/src/components/LoginScreen.tsx).

## Running in production

The simplest deployment is **single origin**: build the SPA and let the
BFF serve it directly, so there's no CORS and the cheapest possible cookie
story.

```bash
npm run build      # builds frontend/dist, then bff/dist
npm start -w bff    # BFF serves frontend/dist and handles /api/auth/*
```

(`bff/src/index.ts` automatically serves `frontend/dist` if it exists.)

Set `NODE_ENV=production`, `COOKIE_SECURE=true`, real `SESSION_SECRET`,
your real provider/app URLs, and swap the session store for a shared one
if you run more than one BFF instance.

## Using this as a template for a new project

1. Fork/clone this repo, rename it, update `name` fields in the
   `package.json` files.
2. Point `bff/.env` at your project's OIDC provider and client(s).
3. Build your actual app inside `frontend/src` — `App.tsx` currently only
   ever renders `LoginScreen` or `AuthenticatedView`; replace
   `AuthenticatedView` with your real app once a session exists.
4. If you need to call your own backend APIs with the user's identity,
   add routes to the BFF that attach `req.session.tokens.accessToken` as a
   `Bearer` token (see `ensureAuthenticated` in
   `bff/src/middleware/ensureAuthenticated.ts` for a ready-made guard) —
   keep those calls server-side, never forward raw tokens to the browser.

## Out of scope (by design)

- Role/permission-based UI logic
- Any business feature beyond login/signup/logout

Both are expected to be built on top of this template, not inside it.
