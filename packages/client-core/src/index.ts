// Barrel for @pos/client-core — the client modules shared by BOTH the admin web
// app (apps/web) and the Electron till UI (apps/till/ui). Both consume this
// package as raw TS/TSX via `transpilePackages: ['@pos/client-core']`, so there
// is no build step here and env.ts's `process.env.NEXT_PUBLIC_*` reads are
// inlined per-consuming-app by each app's own Next build.

export { api, ApiError, apiRequest } from './lib/api-client';
export type { RequestOptions } from './lib/api-client';
export { API_URL, WS_URL, API_BASE } from './lib/env';
export { qk } from './lib/query-keys';
export { cn } from './lib/cn';

export { useAuthStore } from './stores/auth-store';

export { Button } from './components/ui/button';
export type { ButtonProps } from './components/ui/button';
export { Modal } from './components/ui/modal';
export type { ModalProps } from './components/ui/modal';
export { Spinner, FullscreenSpinner } from './components/ui/spinner';

export { AuthGate } from './components/auth/auth-gate';
export { RealtimeProvider, useRealtime } from './components/realtime/realtime-provider';
export { RealtimeIndicator } from './components/realtime/realtime-indicator';
