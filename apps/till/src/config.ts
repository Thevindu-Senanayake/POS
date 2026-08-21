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

/** Read + normalize the shell's configuration. `isPackaged` drives the kiosk/login defaults. */
export function loadConfig(env: NodeJS.ProcessEnv, isPackaged: boolean): TillConfig {
  const appUrl = (strEnv(env, 'POS_APP_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
  const kiosk = boolEnv(env, 'POS_KIOSK', isPackaged);
  return {
    appUrl,
    readyUrl: (strEnv(env, 'POS_READY_URL') ?? appUrl).replace(/\/+$/, ''),
    startupTimeoutMs: intEnv(env, 'POS_STARTUP_TIMEOUT_MS', 180_000),
    probeIntervalMs: intEnv(env, 'POS_PROBE_INTERVAL_MS', 1_500),
    probeTimeoutMs: intEnv(env, 'POS_PROBE_TIMEOUT_MS', 4_000),
    kiosk,
    // Kiosk implies fullscreen; otherwise fullscreen tracks the packaged default.
    fullscreen: kiosk || boolEnv(env, 'POS_FULLSCREEN', isPackaged),
    openAtLogin: boolEnv(env, 'POS_AUTOLAUNCH', isPackaged),
    allowDevtools: boolEnv(env, 'POS_DEVTOOLS', !isPackaged),
  };
}
