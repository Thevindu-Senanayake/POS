import { CharacterSet, PrinterTypes, ThermalPrinter } from 'node-thermal-printer';
import type { PrintJobAgentDTO } from '@pos/shared';
import type { AgentConfig, PrinterTarget } from './config';
import { renderBill, renderKot, type ReceiptSink } from './receipt';
import { isBillPayload, isKotPayload } from './types';

const CONSOLE_WIDTH = 48;

/** Accumulates a receipt as plain text for the stdout dev fallback (no printer IP). */
class ConsoleSink implements ReceiptSink {
  private readonly lines: string[] = [];
  private align: 'left' | 'center' = 'left';

  alignCenter(): void {
    this.align = 'center';
  }
  alignLeft(): void {
    this.align = 'left';
  }
  bold(): void {}
  emphasize(): void {}
  newLine(): void {
    this.lines.push('');
  }
  cut(): void {}

  println(text: string): void {
    this.lines.push(this.align === 'center' ? this.centered(text) : text);
  }

  leftRight(left: string, right: string): void {
    const gap = Math.max(1, CONSOLE_WIDTH - left.length - right.length);
    this.lines.push(`${left}${' '.repeat(gap)}${right}`);
  }

  drawLine(): void {
    this.lines.push('-'.repeat(CONSOLE_WIDTH));
  }

  private centered(text: string): string {
    const pad = Math.max(0, Math.floor((CONSOLE_WIDTH - text.length) / 2));
    return `${' '.repeat(pad)}${text}`;
  }

  render(): string {
    return this.lines.join('\n');
  }
}

/** Thin adapter over node-thermal-printer so the layout code is device-agnostic. */
class ThermalSink implements ReceiptSink {
  constructor(private readonly printer: ThermalPrinter) {}
  alignCenter(): void {
    this.printer.alignCenter();
  }
  alignLeft(): void {
    this.printer.alignLeft();
  }
  bold(enabled: boolean): void {
    this.printer.bold(enabled);
  }
  emphasize(enabled: boolean): void {
    if (enabled) this.printer.setTextDoubleHeight();
    else this.printer.setTextNormal();
  }
  println(text: string): void {
    this.printer.println(text);
  }
  leftRight(left: string, right: string): void {
    this.printer.leftRight(left, right);
  }
  drawLine(): void {
    this.printer.drawLine();
  }
  newLine(): void {
    this.printer.newLine();
  }
  cut(): void {
    this.printer.cut();
  }
}

/** Map the DB/config printer `type` string to the library's enum (default EPSON). */
function mapPrinterType(type: string): PrinterTypes {
  switch (type.toLowerCase()) {
    case 'star':
      return PrinterTypes.STAR;
    case 'tanca':
      return PrinterTypes.TANCA;
    case 'daruma':
      return PrinterTypes.DARUMA;
    case 'brother':
      return PrinterTypes.BROTHER;
    case 'epson':
    default:
      return PrinterTypes.EPSON;
  }
}

/**
 * The USB / OS-spooler path needs a native print module (`@thiagoelg/node-printer`).
 * It's an optional dependency — built and validated on the till host the USB
 * printer is attached to. When it's absent (dev boxes, a host without the native
 * build) we degrade to stdout rather than crashing, matching the no-IP fallback.
 * Memoized: `undefined` = not yet tried, `null` = tried and unavailable.
 */
let usbDriver: object | null | undefined;
function loadUsbDriver(): object | null {
  if (usbDriver !== undefined) return usbDriver;
  try {
    // Resolved at runtime only; kept out of the dependency graph so a missing
    // native build degrades gracefully instead of failing the agent's build.
    usbDriver = require('@thiagoelg/node-printer') as object;
  } catch {
    usbDriver = null;
  }
  return usbDriver;
}

function describeKind(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'kind' in payload) {
    return String((payload as { kind: unknown }).kind);
  }
  return typeof payload;
}

function renderPayload(sink: ReceiptSink, payload: unknown): void {
  if (isKotPayload(payload)) renderKot(sink, payload);
  else if (isBillPayload(payload)) renderBill(sink, payload);
  else throw new Error(`unrecognized print payload (kind=${describeKind(payload)})`);
}

/** Render a job to stdout (the dev / no-hardware fallback); returns `note` for the log. */
function toStdout(job: PrintJobAgentDTO, note: string): string {
  const sink = new ConsoleSink();
  renderPayload(sink, job.payload);
  const heading = `${job.type.toUpperCase()} · ${job.station ?? 'receipt'} · #${job.id.slice(-6)}`;
  const rule = '='.repeat(CONSOLE_WIDTH);
  process.stdout.write(`\n${rule}\n${heading}\n${rule}\n${sink.render()}\n${rule}\n`);
  return note;
}

/**
 * Render one job to its target (spec §3.2/§3.3):
 *  - `usb` + device → the host OS spooler via the optional native driver (the
 *    customer bill/receipt printer on the till); if the driver is missing we
 *    fall back to stdout so the job still completes.
 *  - `network` + ip → a TCP ESC/POS connection (the kitchen/bar KOT printers).
 *    Fails loudly if unreachable so the server reschedules and flips the printer
 *    offline.
 *  - otherwise → stdout (dev / no hardware configured).
 * Returns a short human description of where it printed, for the agent log.
 */
export async function printReceipt(
  job: PrintJobAgentDTO,
  target: PrinterTarget,
  config: AgentConfig,
): Promise<string> {
  if (target.connection === 'usb' && target.device) {
    const driver = loadUsbDriver();
    if (!driver) {
      return toStdout(job, `stdout (USB driver unavailable for printer:${target.device})`);
    }
    const printer = new ThermalPrinter({
      type: mapPrinterType(target.type),
      interface: `printer:${target.device}`,
      driver,
      characterSet: CharacterSet.PC437_USA,
      removeSpecialCharacters: false,
    });
    renderPayload(new ThermalSink(printer), job.payload);
    await printer.execute();
    return `printer:${target.device} (${target.type}, USB)`;
  }

  if (target.ip) {
    const printer = new ThermalPrinter({
      type: mapPrinterType(target.type),
      interface: `tcp://${target.ip}:${target.port}`,
      characterSet: CharacterSet.PC437_USA,
      removeSpecialCharacters: false,
      options: { timeout: config.connectTimeoutMs },
    });
    const connected = await printer.isPrinterConnected();
    if (!connected) {
      throw new Error(`printer unreachable at ${target.ip}:${target.port}`);
    }
    renderPayload(new ThermalSink(printer), job.payload);
    await printer.execute();
    return `tcp://${target.ip}:${target.port} (${target.type})`;
  }

  return toStdout(job, 'stdout (no printer configured)');
}
