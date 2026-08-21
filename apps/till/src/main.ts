import { dirname, join } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import { waitForBackend } from './backend';
import { loadConfig } from './config';
import { loadEnvFiles } from './env';
import { error, log, warn } from './log';
import { PrintAgent } from './print/agent';
import { ApiClient } from './print/api-client';
import { PrinterStore } from './print/printer-store';
import { buildSampleHtml, printHtmlToDevice, printJob } from './print/printing';
import type { PrinterRole } from './print/types';

// app.isPackaged is valid before `whenReady`; it drives the kiosk/login defaults.
// A packaged till has no dotenv-cli, so pull config from a till.env dropped beside
// the exe (or in userData) before reading it — real env vars still take precedence.
const loadedEnvFiles = app.isPackaged
  ? loadEnvFiles(dirname(app.getPath('exe')), app.getPath('userData'))
  : [];
const config = loadConfig(process.env, app.isPackaged);

// Static splash + error pages live next to dist/ (dist/main.js -> ../static/*).
const STATIC_DIR = join(__dirname, '..', 'static');
const LOADING_PAGE = join(STATIC_DIR, 'loading.html');
const ERROR_PAGE = join(STATIC_DIR, 'error.html');

let win: BrowserWindow | null = null;
/** The Printer Settings window, when open (a separate closable window over the till). */
let settingsWin: BrowserWindow | null = null;
/** Per-machine role → printer map; created on `whenReady` (needs app paths). */
let store: PrinterStore | null = null;
/** The in-process print host; only started when a print token is configured. */
let agent: PrintAgent | null = null;
/** True while connect() is mid-flight, so did-fail-load doesn't fight the retry logic. */
let connecting = false;

function createWindow(): void {
  win = new BrowserWindow({
    show: false,
    fullscreen: config.fullscreen,
    kiosk: config.kiosk,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: config.allowDevtools,
    },
  });

  // No native menu bar on the till.
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win?.show());

  // target=_blank / window.open → OS browser, never a rogue Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // A hard navigation failure (backend went away mid-session) → back to the retry
  // screen. Ignore user-cancelled loads (-3) and sub-frame failures, and stay out
  // of the way while connect() is already driving the window.
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || connecting) return;
    warn(`load failed (${code} ${desc}) for ${url}`);
    void win?.loadFile(ERROR_PAGE);
  });

  wireShortcuts(win);
  win.on('closed', () => {
    win = null;
  });
}

/** Technician escape hatches — the operator never needs these, but support does. */
function wireShortcuts(w: BrowserWindow): void {
  w.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (config.allowDevtools && (key === 'f12' || (input.control && input.shift && key === 'i'))) {
      w.webContents.toggleDevTools();
      event.preventDefault();
    }
    // Ctrl+Shift+Q — leave kiosk / quit the shell entirely.
    if (input.control && input.shift && key === 'q') {
      app.quit();
      event.preventDefault();
    }
    // Ctrl+Shift+R — force a fresh reconnect (re-runs the readiness wait).
    if (input.control && input.shift && key === 'r') {
      void connect();
      event.preventDefault();
    }
    // Ctrl+Shift+P — open the Printer Settings window (works even in kiosk mode).
    if (input.control && input.shift && key === 'p') {
      openSettings();
      event.preventDefault();
    }
  });
}

/**
 * Show the splash, wait for the backend, then load the web UI. On timeout (or an
 * unexpected error) fall back to the retry screen. Re-entrancy is guarded so a
 * Retry click or Ctrl+Shift+R can't stack overlapping waits.
 */
async function connect(): Promise<void> {
  if (!win || connecting) return;
  connecting = true;
  try {
    await win.loadFile(LOADING_PAGE);
    log(`waiting for backend at ${config.readyUrl} …`);
    const ready = await waitForBackend(config.readyUrl, {
      intervalMs: config.probeIntervalMs,
      timeoutMs: config.startupTimeoutMs,
      probeTimeoutMs: config.probeTimeoutMs,
      onAttempt: (n) => {
        if (n === 1 || n % 10 === 0) log(`backend not ready yet (attempt ${n})`);
      },
    });
    if (!win) return;
    if (ready) {
      log(`loading app UI: ${config.appUrl}`);
      await win.loadURL(config.appUrl);
    } else {
      warn(`backend did not come online within ${config.startupTimeoutMs}ms`);
      await win.loadFile(ERROR_PAGE);
    }
  } catch (err) {
    error(`connect failed: ${err instanceof Error ? err.message : String(err)}`);
    await win?.loadFile(ERROR_PAGE);
  } finally {
    connecting = false;
  }
}

