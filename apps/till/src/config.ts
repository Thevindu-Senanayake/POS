import { hostname } from 'node:os';
import { resolve } from 'node:path';

/**
 * Print-host configuration. The till polls the API's print-agent endpoints and
 * prints claimed jobs via the installed Windows drivers. Printing is enabled
 * only when a token is present, so a till with no `PRINT_AGENT_TOKEN` still runs
 * as a pure UI shell (phase-1 behaviour) instead of erroring.
 */
export interface TillPrintingConfig {
  /** True when a print token was supplied — otherwise the print host stays dormant. */
  enabled: boolean;
  /** API origin with the `/api` global prefix appended. */
  apiBaseUrl: string;
  /** Shared secret authenticating to the print-agent endpoints. */
  token: string;
  /** Identifies this till when claiming jobs. */
  agentId: string;
  pollMs: number;
  claimLimit: number;
  /** Reconnect backoff cap (ms) when the API is unreachable. */
  maxBackoffMs: number;
  /** Printable content width in mm (72 suits an 80mm thermal printer). */
  widthMm: number;
  /** Paint-settle delay (ms) after the receipt HTML loads, before printing. */
  settleMs: number;
  /** Absolute path to the venue logo raster embedded atop bills (when the toggle is on). */
  logoPath: string;
}

/**
 * Runtime configuration for the till shell, read from the environment with
 * localhost defaults so a stock till needs zero setup. Kiosk + auto-launch
 * default ON only in a *packaged* build, so `pnpm --filter @pos/till launch` on
 * a dev box opens a normal, closable window and never registers a login item.
 */
export interface TillConfig {
  /** Web UI the shell displays (the Dockerized @pos/web). */
  appUrl: string;
  /** URL polled until it responds before appUrl is loaded (defaults to appUrl). */
  readyUrl: string;
  /** Give up waiting for the backend after this long, then show the retry screen. */
  startupTimeoutMs: number;
  /** Delay between readiness probes. */
  probeIntervalMs: number;
  /** Per-probe request timeout. */
  probeTimeoutMs: number;
  /** Fullscreen borderless window. */
  fullscreen: boolean;
  /** Locked-down kiosk mode (implies fullscreen). */
  kiosk: boolean;
  /** Register the app to launch automatically at user login. */
  openAtLogin: boolean;
  /** Allow DevTools and its keyboard shortcuts (off in a packaged kiosk by default). */
  allowDevtools: boolean;
  /** In-process print host settings. */
  printing: TillPrintingConfig;
}

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

function boolEnv(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = strEnv(env, key);
  if (raw === undefined) return fallback;
  const v = raw.toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  throw new Error(`Invalid ${key}="${raw}" (expected a boolean like 1/0, true/false)`);
}

/** Build the print-host slice of the config from the environment. */
function loadPrintingConfig(env: NodeJS.ProcessEnv): TillPrintingConfig {
  const token = strEnv(env, 'PRINT_AGENT_TOKEN') ?? '';
  // Matches the print-agent's origin resolution so the same .env drives both.
  const origin = (
    strEnv(env, 'PRINT_AGENT_API_URL') ??
    strEnv(env, 'POS_API_URL') ??
    'http://localhost:4000'
  ).replace(/\/+$/, '');
  const pollMs = intEnv(env, 'PRINT_AGENT_POLL_MS', 2_000);
  const maxRetries = intEnv(env, 'PRINT_AGENT_MAX_RETRIES', 6);
  return {
    enabled: token !== '',
    apiBaseUrl: `${origin}/api`,
    token,
    agentId: strEnv(env, 'PRINT_AGENT_ID') ?? `till@${hostname()}`,
    pollMs,
    claimLimit: intEnv(env, 'PRINT_AGENT_CLAIM_LIMIT', 10),
    // pollMs doubled `maxRetries` times, capped at 2 min: a downed API isn't hammered.
    maxBackoffMs: Math.min(pollMs * 2 ** maxRetries, 120_000),
    widthMm: intEnv(env, 'POS_RECEIPT_WIDTH_MM', 72),
    settleMs: intEnv(env, 'POS_PRINT_SETTLE_MS', 120),
    // Optional venue logo; degrades to a headerless bill when the file is absent.
    logoPath: strEnv(env, 'RECEIPT_LOGO_PATH') ?? resolve(__dirname, '..', 'assets', 'receipt-logo.png'),
  };
}

/** Read + normalize the shell's configuration. `isPackaged` drives the kiosk/login defaults. */
export function loadConfig(env: NodeJS.ProcessEnv, isPackaged: boolean): TillConfig {
  // main.ts overrides this with the in-process local-server URL; the env default
  // only matters when pointing the shell at an external UI during development.
  const appUrl = (strEnv(env, 'POS_APP_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
  const kiosk = boolEnv(env, 'POS_KIOSK', isPackaged);
  const apiUrl = (strEnv(env, 'POS_API_URL') ?? 'http://localhost:4000').replace(/\/+$/, '');
  const readyUrl = (strEnv(env, 'POS_READY_URL') ?? `${apiUrl}/api/health`).replace(/\/+$/, '');
  return {
    appUrl,
    readyUrl,
    startupTimeoutMs: intEnv(env, 'POS_STARTUP_TIMEOUT_MS', 180_000),
    probeIntervalMs: intEnv(env, 'POS_PROBE_INTERVAL_MS', 1_500),
    probeTimeoutMs: intEnv(env, 'POS_PROBE_TIMEOUT_MS', 4_000),
    kiosk,
    // Kiosk implies fullscreen; otherwise fullscreen tracks the packaged default.
    fullscreen: kiosk || boolEnv(env, 'POS_FULLSCREEN', isPackaged),
    openAtLogin: boolEnv(env, 'POS_AUTOLAUNCH', isPackaged),
    allowDevtools: boolEnv(env, 'POS_DEVTOOLS', !isPackaged),
    printing: loadPrintingConfig(env),
  };
}
