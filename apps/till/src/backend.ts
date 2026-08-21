import { log } from './log';

interface WaitOptions {
  intervalMs: number;
  timeoutMs: number;
  probeTimeoutMs: number;
  /** Called before each wait so the caller can update the splash / log progress. */
  onAttempt?: (attempt: number) => void;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One readiness probe. Any HTTP response below 500 means the server is up and
 * serving (a 200 from Next, a 3xx redirect, even a 404 — the socket answered);
 * a 5xx or a transport error (connection refused, DNS, timeout) means not-ready.
 */
async function probeOnce(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'manual' });
    return res.status > 0 && res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Poll `url` until it responds or `timeoutMs` elapses. Returns true once the
 * backend answers, false on timeout. Lets the shell show a splash while Docker
 * Desktop spins the stack up after a cold boot instead of flashing a Chromium
 * "connection refused" error page.
 */
export async function waitForBackend(url: string, opts: WaitOptions): Promise<boolean> {
  const deadline = Date.now() + opts.timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    if (await probeOnce(url, opts.probeTimeoutMs)) {
      log(`backend responded after ${attempt} probe(s)`);
      return true;
    }
    opts.onAttempt?.(attempt);
    await delay(opts.intervalMs);
  }
  return false;
}
