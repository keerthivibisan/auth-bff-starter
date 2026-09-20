# react-keycloak-base

A minimal, fork-and-go base template for frontend projects that need
Keycloak authentication. It has exactly one feature: log in, stay logged
in, log out. Everything else — your actual app — starts on top of it.

## Architecture: Backend for Frontend (BFF)

```
Browser (SPA)  <-- HttpOnly session cookie only -->  BFF  <-- tokens -->  Keycloak
```

- The **SPA** (`frontend/`) never sees an access token, refresh token, or ID
  token. It only ever holds a session cookie, and that cookie is `HttpOnly`
  so client-side JS can't read it either.
- The **BFF** (`bff/`) is a confidential OIDC client registered in Keycloak
  (client secret + PKCE). It runs the Authorization Code + PKCE flow,
  exchanges the code for tokens, and stores those tokens server-side keyed
  by an express session. It refreshes them transparently when they expire.
- The SPA talks only to its own BFF (`/api/auth/...`). The BFF is the only
  thing that ever talks to Keycloak or to downstream APIs on the user's
  behalf, attaching the access token itself.

This is the pattern OAuth/OIDC guidance (e.g. the IETF BCP for browser-based
apps) currently recommends over doing PKCE directly in the SPA: no tokens
in browser storage, no XSS-exfiltration surface, and refresh happens off
the client entirely.

## Repo layout

```
frontend/   Vite + React + TypeScript SPA (login/signup screen + authenticated screen)
bff/        Express + TypeScript BFF (OIDC flow, session cookie, token refresh)
keycloak/   Realm export used by docker-compose for local development
docker-compose.yml   Spins up a local Keycloak with a ready-to-use realm
```

## Prerequisites

- Node.js >= 18
- Docker (only if you want the bundled local Keycloak; skip it if you're
  pointing at an existing realm)

## Quick start (local Keycloak)

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start a local Keycloak preloaded with a test realm/client/user:

   ```bash
   npm run keycloak:up
   ```

   This uses [`keycloak/realm-export.json`](keycloak/realm-export.json) to
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
   logged in. Click Logout — you're returned to the login screen and
   Keycloak's session is cleared too.

## Pointing at a different Keycloak realm/client

Everything is environment-driven — nothing below is hardcoded in source.

Edit `bff/.env`:

| Variable | Meaning |
|---|---|
| `KEYCLOAK_ISSUER_URL` | Realm issuer, e.g. `https://kc.example.com/realms/my-realm` |
| `KEYCLOAK_LOGIN_CLIENT_ID` / `KEYCLOAK_LOGIN_CLIENT_SECRET` | Confidential client used for the **Login** button |
| `KEYCLOAK_SIGNUP_CLIENT_ID` / `KEYCLOAK_SIGNUP_CLIENT_SECRET` | Optional — a distinct client for the **Sign up** button. Omit to reuse the login client (in which case sign-up uses Keycloak's registration endpoint for that same client). |
| `KEYCLOAK_SCOPES` | Space-separated scopes, defaults to `openid profile email` |
| `KEYCLOAK_REDIRECT_URI` | Must be registered as a valid redirect URI on the client(s) in Keycloak |
| `KEYCLOAK_POST_LOGOUT_REDIRECT_URI` | Must be registered under the client's "Valid post logout redirect URIs" |
| `APP_BASE_URL` / `BFF_BASE_URL` | Public origins of the SPA and BFF |

The client(s) in Keycloak must be:
- **Confidential** (`publicClient: false`), with a client secret
- **PKCE enabled**, S256 (`pkce.code.challenge.method: S256` client attribute)
- **Standard flow** (Authorization Code) enabled
- Direct access grants / implicit flow: disabled (not used here)

### How "Sign up" works

Keycloak doesn't have a separate OIDC grant for registration. This
template points the Sign up button at Keycloak's registration endpoint
(`/realms/{realm}/protocol/openid-connect/registrations`), which accepts
the same authorization parameters (PKCE challenge, redirect URI, state,
etc.) as the login endpoint but opens straight on the registration form.
The realm needs `registrationAllowed: true`.

If your Keycloak setup instead uses a `kc_action=REGISTER` required-action
redirect, or a themed client dedicated to signup, set
`KEYCLOAK_SIGNUP_CLIENT_ID`/`_SECRET` to that client and adjust
`buildAuthorizationUrl` in [`bff/src/oidc.ts`](bff/src/oidc.ts) — it's a
single small function.

## How the flow works, end to end

1. Browser loads the SPA, which calls `GET /api/auth/session`. No session
   cookie yet → `{ authenticated: false }` → login/signup screen is shown.
2. User clicks **Login**. This is a normal full-page navigation (not a
   fetch) to `GET /api/auth/login?returnTo=<current path>`.
3. The BFF generates a PKCE `code_verifier`/`code_challenge`, `state`, and
   `nonce`, stashes them in the (server-side) session, and redirects the
   browser to Keycloak's authorization endpoint.
4. User authenticates at Keycloak. Keycloak redirects back to
   `GET /api/auth/callback` with an authorization `code`.
5. The BFF exchanges the code (+ `code_verifier`) for tokens directly with
   Keycloak (this call never touches the browser), validates `state`,
   stores the tokens in the session, and redirects the browser back to the
   originally requested page.
6. On every subsequent `/api/auth/session` call (or any protected BFF
   route), the BFF checks the access token's expiry and silently refreshes
   it via the refresh token if needed — the SPA never notices.
7. **Sign up** follows the identical flow, just starting at
   `GET /api/auth/signup`, which lands on Keycloak's registration form
   instead of the login form.
8. **Logout**: SPA calls `POST /api/auth/logout`. The BFF destroys its
   session and returns Keycloak's end-session URL (with `id_token_hint`);
   the SPA navigates the browser there, which clears Keycloak's own SSO
   session and returns to the app.

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

Failed logins, cancelled consent, or an unreachable Keycloak all redirect
back to the SPA with `?error=<code>`, which the login screen renders as a
banner instead of a blank page. See `ERROR_MESSAGES` in
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
your real Keycloak/App URLs, and swap the session store for a shared one
if you run more than one BFF instance.

## Using this as a template for a new project

1. Fork/clone this repo, rename it, update `name` fields in the
   `package.json` files.
2. Point `bff/.env` at your project's Keycloak realm/client(s).
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
