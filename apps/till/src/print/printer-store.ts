import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { warn } from '../log';
import type { PrinterRole } from './types';

/** Role → Windows printer name. Absent role = not configured on this till. */
export type PrinterMap = Partial<Record<PrinterRole, string>>;

const ROLES: PrinterRole[] = ['receipt', 'kitchen', 'bar'];

/**
 * Persists the role → Windows-printer-name mapping on the till machine, chosen
 * by the operator in the Printer Settings screen. It lives in Electron's
 * `userData` dir (per-machine, not in the repo or the DB) because which physical
 * printer is which is a property of *this* PC, not the shared venue config.
 */
export class PrinterStore {
  private readonly file = join(app.getPath('userData'), 'printers.json');
  private cache: PrinterMap | null = null;

  /** The whole map, read from disk once then cached. Never throws. */
  getMap(): PrinterMap {
    if (this.cache) return this.cache;
    this.cache = this.read();
    return this.cache;
  }

  /** The configured printer name for a role, or null when unset. */
  get(role: PrinterRole): string | null {
    const name = this.getMap()[role];
    return name && name.trim() !== '' ? name : null;
  }

  /** Replace the whole map (only known roles are kept) and flush to disk. */
  setMap(map: PrinterMap): void {
    const clean: PrinterMap = {};
    for (const role of ROLES) {
      const name = map[role];
      if (typeof name === 'string' && name.trim() !== '') clean[role] = name.trim();
    }
    this.cache = clean;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(clean, null, 2), 'utf8');
    } catch (err) {
      warn(`could not save printer map to ${this.file}: ${(err as Error).message}`);
    }
  }

  private read(): PrinterMap {
    try {
      if (!existsSync(this.file)) return {};
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return {};
      const out: PrinterMap = {};
      for (const role of ROLES) {
        const name = (parsed as Record<string, unknown>)[role];
        if (typeof name === 'string' && name.trim() !== '') out[role] = name.trim();
      }
      return out;
    } catch (err) {
      warn(`could not read printer map from ${this.file}: ${(err as Error).message}`);
      return {};
    }
  }
}
