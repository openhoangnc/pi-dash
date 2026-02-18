/**
 * api.ts — Centralised fetch wrapper with automatic token refresh.
 *
 * Access token: kept in memory only (not localStorage).
 * Refresh token: HttpOnly cookie managed by the browser / server.
 */

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Attempt to get a new access token using the refresh-token cookie. */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/refresh", {
      method: "POST",
      credentials: "include", // send the HttpOnly refresh cookie
    });
    if (res.ok) {
      const data = await res.json();
      accessToken = data.token;
      return accessToken;
    }
  } catch {
    // network error — leave token as-is
  }
  return null;
}

/**
 * Authenticated fetch. On a 401 it tries one refresh, then retries.
 * Throws if the refresh also fails (caller should redirect to login).
 */
export async function apiFetch(
  input: RequestInfo,
  init: RequestInit = {},
): Promise<Response> {
  const doFetch = (token: string | null) =>
    fetch(input, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  let res = await doFetch(accessToken);

  if (res.status === 401) {
    // Try to refresh
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch(newToken);
    }
  }

  return res;
}

/** Log in with username/password. Stores the returned access token. */
export async function login(username: string, password: string): Promise<void> {
  const res = await fetch("/api/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    throw new Error("Invalid credentials");
  }

  const data = await res.json();
  accessToken = data.token;
}

/** Log out: clear in-memory token and expire the refresh cookie server-side. */
export async function logout(): Promise<void> {
  accessToken = null;
  try {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
  } catch {
    // best-effort
  }
}
