// All calls go through the BFF, same-origin (proxied to it in dev, see
// vite.config.ts). The browser only ever holds the BFF's session cookie —
// it never sees access or refresh tokens.

export interface SessionUser {
  sub: string;
  name?: string;
  email?: string;
}

export interface SessionResponse {
  authenticated: boolean;
  user?: SessionUser;
}

export async function fetchSession(): Promise<SessionResponse> {
  const res = await fetch("/api/auth/session", { credentials: "include" });
  if (!res.ok) return { authenticated: false };
  return res.json();
}

export function loginUrl(returnTo: string): string {
  return `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function signupUrl(returnTo: string): string {
  return `/api/auth/signup?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function logout(): Promise<string> {
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  return data.logoutUrl ?? "/";
}
