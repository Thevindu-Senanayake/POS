import { error, log, warn } from '../log';
import { ApiClient } from './api-client';
import type { PrinterRole, PrintJobAgentDTO } from './types';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** How the host resolves a role to a Windows printer + prints one job (wired in main). */
export interface PrintAgentDeps {
  /** Windows printer name for a role, or null when the till has none configured. */
  resolveDevice: (role: PrinterRole) => Promise<string | null>;
  /** Render + silently print one job to `deviceName`; resolves to a log description. */
  printJob: (job: PrintJobAgentDTO, deviceName: string) => Promise<string>;
}

export interface PrintAgentConfig {
  agentId: string;
  pollMs: number;
  claimLimit: number;
  maxBackoffMs: number;
}

/**
 * The poll loop (spec §3), now living inside the till's Electron main process:
 * claim due jobs, render + silent-print each, report the outcome. The server
 * owns per-job retry backoff; the loop owns only its own reconnect backoff, so a
 * downed API isn't hammered.
 */
export class PrintAgent {
  private running = false;

  constructor(
    private readonly api: ApiClient,
    private readonly config: PrintAgentConfig,
    private readonly deps: PrintAgentDeps,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    log(`print host started as "${this.config.agentId}" (poll ${this.config.pollMs}ms)`);
    void this.loop();
  }

  stop(): void {
    this.running = false;
  }

  private async loop(): Promise<void> {
    let backoff = this.config.pollMs;
    while (this.running) {
      try {
        const jobs = await this.api.claim(this.config.agentId, this.config.claimLimit);
        backoff = this.config.pollMs; // healthy poll — reset reconnect backoff
        for (const job of jobs) {
          if (!this.running) break;
          await this.handle(job);
        }
        // A full batch likely means more are waiting — drain immediately;
        // anything short of full means the queue is (for now) empty, so wait.
        if (jobs.length < this.config.claimLimit) await sleep(this.config.pollMs);
      } catch (err) {
        warn(`claim failed: ${message(err)} — retrying in ${backoff}ms`);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, this.config.maxBackoffMs);
      }
    }
  }

  private async handle(job: PrintJobAgentDTO): Promise<void> {
    // KOT jobs carry a station (kitchen/bar); station-less bill jobs go to receipt.
    const role: PrinterRole = job.station ?? 'receipt';
    try {
      const device = await this.deps.resolveDevice(role);
      if (!device) {
        throw new Error(`no printer set for "${role}" — open Printer Settings (Ctrl+Shift+P)`);
      }
      const where = await this.deps.printJob(job, device);
      await this.api.reportDone(job.id, this.config.agentId);
      log(`printed ${job.type} #${job.id.slice(-6)} -> ${where}`);
    } catch (err) {
      const msg = message(err);
      warn(`job #${job.id.slice(-6)} (${job.type}) failed: ${msg}`);
      try {
        await this.api.reportFailed(job.id, this.config.agentId, msg);
      } catch (reportErr) {
        // The server reclaims stale `printing` jobs after 60s, so a lost report
        // self-heals — just surface it.
        error(`could not report failure for #${job.id.slice(-6)}: ${message(reportErr)}`);
      }
    }
  }
}
