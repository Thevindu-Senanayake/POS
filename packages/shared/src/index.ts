export * from './enums.js';
export * from './permissions.js';
export * from './money.js';
export * from './api-types.js';
export * from './realtime.js';

/** Realtime (socket.io) event names shared by the API gateway and web client. */
export const WS_EVENTS = {
  tablesUpdated: 'tables:updated',
  roomsUpdated: 'rooms:updated',
  orderUpdated: 'order:updated',
  kotCreated: 'kot:created',
  printerHealth: 'printer:health',
  lowStock: 'stock:low',
} as const;
