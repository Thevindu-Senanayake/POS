import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@pos/shared';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

/**
 * Gates a route on a spec §7 permission. PermissionGuard resolves the caller's
 * role against PERMISSION_MATRIX: `allow` passes, `pin` requires a valid manager
 * PIN (via `x-manager-pin` header or `managerPin` body field), absent is denied.
 */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);
