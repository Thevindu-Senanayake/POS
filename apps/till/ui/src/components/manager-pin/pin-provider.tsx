'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal } from '@pos/client-core';
import { PinPad } from './pin-pad';

export interface PinRequest {
  title?: string;
  description?: string;
}

interface ManagerPinContextValue {
  /** Open the PIN pad and resolve with the entered PIN, or `null` if cancelled. */
  requestPin: (opts?: PinRequest) => Promise<string | null>;
}

const ManagerPinContext = createContext<ManagerPinContextValue | null>(null);

export function useManagerPin(): ManagerPinContextValue {
  const ctx = useContext(ManagerPinContext);
  if (!ctx) throw new Error('useManagerPin must be used within <ManagerPinProvider>');
  return ctx;
}

/**
 * Provides `requestPin()` to the whole app for PIN-gated actions (discount, void,
 * split/merge by non-admins — spec §7). A caller awaits a PIN, then passes it as
 * `managerPin` on the action request; the server verifies it and writes the audit
 * row. Kept generic (no coupling to any specific action) so every gated flow
 * shares one modal.
 */
export function ManagerPinProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<PinRequest>({});
  const resolverRef = useRef<((pin: string | null) => void) | null>(null);

  const settle = useCallback((pin: string | null) => {
    setOpen(false);
    resolverRef.current?.(pin);
    resolverRef.current = null;
  }, []);

  const requestPin = useCallback((opts?: PinRequest) => {
    setRequest(opts ?? {});
    setOpen(true);
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  return (
    <ManagerPinContext.Provider value={{ requestPin }}>
      {children}
      <Modal
        open={open}
        onClose={() => settle(null)}
        title={request.title ?? 'Manager approval'}
      >
        {request.description ? (
          <p className="mb-4 text-sm text-slate-600">{request.description}</p>
        ) : null}
        <PinPad onSubmit={(pin) => settle(pin)} onCancel={() => settle(null)} />
      </Modal>
    </ManagerPinContext.Provider>
  );
}
