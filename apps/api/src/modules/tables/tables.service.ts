import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@pos/db';
import type { DiningTableDTO, TableArea, TableSessionDTO } from '@pos/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';

/** Order statuses that keep a session live; a session may only close/clean past these. */
const OPEN_ORDER_STATUSES: Prisma.OrderWhereInput['status'] = {
  notIn: ['paid', 'cancelled'],
};

const SESSION_INCLUDE = {
  table: { select: { name: true, area: true } },
  orders: {
    where: { status: OPEN_ORDER_STATUSES },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.TableSessionInclude;

type SessionWithRelations = Prisma.TableSessionGetPayload<{
  include: typeof SESSION_INCLUDE;
}>;

const TABLE_INCLUDE = {
  sessions: {
    where: { closedAt: null },
    orderBy: { openedAt: 'desc' },
    include: {
      orders: {
        where: { status: OPEN_ORDER_STATUSES },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  },
} satisfies Prisma.DiningTableInclude;

type TableWithRelations = Prisma.DiningTableGetPayload<{
  include: typeof TABLE_INCLUDE;
}>;

/**
 * Dining tables and their sessions (spec §2.6). A table carries an open
 * TableSession while occupied; orders belong to the session. Transfer/merge are
 * pre-billing manager actions that always write an AuditLog row (spec §7).
 */
@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // --- Table reads / config ---------------------------------------------

  async listTables(area?: TableArea): Promise<DiningTableDTO[]> {
    const tables = await this.prisma.diningTable.findMany({
      where: area ? { area } : undefined,
      include: TABLE_INCLUDE,
      orderBy: [{ area: 'asc' }, { name: 'asc' }],
    });
    return tables.map((t) => this.toTableDTO(t));
  }

  async getTable(id: string): Promise<DiningTableDTO> {
    const table = await this.prisma.diningTable.findUnique({
      where: { id },
      include: TABLE_INCLUDE,
    });
    if (!table) throw new NotFoundException('Table not found');
    return this.toTableDTO(table);
  }

  async createTable(dto: CreateTableDto): Promise<DiningTableDTO> {
    const table = await this.prisma.diningTable.create({
      data: {
        area: dto.area,
        name: dto.name,
        capacity: dto.capacity ?? 2,
      },
      include: TABLE_INCLUDE,
    });
    this.realtime.emitTablesUpdated();
    return this.toTableDTO(table);
  }

  async updateTable(id: string, dto: UpdateTableDto): Promise<DiningTableDTO> {
    await this.getTable(id);
    const table = await this.prisma.diningTable.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: TABLE_INCLUDE,
    });
    this.realtime.emitTablesUpdated();
    return this.toTableDTO(table);
  }

  /** Delete a never-used table; refuse if any session references it (keeps history). */
  async deleteTable(id: string): Promise<void> {
    const table = await this.prisma.diningTable.findUnique({
      where: { id },
      include: { _count: { select: { sessions: true } } },
    });
    if (!table) throw new NotFoundException('Table not found');
    if (table._count.sessions > 0) {
      throw new ConflictException(
        'Table has session history and cannot be deleted; mark it out of service instead',
      );
    }
    await this.prisma.diningTable.delete({ where: { id } });
    this.realtime.emitTablesUpdated();
  }

  /** Return a cleaned table to service (needs_cleaning -> free). */
  async cleanTable(id: string): Promise<DiningTableDTO> {
    const table = await this.prisma.diningTable.findUnique({
      where: { id },
      include: { sessions: { where: { closedAt: null }, select: { id: true } } },
    });
    if (!table) throw new NotFoundException('Table not found');
    if (table.sessions.length > 0) {
      throw new ConflictException('Cannot clean a table with an open session');
    }
    if (table.status !== 'needs_cleaning') {
      // Idempotent for a table that's already free; block genuinely wrong states.
      if (table.status === 'free') return this.getTable(id);
      throw new ConflictException(`Table is ${table.status}, not awaiting cleaning`);
    }
    await this.prisma.diningTable.update({
      where: { id },
      data: { status: 'free' },
    });
    this.realtime.emitTablesUpdated();
    return this.getTable(id);
  }

  // --- Session reads -----------------------------------------------------

  async listSessions(openOnly = false): Promise<TableSessionDTO[]> {
    const sessions = await this.prisma.tableSession.findMany({
      where: openOnly ? { closedAt: null } : undefined,
      include: SESSION_INCLUDE,
      orderBy: { openedAt: 'desc' },
    });
    return sessions.map((s) => this.toSessionDTO(s));
  }

  async getSession(id: string): Promise<TableSessionDTO> {
    const session = await this.loadSessionOrThrow(id);
    return this.toSessionDTO(session);
  }

  // --- Session lifecycle -------------------------------------------------

  /** Open a session on a free table; sets it occupied. */
  async openSession(
    tableId: string,
    waiterId: string | undefined,
    userId: string,
  ): Promise<TableSessionDTO> {
    const session = await this.prisma.$transaction(async (tx) => {
      const table = await tx.diningTable.findUnique({ where: { id: tableId } });
      if (!table) throw new NotFoundException('Table not found');

      const open = await tx.tableSession.findFirst({
        where: { tableId, closedAt: null },
        select: { id: true },
      });
      if (open) throw new ConflictException('Table already has an open session');
      if (table.status === 'needs_cleaning') {
        throw new ConflictException('Table needs cleaning before it can be reused');
      }

      const resolvedWaiterId = await this.resolveWaiterId(tx, waiterId, userId);

      const created = await tx.tableSession.create({
        data: { tableId, waiterId: resolvedWaiterId },
        include: SESSION_INCLUDE,
      });
      await tx.diningTable.update({
        where: { id: tableId },
        data: { status: 'occupied' },
      });
      return created;
    });
    this.realtime.emitTablesUpdated();
    return this.toSessionDTO(session);
  }

  /** Close a session once every order on it is settled or cancelled. */
  async closeSession(id: string): Promise<TableSessionDTO> {
    const session = await this.prisma.$transaction(async (tx) => {
      const current = await tx.tableSession.findUnique({
        where: { id },
        include: { orders: { select: { status: true } } },
      });
      if (!current) throw new NotFoundException('Table session not found');
      if (current.closedAt) throw new ConflictException('Session is already closed');

      const hasOpenOrder = current.orders.some(
        (o) => o.status !== 'paid' && o.status !== 'cancelled',
      );
      if (hasOpenOrder) {
        throw new ConflictException(
          'Settle or cancel all orders before closing the session',
        );
      }

      await tx.tableSession.update({
        where: { id },
        data: { closedAt: new Date() },
      });
      // A table that served guests needs cleaning; an unused one goes straight back to free.
      await tx.diningTable.update({
        where: { id: current.tableId },
        data: { status: current.orders.length > 0 ? 'needs_cleaning' : 'free' },
      });
      return tx.tableSession.findUniqueOrThrow({
        where: { id },
        include: SESSION_INCLUDE,
      });
    });
    this.realtime.emitTablesUpdated();
    return this.toSessionDTO(session);
  }

  // --- Transfer / merge (manager actions + audit) ------------------------

  /** Reassign an open session to another free table (spec §2.6/§7). */
  async transfer(
    sessionId: string,
    toTableId: string,
    userId: string,
    approverId: string | undefined,
  ): Promise<TableSessionDTO> {
    const session = await this.prisma.$transaction(async (tx) => {
      const current = await tx.tableSession.findUnique({
        where: { id: sessionId },
      });
      if (!current) throw new NotFoundException('Table session not found');
      if (current.closedAt) {
        throw new ConflictException('Cannot transfer a closed session');
      }
      if (current.tableId === toTableId) {
        throw new BadRequestException('Session is already at that table');
      }

      const toTable = await tx.diningTable.findUnique({ where: { id: toTableId } });
      if (!toTable) throw new BadRequestException('Target table not found');

      const targetOpen = await tx.tableSession.findFirst({
        where: { tableId: toTableId, closedAt: null },
        select: { id: true },
      });
      if (targetOpen) {
        throw new ConflictException('Target table already has an open session');
      }
      if (toTable.status === 'needs_cleaning') {
        throw new ConflictException('Target table needs cleaning before it can be used');
      }

      const fromTableId = current.tableId;
      await tx.tableSession.update({
        where: { id: sessionId },
        data: { tableId: toTableId },
      });
      await tx.diningTable.update({
        where: { id: toTableId },
        data: { status: 'occupied' },
      });
      await tx.diningTable.update({
        where: { id: fromTableId },
        data: { status: 'free' },
      });
      await this.audit.record(
        {
          action: 'transfer_table',
          entityType: 'table_session',
          entityId: sessionId,
          actorId: userId,
          approverId: approverId ?? null,
          metadata: { fromTableId, toTableId },
        },
        tx,
      );
      return tx.tableSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: SESSION_INCLUDE,
      });
    });
    this.realtime.emitTablesUpdated();
    return this.toSessionDTO(session);
  }

  /**
   * Fold a source session's open orders into a target session, then close the
   * source and free its table (spec §2.6/§7). When the target has an active
   * order the source items are merged into it (same channel required); otherwise
   * the source's orders are simply reassigned to the target session.
   */
  async merge(
    targetSessionId: string,
    sourceSessionId: string,
    userId: string,
    approverId: string | undefined,
  ): Promise<TableSessionDTO> {
    if (targetSessionId === sourceSessionId) {
      throw new BadRequestException('Cannot merge a session into itself');
    }

    const session = await this.prisma.$transaction(async (tx) => {
      const target = await tx.tableSession.findUnique({
        where: { id: targetSessionId },
        include: {
          orders: {
            where: { status: OPEN_ORDER_STATUSES },
            orderBy: { createdAt: 'asc' },
            select: { id: true, channel: true },
          },
        },
      });
      if (!target) throw new NotFoundException('Target session not found');
      if (target.closedAt) {
        throw new ConflictException('Target session is closed');
      }

      const source = await tx.tableSession.findUnique({
        where: { id: sourceSessionId },
        include: {
          orders: {
            where: { status: OPEN_ORDER_STATUSES },
            orderBy: { createdAt: 'asc' },
            select: { id: true, channel: true },
          },
        },
      });
      if (!source) throw new NotFoundException('Source session not found');
      if (source.closedAt) {
        throw new ConflictException('Source session is closed');
      }
      if (source.orders.length === 0) {
        throw new BadRequestException('Source session has no open order to merge');
      }

      const targetOrder = target.orders[0] ?? null;
      const mergedOrderIds = source.orders.map((o) => o.id);

      if (targetOrder) {
        for (const order of source.orders) {
          if (order.channel !== targetOrder.channel) {
            throw new BadRequestException(
              'Cannot merge orders from different channels',
            );
          }
          await tx.orderItem.updateMany({
            where: { orderId: order.id },
            data: { orderId: targetOrder.id },
          });
          await tx.discount.updateMany({
            where: { orderId: order.id },
            data: { orderId: targetOrder.id },
          });
          // Source order is now empty (items + discounts moved); remove it.
          await tx.order.delete({ where: { id: order.id } });
        }
      } else {
        // Target has no active order: adopt the source's orders wholesale.
        await tx.order.updateMany({
          where: { id: { in: mergedOrderIds } },
          data: { tableSessionId: targetSessionId },
        });
      }

      await tx.tableSession.update({
        where: { id: sourceSessionId },
        data: { closedAt: new Date() },
      });
      await tx.diningTable.update({
        where: { id: source.tableId },
        data: { status: 'free' },
      });
      await this.audit.record(
        {
          action: 'merge_table',
          entityType: 'table_session',
          entityId: targetSessionId,
          actorId: userId,
          approverId: approverId ?? null,
          metadata: {
            sourceSessionId,
            targetSessionId,
            fromTableId: source.tableId,
            toTableId: target.tableId,
            mergedInto: targetOrder?.id ?? null,
            mergedOrderIds,
          },
        },
        tx,
      );
      return tx.tableSession.findUniqueOrThrow({
        where: { id: targetSessionId },
        include: SESSION_INCLUDE,
      });
    });
    this.realtime.emitTablesUpdated();
    return this.toSessionDTO(session);
  }

  // --- Private helpers ---------------------------------------------------

  private async resolveWaiterId(
    tx: Prisma.TransactionClient,
    waiterId: string | undefined,
    userId: string,
  ): Promise<string> {
    if (!waiterId || waiterId === userId) return userId;
    const waiter = await tx.user.findUnique({
      where: { id: waiterId },
      select: { id: true },
    });
    if (!waiter) throw new BadRequestException('Waiter not found');
    return waiter.id;
  }

  private async loadSessionOrThrow(id: string): Promise<SessionWithRelations> {
    const session = await this.prisma.tableSession.findUnique({
      where: { id },
      include: SESSION_INCLUDE,
    });
    if (!session) throw new NotFoundException('Table session not found');
    return session;
  }

  private toTableDTO(table: TableWithRelations): DiningTableDTO {
    const activeSession = table.sessions[0] ?? null;
    return {
      id: table.id,
      area: table.area,
      name: table.name,
      capacity: table.capacity,
      status: table.status,
      activeSessionId: activeSession?.id ?? null,
      activeOrderId: activeSession?.orders[0]?.id ?? null,
    };
  }

  private toSessionDTO(session: SessionWithRelations): TableSessionDTO {
    return {
      id: session.id,
      tableId: session.tableId,
      tableName: session.table.name,
      area: session.table.area,
      waiterId: session.waiterId,
      openedAt: session.openedAt.toISOString(),
      closedAt: session.closedAt ? session.closedAt.toISOString() : null,
      orderIds: session.orders.map((o) => o.id),
    };
  }
}
