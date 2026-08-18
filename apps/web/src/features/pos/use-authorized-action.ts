'use client';

import { permissionLevel, type Permission } from '@pos/shared';
import { useManagerPin } from '@/components/manager-pin/pin-provider';
import { useAuthStore } from '@/stores/auth-store';

export interface AuthorizedActionOpts {
  title?: string;
  description?: string;
}

/**
 * Runs a permission-gated action following the spec §7 matrix. `allow` roles run
 * it straight; `pin` roles are prompted for a manager PIN first (passed to the
 * callback as `managerPin`); denied roles never reach here (the button is hidden
 * via {@link useCan}). Returns false if denied or the PIN prompt was cancelled;
 * errors thrown by `fn` propagate so callers can surface them.
 */
export function useAuthorizedAction() {
  const role = useAuthStore((s) => s.user?.role);
  const { requestPin } = useManagerPin();

  return async function run(
    perm: Permission,
    fn: (managerPin?: string) => Promise<unknown>,
    opts?: AuthorizedActionOpts,
  ): Promise<boolean> {
    if (!role) return false;
    const level = permissionLevel(perm, role);
    if (!level) return false;
    if (level === 'allow') {
      await fn();
      return true;
    }
    const pin = await requestPin({
      title: opts?.title ?? 'Manager approval',
      description: opts?.description,
    });
    if (!pin) return false;
    await fn(pin);
    return true;
  };
}

/** Whether the current role may perform an action at all (allow or pin). */
export function useCan(): (perm: Permission) => boolean {
  const role = useAuthStore((s) => s.user?.role);
  return (perm: Permission) => (role ? permissionLevel(perm, role) !== undefined : false);
}
