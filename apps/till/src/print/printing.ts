import { BrowserWindow } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { warn } from '../log';
import { HtmlSink } from './html-sink';
import { renderBill, renderKot } from './receipt';
import { isBillPayload, isKotPayload, type PrinterRole, type PrintJobAgentDTO } from './types';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** MIME type for a logo file, so the data: URI Chromium loads is well-formed. */
function logoMime(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.png':
    default:
      return 'image/png';
  }
}

/**
 * Read the venue logo into a data: URI once and memoize it (the file doesn't
 * change between prints). Returns null — so the bill prints headerless rather
 * than failing — when no path is configured or the file is missing.
 */
let logoCache: string | null | undefined;
export function resolveLogoDataUri(logoPath: string): string | null {
  if (logoCache !== undefined) return logoCache;
  try {
    if (!logoPath || !existsSync(logoPath)) {
      logoCache = null;
    } else {
      const b64 = readFileSync(logoPath).toString('base64');
      logoCache = `data:${logoMime(logoPath)};base64,${b64}`;
    }
  } catch (err) {
    warn(`receipt logo skipped: ${(err as Error).message}`);
    logoCache = null;
  }
  return logoCache;
}

/** Render one job's payload to a printable HTML document. Throws on an unknown payload. */
export async function renderJobHtml(
  job: PrintJobAgentDTO,
  opts: { widthMm: number; logoPath: string },
): Promise<string> {
  const sink = new HtmlSink(resolveLogoDataUri(opts.logoPath));
  const payload = job.payload;
  if (isKotPayload(payload)) renderKot(sink, payload);
  else if (isBillPayload(payload)) await renderBill(sink, payload);
  else throw new Error(`unrecognized print payload (kind=${describeKind(payload)})`);
  return sink.toDocument(opts.widthMm);
}

function describeKind(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'kind' in payload) {
    return String((payload as { kind: unknown }).kind);
  }
  return typeof payload;
}

/**
 * Print an HTML document silently to a named Windows printer. A hidden, isolated
 * BrowserWindow renders the markup, then `webContents.print` hands it to the OS
 * driver — no window is ever shown to the operator. The window is always
 * destroyed, even on failure, so a bad job can't leak renderers.
 */
export async function printHtmlToDevice(
  html: string,
  deviceName: string,
  settleMs: number,
): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, javascript: false },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    // did-finish-load (which loadURL awaits) fires after subresources including
    // the data: logo, but give the compositor a beat to paint before printing.
    if (settleMs > 0) await delay(settleMs);
    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        { silent: true, deviceName, margins: { marginType: 'none' }, printBackground: false },
        (success, failureReason) => {
          if (success) resolve();
          else reject(new Error(failureReason || 'print was cancelled'));
        },
      );
    });
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/** Render + print one claimed job to `deviceName`; returns a short log description. */
export async function printJob(
  job: PrintJobAgentDTO,
  deviceName: string,
  opts: { widthMm: number; logoPath: string; settleMs: number },
): Promise<string> {
  const html = await renderJobHtml(job, opts);
  await printHtmlToDevice(html, deviceName, opts.settleMs);
  return `"${deviceName}" (${job.station ?? 'receipt'})`;
}

/** A tiny self-describing test page, printed by the Settings screen's Test button. */
export function buildSampleHtml(role: PrinterRole, deviceName: string, widthMm: number): string {
  const sink = new HtmlSink(null);
  sink.alignCenter();
  sink.bold(true);
  sink.emphasize(true);
  sink.println('TEST PRINT');
  sink.emphasize(false);
  sink.bold(false);
  sink.println(`${role} printer`);
  sink.alignLeft();
  sink.drawLine();
  sink.println(`Device: ${deviceName}`);
  sink.println(new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }));
  sink.drawLine();
  sink.leftRight('Sample item', '1,234.00');
  sink.leftRight('Another line', '56.00');
  sink.newLine();
  sink.alignCenter();
  sink.println('If you can read this, the');
  sink.println('printer is configured correctly.');
  sink.alignLeft();
  sink.newLine();
  return sink.toDocument(widthMm);
}
