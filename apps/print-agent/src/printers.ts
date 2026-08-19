import type { PrinterDTO, PrintJobAgentDTO } from '@pos/shared';
import type { AgentConfig, PrinterTarget } from './config';
import { ApiClient } from './api-client';

const DEFAULT_PORT = 9100;
const DEFAULT_TYPE = 'epson';

/**
 * Role → printer routing (spec §3.2). The DB printer map is the source of
 * truth; env `PRINTER_<ROLE>_*` values override it (they win), which lets an
 * operator point the agent at real hardware without touching the DB and is also
 * how the no-hardware dev fallback is expressed (blank IP + no device → stdout).
 * KOT jobs route by their `station` (kitchen/bar); station-less bill jobs route
 * to the `receipt` printer (typically USB on the till host).
 */
export class PrinterMap {
  private byRole = new Map<string, PrinterDTO>();

  constructor(
    private readonly api: ApiClient,
    private readonly config: AgentConfig,
  ) {}

  async refresh(): Promise<void> {
    const printers = await this.api.listPrinters();
    this.byRole = new Map(printers.map((p) => [p.role, p]));
  }

  resolve(job: PrintJobAgentDTO): PrinterTarget {
    const role = job.station ?? 'receipt';
    const dbPrinter = this.byRole.get(role);
    const override = this.config.overrides[role] ?? {};
    const ip = override.ip ?? dbPrinter?.ip ?? null;
    return {
      connection: override.connection ?? dbPrinter?.connection ?? 'network',
      ip: ip && ip.length > 0 ? ip : null,
      port: override.port ?? dbPrinter?.port ?? DEFAULT_PORT,
      device: override.device ?? dbPrinter?.device ?? null,
      type: override.type ?? dbPrinter?.type ?? DEFAULT_TYPE,
    };
  }
}
