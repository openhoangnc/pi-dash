/**
 * api.ts — Centralised fetch wrapper with automatic token refresh.
 *
 * Both access token and refresh token are stored in localStorage.
 */

const ACCESS_TOKEN_KEY = "pi_dash_token";
const REFRESH_TOKEN_KEY = "pi_dash_refresh";

export function setAccessToken(token: string | null) {
  if (token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setRefreshToken(token: string | null) {
  if (token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/** Attempt to get a new access token using the stored refresh token. */
let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (res.ok) {
        const data = await res.json();
        setAccessToken(data.token);
        setRefreshToken(data.refresh_token);
        return data.token as string;
      } else {
        // Refresh token invalid or expired; clear tokens
        setAccessToken(null);
        setRefreshToken(null);
      }
    } catch {
      // network error — leave tokens as-is
    } finally {
      refreshPromise = null;
    }
    return null;
  })();

  return refreshPromise;
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
      headers: {
        ...(init.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  let res = await doFetch(getAccessToken());

  if (res.status === 401) {
    // Try to refresh
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch(newToken);
    } else {
      // If refresh failed, reload the page to transition to the login screen
      window.location.reload();
    }
  }

  return res;
}

/** Log in with username/password. Stores both tokens in localStorage. */
export async function login(username: string, password: string): Promise<void> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    throw new Error("Invalid credentials");
  }

  const data = await res.json();
  setAccessToken(data.token);
  setRefreshToken(data.refresh_token);
}

/** Log out: clear both tokens from localStorage. */
export async function logout(): Promise<void> {
  setAccessToken(null);
  setRefreshToken(null);
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch {
    // best-effort
  }
}
