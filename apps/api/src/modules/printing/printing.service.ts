import { Injectable, NotFoundException } from '@nestjs/common';
import type { PrintJob, Printer } from '@pos/db';
import type { PrinterDTO, PrinterRole, PrintJobAgentDTO, PrintJobDTO, PrintJobStatus } from '@pos/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ClaimJobsDto } from './dto/claim-jobs.dto';
import { ReportDoneDto, ReportFailedDto } from './dto/report-job.dto';
import { UpdatePrinterDto } from './dto/update-printer.dto';

/** Retry backoff: 5s, 10s, 20s, ... capped at 5 minutes (spec §3.3). */
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_CAP_MS = 300_000;
/** A job stuck `printing` longer than this is assumed abandoned (agent crash) and reclaimable. */
const STALE_CLAIM_MS = 60_000;
const DEFAULT_AGENT_ID = 'print-agent';
const DEFAULT_CLAIM_LIMIT = 10;
const DEFAULT_LIST_LIMIT = 100;

/**
 * The print queue (spec §3). Orders/bills enqueue `PrintJob` rows; the LAN
 * print-agent claims due jobs, renders ESC/POS, and reports done/failed here.
 * Failures retry with exponential backoff up to `maxAttempts`, after which the
 * job is marked `failed`; repeated failure flips the station's printer health
 * offline and broadcasts `printer:health` so the admin sees a loud banner.
 *
 * Written for a single agent per venue (spec §3): the claim path is safe under
 * that assumption and self-heals jobs abandoned by a crashed agent.
 */
