import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * Authenticates the print-agent (spec §3) via a shared secret rather than a JWT:
 * the agent is an unattended LAN service, not a user. The token is sent as
 * `x-print-agent-token` or `Authorization: Bearer <token>` and compared to the
 * configured `printAgentToken` in constant time. Agent routes are `@Public()`,
 * so the global JWT/role/permission guards no-op and this guard is the only gate.
 */
@Injectable()
export class PrintAgentGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = this.extractToken(request);
    const expected = this.config.get<string>('printAgentToken');
    if (!provided || !expected || !safeEqual(provided, expected)) {
      throw new UnauthorizedException('Invalid print-agent token');
    }
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers['x-print-agent-token'];
    if (typeof header === 'string' && header.length > 0) return header;
    const auth = request.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    return null;
  }
}

/** Length-safe constant-time string comparison (avoids leaking the token via timing). */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
