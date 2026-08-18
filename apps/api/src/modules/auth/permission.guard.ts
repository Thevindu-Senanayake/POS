import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { permissionLevel, type Permission } from '@pos/shared';
import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types';
import { ManagerPinService } from './manager-pin.service';

/**
 * Global permission guard (spec §7). No-ops without `@RequirePermission(...)`.
 * `allow` passes; `pin` requires a valid manager PIN (via `x-manager-pin` header
 * or `managerPin` body field) and stashes the approver id on the request for the
 * handler to persist on an AuditLog; anything else is denied.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly pin: ManagerPinService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<Permission>(REQUIRE_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException();

    const level = permissionLevel(permission, user.role);
    if (level === 'allow') return true;

    if (level === 'pin') {
      const provided = (request.headers['x-manager-pin'] ?? request.body?.managerPin) as
        | string
        | undefined;
      if (!provided) {
        throw new ForbiddenException(`Manager PIN required to ${humanise(permission)}`);
      }
      const approverId = await this.pin.verify(String(provided));
      if (!approverId) throw new ForbiddenException('Invalid manager PIN');
      request.managerApproverId = approverId;
      return true;
    }

    throw new ForbiddenException(`Your role may not ${humanise(permission)}`);
  }
}

function humanise(permission: string): string {
  return permission.replace(/_/g, ' ');
}
