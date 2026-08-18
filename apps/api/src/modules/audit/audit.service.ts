import { Injectable } from '@nestjs/common';
import { Prisma } from '@pos/db';
import type { AuditAction, AuditLogDTO } from '@pos/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditInput {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
  actorId?: string | null;
  approverId?: string | null;
}

const DEFAULT_AUDIT_LIMIT = 100;
const MAX_AUDIT_LIMIT = 500;

/**
 * Audit log helper (spec §8). {@link record} accepts an optional transaction
 * client so an audit row commits atomically with the action it records;
 * {@link list} is the admin read exposed through the reports module.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client: Prisma.TransactionClient = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        reason: input.reason ?? null,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        actorId: input.actorId ?? null,
        approverId: input.approverId ?? null,
      },
    });
  }

  /** Most-recent-first audit trail, resolving actor/approver display names. */
  async list(filter: { action?: AuditAction; limit?: number } = {}): Promise<AuditLogDTO[]> {
    const take = Math.min(Math.max(filter.limit ?? DEFAULT_AUDIT_LIMIT, 1), MAX_AUDIT_LIMIT);
    const rows = await this.prisma.auditLog.findMany({
      where: filter.action ? { action: filter.action } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        actor: { select: { name: true } },
        approver: { select: { name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      reason: r.reason,
      actorName: r.actor?.name ?? null,
      approverName: r.approver?.name ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
