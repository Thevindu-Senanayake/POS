import { contextBridge, ipcRenderer } from 'electron';

/** One entry as `webContents.getPrintersAsync()` returns it (trimmed to what the UI needs). */
export interface PrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
}

export interface SettingsSnapshot {
  printers: PrinterInfo[];
  /** Current role → printer-name mapping saved on this till. */
  config: { receipt: string | null; kitchen: string | null; bar: string | null };
}

export type PrinterRole = 'receipt' | 'kitchen' | 'bar';

/**
 * Bridge for the Printer Settings screen. contextIsolation is on, so the page
 * only ever sees these four functions — never Node or the rest of Electron.
 */
contextBridge.exposeInMainWorld('tillSettings', {
  load: (): Promise<SettingsSnapshot> => ipcRenderer.invoke('settings:list'),
  save: (map: Record<PrinterRole, string>): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('settings:save', map),
  test: (role: PrinterRole, deviceName: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('settings:test', { role, deviceName }),
  close: (): void => ipcRenderer.send('settings:close'),
});
