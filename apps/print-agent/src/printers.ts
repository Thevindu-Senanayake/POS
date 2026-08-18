import type { PrinterDTO, PrintJobAgentDTO } from '@pos/shared';
import type { AgentConfig, PrinterTarget } from './config';
import { ApiClient } from './api-client';

const DEFAULT_PORT = 9100;
const DEFAULT_TYPE = 'epson';

/**
 * Station → printer routing (spec §3.2). The DB printer map is the source of
 * truth; env `PRINTER_<STATION>_*` values override it (they win), which lets an
 * operator point the agent at real hardware without touching the DB and is also
 * how the no-IP dev fallback is expressed (blank IP → stdout). Station-less bill
 * jobs route to the optional `receipt` target.
 */
export class PrinterMap {
  private byStation = new Map<string, PrinterDTO>();

  constructor(
    private readonly api: ApiClient,
    private readonly config: AgentConfig,
  ) {}

  async refresh(): Promise<void> {
    const printers = await this.api.listPrinters();
    this.byStation = new Map(printers.map((p) => [p.station, p]));
  }

  resolve(job: PrintJobAgentDTO): PrinterTarget {
    const overrideKey = job.station ?? 'receipt';
    const dbPrinter = job.station ? this.byStation.get(job.station) : undefined;
    const override = this.config.overrides[overrideKey] ?? {};
    const ip = override.ip ?? dbPrinter?.ip ?? null;
    return {
      ip: ip && ip.length > 0 ? ip : null,
      port: override.port ?? dbPrinter?.port ?? DEFAULT_PORT,
      type: override.type ?? dbPrinter?.type ?? DEFAULT_TYPE,
    };
  }
}
