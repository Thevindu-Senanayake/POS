import { hostname } from 'node:os';

/** A resolved print target: where (and how) to print one station's jobs. */
export interface PrinterTarget {
  ip: string | null;
  port: number;
  type: string;
}

export interface AgentConfig {
  /** API origin with the `/api` global prefix already appended. */
  apiBaseUrl: string;
  token: string;
  agentId: string;
  pollMs: number;
  claimLimit: number;
  /** Reconnect backoff cap (ms) when the API is unreachable. */
  maxBackoffMs: number;
  printerRefreshMs: number;
  connectTimeoutMs: number;
  /** Per-station printer overrides from env (`kitchen`/`bar`, or `receipt` for bills). */
  overrides: Record<string, Partial<PrinterTarget>>;
}

/** Stations that can be overridden via env; `receipt` targets station-less bill jobs. */
const OVERRIDE_KEYS = ['kitchen', 'bar', 'receipt'] as const;

function strEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  return raw !== undefined && raw.trim() !== '' ? raw.trim() : undefined;
}

function intEnv(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = strEnv(env, key);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid ${key}="${raw}" (expected a positive number)`);
  }
  return Math.floor(n);
}

/** Build the per-station override map from PRINTER_<STATION>_{IP,PORT,TYPE}. */
function readOverrides(env: NodeJS.ProcessEnv): Record<string, Partial<PrinterTarget>> {
  const out: Record<string, Partial<PrinterTarget>> = {};
  for (const key of OVERRIDE_KEYS) {
    const prefix = `PRINTER_${key.toUpperCase()}_`;
    const override: Partial<PrinterTarget> = {};
    const ip = strEnv(env, `${prefix}IP`);
    const type = strEnv(env, `${prefix}TYPE`);
    if (ip !== undefined) override.ip = ip;
    if (strEnv(env, `${prefix}PORT`) !== undefined) override.port = intEnv(env, `${prefix}PORT`, 9100);
    if (type !== undefined) override.type = type;
    if (Object.keys(override).length > 0) out[key] = override;
  }
  return out;
}

/** Read + validate configuration from the environment (throws if the token is missing). */
export function loadConfig(env: NodeJS.ProcessEnv): AgentConfig {
  const token = strEnv(env, 'PRINT_AGENT_TOKEN');
  if (!token) {
    throw new Error('PRINT_AGENT_TOKEN is required (shared secret to authenticate to the API)');
  }
  const origin = (strEnv(env, 'PRINT_AGENT_API_URL') ?? 'http://localhost:4000').replace(/\/+$/, '');
  const pollMs = intEnv(env, 'PRINT_AGENT_POLL_MS', 2000);
  const maxRetries = intEnv(env, 'PRINT_AGENT_MAX_RETRIES', 6);

  return {
    apiBaseUrl: `${origin}/api`,
    token,
    agentId: strEnv(env, 'PRINT_AGENT_ID') ?? `print-agent@${hostname()}`,
    pollMs,
    claimLimit: intEnv(env, 'PRINT_AGENT_CLAIM_LIMIT', 10),
    // pollMs doubled `maxRetries` times, capped at 2 min: a downed API isn't hammered.
    maxBackoffMs: Math.min(pollMs * 2 ** maxRetries, 120_000),
    printerRefreshMs: intEnv(env, 'PRINT_AGENT_PRINTER_REFRESH_MS', 30_000),
    connectTimeoutMs: intEnv(env, 'PRINT_AGENT_CONNECT_TIMEOUT_MS', 5000),
    overrides: readOverrides(env),
  };
}
