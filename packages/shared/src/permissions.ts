import type { UserRole } from './enums.js';

/**
 * Permission matrix — spec §7. Single source of truth shared by the API role
 * guard and the web UI (to hide/disable actions). `allow` = permitted outright,
 * `pin` = permitted only with a manager/admin PIN confirmation, absent = denied.
 */
export const PERMISSIONS = [
  'take_orders',
  'send_kot',
  'mark_served',
  'request_bill',
  'take_payment',
  'apply_discount',
  'void',
  'split_merge',
  'edit_bom',
  'goods_receiving',
  'view_admin',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export type PermissionLevel = 'allow' | 'pin';

export const PERMISSION_MATRIX: Record<Permission, Partial<Record<UserRole, PermissionLevel>>> = {
  take_orders: {
    admin: 'allow',
    cashier: 'allow',
    waiter: 'allow',
    bartender: 'allow',
    room_service_staff: 'allow',
  },
  send_kot: {
    admin: 'allow',
    cashier: 'allow',
    waiter: 'allow',
    bartender: 'allow',
    room_service_staff: 'allow',
  },
  mark_served: {
    admin: 'allow',
    waiter: 'allow',
    bartender: 'allow',
    kitchen_staff: 'allow',
    room_service_staff: 'allow',
  },
  request_bill: {
    admin: 'allow',
    cashier: 'allow',
    waiter: 'allow',
    bartender: 'allow',
    room_service_staff: 'allow',
  },
  take_payment: { admin: 'allow', cashier: 'allow' },
  apply_discount: { admin: 'allow', cashier: 'pin' },
  void: { admin: 'allow', cashier: 'pin' },
  split_merge: { admin: 'allow', cashier: 'pin' },
  edit_bom: { admin: 'allow' },
  // Spec: cashier "Y (if assigned)" — modelled as allow; tighten per-user later if needed.
  goods_receiving: { admin: 'allow', cashier: 'allow' },
  view_admin: { admin: 'allow' },
};

export function permissionLevel(perm: Permission, role: UserRole): PermissionLevel | undefined {
  return PERMISSION_MATRIX[perm]?.[role];
}

/** True if the role may perform the action (optionally with a verified manager PIN). */
export function canPerform(perm: Permission, role: UserRole, hasManagerPin = false): boolean {
  const level = permissionLevel(perm, role);
  if (level === 'allow') return true;
  if (level === 'pin') return hasManagerPin;
  return false;
}

/** True if the action is allowed for the role only after a manager PIN. */
export function requiresPin(perm: Permission, role: UserRole): boolean {
  return permissionLevel(perm, role) === 'pin';
}