/** Enumerate installed Windows printers via a live webContents (main window, or a throwaway). */
async function getSystemPrinters(): Promise<Electron.PrinterInfo[]> {
  const contents = win?.webContents;
  if (contents && !contents.isDestroyed()) return contents.getPrintersAsync();
  const tmp = new BrowserWindow({ show: false });
  try {
    return await tmp.webContents.getPrintersAsync();
  } finally {
    tmp.destroy();
  }
}

/**
 * Resolve a job's role to a Windows printer name. The operator's per-till choice
 * (Printer Settings) wins; if the `receipt` role is unset we fall back to the OS
 * default printer so a fresh till still prints bills. KOT roles stay strict —
 * a kitchen ticket sent to the wrong printer is worse than one that didn't print.
 */
async function resolveDevice(role: PrinterRole): Promise<string | null> {
  const configured = store?.get(role) ?? null;
  if (configured) return configured;
  if (role === 'receipt') {
    const def = (await getSystemPrinters()).find((p) => p.isDefault);
    if (def) {
      warn(`receipt printer unset — using Windows default "${def.name}"`);
      return def.name;
    }
  }
  return null;
}

/** Open (or focus) the Printer Settings window. Available with or without a print token. */
function openSettings(): void {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 560,
    height: 580,
    parent: win ?? undefined,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    title: 'Printer Settings',
    webPreferences: {
      preload: join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.once('ready-to-show', () => settingsWin?.show());
  void settingsWin.loadFile(join(STATIC_DIR, 'settings.html'));
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

/** IPC surface for the Printer Settings screen (enumerate, save, test-print, close). */
function registerSettingsIpc(): void {
  ipcMain.handle('settings:list', async () => {
    const printers = (await getSystemPrinters()).map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: p.isDefault,
    }));
    const map = store?.getMap() ?? {};
    return {
      printers,
      config: { receipt: map.receipt ?? null, kitchen: map.kitchen ?? null, bar: map.bar ?? null },
    };
  });

  ipcMain.handle('settings:save', (_e, map: Partial<Record<PrinterRole, string>>) => {
    store?.setMap(map);
    log(`printer map saved: ${JSON.stringify(store?.getMap() ?? {})}`);
    return { ok: true };
  });

  ipcMain.handle('settings:test', async (_e, arg: { role: PrinterRole; deviceName: string }) => {
    try {
      const html = buildSampleHtml(arg.role, arg.deviceName, config.printing.widthMm);
      await printHtmlToDevice(html, arg.deviceName, config.printing.settleMs, config.printing.widthMm);
      log(`test print sent for "${arg.role}" -> "${arg.deviceName}"`);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warn(`test print for "${arg.role}" failed: ${msg}`);
      return { ok: false, error: msg };
    }
  });

  ipcMain.on('settings:close', () => {
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close();
  });
}

/**
 * Start the in-process print host: poll the API for jobs and silent-print each
 * to the operator's chosen Windows printer. A till with no `PRINT_AGENT_TOKEN`
 * skips this and runs as a pure UI shell.
 */
function startPrintHost(): void {
  if (!config.printing.enabled) {
    log('print host disabled (no PRINT_AGENT_TOKEN) — running as UI shell only');
    return;
  }
  const api = new ApiClient(config.printing.apiBaseUrl, config.printing.token);
  agent = new PrintAgent(api, config.printing, {
    resolveDevice,
    printJob: (job, deviceName) =>
      printJob(job, deviceName, {
        widthMm: config.printing.widthMm,
        logoPath: config.printing.logoPath,
        settleMs: config.printing.settleMs,
      }),
  });
  agent.start();
}

// Single-instance: a second launch just focuses the running window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    for (const f of loadedEnvFiles) log(`loaded config from ${f}`);
    // Pairs with Docker Desktop's "start on sign-in": the till comes up on its own.
    app.setLoginItemSettings({ openAtLogin: config.openAtLogin });
    store = new PrinterStore();
    ipcMain.on('till:retry', () => void connect());
    registerSettingsIpc();
    createWindow();
    void connect();
    // The print host runs independently of the window — start it once, up front.
    startPrintHost();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        void connect();
      }
    });
  });

  app.on('before-quit', () => agent?.stop());

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
