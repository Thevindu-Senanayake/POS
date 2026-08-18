import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { WS_EVENTS } from '@pos/shared';
import type { KotCreatedEvent, OrderDTO, PrinterHealthEvent } from '@pos/shared';
import type { Server, Socket } from 'socket.io';
import type { AuthenticatedUser, JwtPayload } from '../../common/types';

/**
 * socket.io gateway broadcasting live board updates (spec §1/§5). This is a
 * single-outlet system, so every authenticated client shares one broadcast
 * space. The JWT access token rides the handshake (`auth.token` or the
 * Authorization header); sockets that fail verification are dropped.
 *
 * Feature services push updates through the `emit*` helpers *after* their
 * transaction commits, so a rolled-back change is never broadcast. The two
 * board events carry no payload — clients refetch the relevant board — while
 * `order:updated`/`kot:created` carry detail for snappy KDS/POS reactions.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private server!: Server;
  private readonly logger = new Logger('RealtimeGateway');

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.reject(client, 'missing token');
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      const user: AuthenticatedUser = {
        userId: payload.sub,
        username: payload.username,
        role: payload.role,
      };
      client.data.user = user;
      this.logger.log(`socket ${client.id} connected (${user.username})`);
    } catch {
      this.reject(client, 'invalid token');
    }
  }

  handleDisconnect(client: Socket): void {
    const user = client.data?.user as AuthenticatedUser | undefined;
    if (user) this.logger.log(`socket ${client.id} disconnected (${user.username})`);
  }

  // --- Emit API (called by feature services post-commit) -----------------

  /** The floor/tables board changed; clients refetch GET /tables. */
  emitTablesUpdated(): void {
    this.server?.emit(WS_EVENTS.tablesUpdated, null);
  }

  /** The rooms/bookings board changed; clients refetch GET /rooms + /bookings. */
  emitRoomsUpdated(): void {
    this.server?.emit(WS_EVENTS.roomsUpdated, null);
  }

  emitOrderUpdated(order: OrderDTO): void {
    this.server?.emit(WS_EVENTS.orderUpdated, order);
  }

  emitKotCreated(event: KotCreatedEvent): void {
    this.server?.emit(WS_EVENTS.kotCreated, event);
  }

  emitPrinterHealth(event: PrinterHealthEvent): void {
    this.server?.emit(WS_EVENTS.printerHealth, event);
  }

  // --- Helpers -----------------------------------------------------------

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) return auth.token;
    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return null;
  }

  private reject(client: Socket, reason: string): void {
    this.logger.warn(`rejecting socket ${client.id}: ${reason}`);
    client.emit('unauthorized', { reason });
    client.disconnect(true);
  }
}
