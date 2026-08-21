import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import { waitForBackend } from './backend';
import { loadConfig } from './config';
import { error, log, warn } from './log';

// app.isPackaged is valid before `whenReady`; it drives the kiosk/login defaults.
const config = loadConfig(process.env, app.isPackaged);

// Static splash + error pages live next to dist/ (dist/main.js -> ../static/*).
const STATIC_DIR = join(__dirname, '..', 'static');
const LOADING_PAGE = join(STATIC_DIR, 'loading.html');
const ERROR_PAGE = join(STATIC_DIR, 'error.html');

let win: BrowserWindow | null = null;
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
    // Pairs with Docker Desktop's "start on sign-in": the till comes up on its own.
    app.setLoginItemSettings({ openAtLogin: config.openAtLogin });
    ipcMain.on('till:retry', () => void connect());
    createWindow();
    void connect();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        void connect();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
