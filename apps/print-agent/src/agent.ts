import type { PrintJobAgentDTO } from '@pos/shared';
import { ApiClient } from './api-client';
import type { AgentConfig } from './config';
import { error, log, warn } from './log';
import { PrinterMap } from './printers';
import { printReceipt } from './sinks';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The poll loop (spec §3): claim due jobs, render + print each, report the
 * outcome. The server owns per-job retry backoff and printer health; the agent
 * owns only its own reconnect backoff, so a downed API isn't hammered. Built for
 * one agent per venue, matching the server's atomic claim model.
 */
export class PrintAgent {
  private running = false;
  private printerTimer?: NodeJS.Timeout;

  constructor(
    private readonly api: ApiClient,
    private readonly printers: PrinterMap,
    private readonly config: AgentConfig,
  ) {}

  async start(): Promise<void> {
    log(
      `starting "${this.config.agentId}" -> ${this.config.apiBaseUrl} (poll ${this.config.pollMs}ms)`,
    );
    await this.refreshPrinters();
    this.printerTimer = setInterval(() => void this.refreshPrinters(), this.config.printerRefreshMs);
    this.running = true;
    await this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.printerTimer) clearInterval(this.printerTimer);
  }

  private async refreshPrinters(): Promise<void> {
    try {
      await this.printers.refresh();
    } catch (err) {
      warn(`could not refresh printer map: ${message(err)}`);
    }
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
    const target = this.printers.resolve(job);
    try {
      const where = await printReceipt(job, target, this.config);
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