@Injectable()
export class PrintingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // --- Agent-facing (authenticated by print-agent token) -----------------

  /**
   * Atomically claim up to `limit` jobs that are due (`pending` with
   * `nextAttemptAt` reached) or abandoned (`printing` past the stale window).
   * Claimed jobs move to `printing`, are stamped with the agent id, and have
   * their attempt counter incremented.
   */
  async claim(dto: ClaimJobsDto): Promise<PrintJobAgentDTO[]> {
    const agentId = dto.agentId ?? DEFAULT_AGENT_ID;
    const limit = dto.limit ?? DEFAULT_CLAIM_LIMIT;

    const claimed = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);

      const candidates = await tx.printJob.findMany({
        where: {
          OR: [
            { status: 'pending', nextAttemptAt: { lte: now } },
            { status: 'printing', claimedAt: { lt: staleBefore } },
          ],
        },
        orderBy: { nextAttemptAt: 'asc' },
        take: limit,
        select: { id: true },
      });
      const ids = candidates.map((c) => c.id);
      if (ids.length === 0) return [];

      await tx.printJob.updateMany({
        where: { id: { in: ids }, status: { in: ['pending', 'printing'] } },
        data: {
          status: 'printing',
          claimedBy: agentId,
          claimedAt: now,
          attempts: { increment: 1 },
        },
      });

      return tx.printJob.findMany({
        where: { id: { in: ids }, status: 'printing', claimedBy: agentId },
        orderBy: { nextAttemptAt: 'asc' },
      });
    });

    return claimed.map((job) => this.toAgentDTO(job));
  }

  /** Agent confirms a job printed: mark done and flip that printer's health online. */
  async reportDone(id: string, dto: ReportDoneDto): Promise<PrintJobDTO> {
    const job = await this.loadJobOrThrow(id);
    const updated = await this.prisma.printJob.update({
      where: { id },
      data: { status: 'done', printedAt: new Date(), lastError: null },
    });
    // Station-less bill jobs belong to the `receipt` (USB) printer, so its health
    // is now tracked too — previously untracked because it had no station.
    const role: PrinterRole = dto.station ?? job.station ?? 'receipt';
    await this.markPrinter(role, true, null);
    return this.toJobDTO(updated);
  }

  /**
   * Agent reports a job failed. Reschedule with backoff while attempts remain,
   * else mark `failed`; either way flip that printer's health offline (loud
   * banner via `printer:health`).
   */
  async reportFailed(id: string, dto: ReportFailedDto): Promise<PrintJobDTO> {
    const job = await this.loadJobOrThrow(id);
    const willRetry = job.attempts < job.maxAttempts;
    const updated = await this.prisma.printJob.update({
      where: { id },
      data: {
        status: willRetry ? 'pending' : 'failed',
        lastError: dto.error,
        claimedBy: null,
        claimedAt: null,
        ...(willRetry
          ? { nextAttemptAt: new Date(Date.now() + this.backoffMs(job.attempts)) }
          : {}),
      },
    });
    const role: PrinterRole = dto.station ?? job.station ?? 'receipt';
    await this.markPrinter(role, false, dto.error);
    return this.toJobDTO(updated);
  }

  /** Printer registry the agent uses to route jobs (by role) to a LAN/USB target. */
  async listPrinters(): Promise<PrinterDTO[]> {
    const printers = await this.prisma.printer.findMany({ orderBy: { role: 'asc' } });
    return printers.map((p) => this.toPrinterDTO(p));
  }

  // --- Admin-facing (JWT + admin role) -----------------------------------

  async listJobs(filter: { status?: PrintJobStatus; limit?: number }): Promise<PrintJobDTO[]> {
    const jobs = await this.prisma.printJob.findMany({
      where: filter.status ? { status: filter.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? DEFAULT_LIST_LIMIT,
    });
    return jobs.map((j) => this.toJobDTO(j));
  }

  /** Manual admin recovery: reset a job to a fresh full retry budget, due now. */
  async retryJob(id: string): Promise<PrintJobDTO> {
    await this.loadJobOrThrow(id);
    const updated = await this.prisma.printJob.update({
      where: { id },
      data: {
        status: 'pending',
        attempts: 0,
        lastError: null,
        nextAttemptAt: new Date(),
        claimedBy: null,
        claimedAt: null,
        printedAt: null,
      },
    });
    return this.toJobDTO(updated);
  }

  /** Configure a printer (LAN address, profile) or manually clear a stuck offline. */
  async updatePrinter(id: string, dto: UpdatePrinterDto): Promise<PrinterDTO> {
    const printer = await this.prisma.printer.findUnique({ where: { id } });
    if (!printer) throw new NotFoundException('Printer not found');
    const healthChanged = dto.online !== undefined && dto.online !== printer.online;

    const updated = await this.prisma.printer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.connection !== undefined ? { connection: dto.connection } : {}),
        ...(dto.ip !== undefined ? { ip: dto.ip } : {}),
        ...(dto.port !== undefined ? { port: dto.port } : {}),
        ...(dto.device !== undefined ? { device: dto.device } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.online !== undefined
          ? { online: dto.online, ...(dto.online ? { lastError: null } : {}) }
          : {}),
      },
    });

    if (healthChanged) {
      this.realtime.emitPrinterHealth({
        printerId: updated.id,
        name: updated.name,
        online: updated.online,
        lastError: updated.lastError,
      });
    }
    return this.toPrinterDTO(updated);
  }

  // --- Helpers -----------------------------------------------------------

  /** Reflect a printer's reachability; broadcast only when the online state flips. */
  private async markPrinter(role: PrinterRole, online: boolean, error: string | null): Promise<void> {
    const printer = await this.prisma.printer.findUnique({ where: { role } });
    if (!printer) return;
    const changed = printer.online !== online;
    const updated = await this.prisma.printer.update({
      where: { role },
      data: {
        online,
        lastError: online ? null : error,
        ...(online ? { lastSeenAt: new Date() } : {}),
      },
    });
    if (changed) {
      this.realtime.emitPrinterHealth({
        printerId: updated.id,
        name: updated.name,
        online: updated.online,
        lastError: updated.lastError,
      });
    }
  }

  private backoffMs(attempts: number): number {
    return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_CAP_MS);
  }

  private async loadJobOrThrow(id: string): Promise<PrintJob> {
    const job = await this.prisma.printJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Print job not found');
    return job;
  }

  private toAgentDTO(job: PrintJob): PrintJobAgentDTO {
    return {
      id: job.id,
      type: job.type,
      station: job.station,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      payload: job.payload,
    };
  }

  private toJobDTO(job: PrintJob): PrintJobDTO {
    return {
      id: job.id,
      type: job.type,
      station: job.station,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      lastError: job.lastError,
      orderId: job.orderId,
      billId: job.billId,
      nextAttemptAt: job.nextAttemptAt.toISOString(),
      claimedBy: job.claimedBy,
      printedAt: job.printedAt ? job.printedAt.toISOString() : null,
      createdAt: job.createdAt.toISOString(),
    };
  }

  private toPrinterDTO(printer: Printer): PrinterDTO {
    return {
      id: printer.id,
      role: printer.role,
      name: printer.name,
      connection: printer.connection,
      ip: printer.ip,
      port: printer.port,
      device: printer.device,
      type: printer.type,
      online: printer.online,
      lastSeenAt: printer.lastSeenAt ? printer.lastSeenAt.toISOString() : null,
      lastError: printer.lastError,
    };
  }
}
