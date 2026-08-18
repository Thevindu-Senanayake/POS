import { Injectable } from '@nestjs/common';
import { Prisma } from '@pos/db';
import type { AuditAction } from '@pos/shared';
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

/**
 * Write-only audit log helper (spec §8). Accepts an optional transaction client
 * so an audit row commits atomically with the action it records. Read/report
 * endpoints are added with the reports module.
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
}
