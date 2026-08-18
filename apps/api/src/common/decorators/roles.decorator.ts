import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@pos/shared';

export const ROLES_KEY = 'roles';

/** Restricts a route (or controller) to the given roles. Enforced by RolesGuard. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
