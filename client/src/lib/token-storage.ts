/**
 * Token storage — the single source of truth for the access and refresh tokens.
 *
 * The zustand auth store and the axios client both need these values. Keeping
 * the keys here (rather than duplicating literals in both) is what prevents the
 * class of bug where one module writes `fdr-portal-auth` and the other reads
 * `fdr-portal-access-token`, leaving every request unauthenticated.
 */

export const ACCESS_TOKEN_KEY = 'fdr-portal-access-token';
export const REFRESH_TOKEN_KEY = 'fdr-portal-refresh-token';
export const AUTH_STORE_KEY = 'fdr-portal-auth';

export interface StoredTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Private mode or a blocked storage policy. Requests still work for the
    // lifetime of the page because the auth store holds the token in memory.
    return null;
  }
}

export function getAccessToken(): string | null {
  return storage()?.getItem(ACCESS_TOKEN_KEY) ?? null;
}

export function getRefreshToken(): string | null {
  return storage()?.getItem(REFRESH_TOKEN_KEY) ?? null;
}

export function setTokens(tokens: StoredTokens): void {
  const store = storage();
  if (!store) return;
  try {
    if (tokens.accessToken) {
      store.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    } else {
      store.removeItem(ACCESS_TOKEN_KEY);
    }
    if (tokens.refreshToken) {
      store.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    } else {
      store.removeItem(REFRESH_TOKEN_KEY);
    }
  } catch {
    /* ignore quota errors */
  }
}

export function setAccessToken(accessToken: string): void {
  setTokens({ accessToken, refreshToken: getRefreshToken() });
}

export function clearTokens(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(ACCESS_TOKEN_KEY);
    store.removeItem(REFRESH_TOKEN_KEY);
    store.removeItem(AUTH_STORE_KEY);
  } catch {
    /* ignore */
  }
}
