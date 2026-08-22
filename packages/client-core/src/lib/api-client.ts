import type { LoginResponseDTO } from '@pos/shared';
import { useAuthStore } from '../stores/auth-store';
import { API_BASE } from './env';

/** Error carrying the HTTP status + parsed body so callers can branch (e.g. 403 → PIN). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Sent as the `x-manager-pin` header for PIN-gated actions (spec §7). */
  managerPin?: string;
  /** Attach the bearer token + auto-refresh on 401. Default true. */
  auth?: boolean;
  signal?: AbortSignal;
}

// Single-flight refresh: concurrent 401s share one refresh round-trip.
let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const { refreshToken, setSession, clear } = useAuthStore.getState();
  if (!refreshToken) {
    clear();
    return false;
  }
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clear();
      return false;
    }
    setSession((await res.json()) as LoginResponseDTO);
    return true;
  } catch {
    clear();
    return false;
  }
}

function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (Array.isArray(m)) return m.join(', ');
    if (typeof m === 'string') return m;
  }
  return `Request failed (${status})`;
}

/** Core JSON request against the API with bearer auth + one transparent refresh retry. */
export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, managerPin, auth = true, signal } = opts;

  const send = (): Promise<Response> => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (auth) {
      const token = useAuthStore.getState().accessToken;
      if (token) headers.authorization = `Bearer ${token}`;
    }
    if (managerPin) headers['x-manager-pin'] = managerPin;
    return fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  };

  let res = await send();
  if (res.status === 401 && auth) {
    refreshPromise ??= refreshSession().finally(() => {
      refreshPromise = null;
    });
    if (await refreshPromise) res = await send();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      /* keep raw text */
    }
    throw new ApiError(extractMessage(parsed, res.status), res.status, parsed);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Thin verb helpers over {@link apiRequest}. */
export const api = {
  get: <T>(path: string, opts?: RequestOptions) => apiRequest<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: 'PATCH', body }),
  del: <T>(path: string, opts?: RequestOptions) => apiRequest<T>(path, { ...opts, method: 'DELETE' }),
};
