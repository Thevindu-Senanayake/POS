import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types';

/**
 * Injects the authenticated user, or a single field of it:
 *   `@CurrentUser() user: AuthenticatedUser`
 *   `@CurrentUser('userId') id: string`
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);

/**
 * Resolves to the approving manager's user id that PermissionGuard set after a
 * valid PIN on a `pin`-level action, or undefined when no PIN was required.
 */
export const ManagerApprover = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request & { managerApproverId?: string }>();
    return request.managerApproverId;
  },
);
