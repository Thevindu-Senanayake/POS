'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { FullscreenSpinner } from '@pos/client-core';
import { OrderScreen } from '@/features/pos/order-screen';

function OrderRoute() {
  const params = useSearchParams();
  const tableId = params.get('table') ?? undefined;
  const orderId = params.get('order') ?? undefined;
  return <OrderScreen tableId={tableId} orderId={orderId} />;
}

/**
 * Static-export-friendly order route. The id travels in the query string
 * (`?table=` for dine-in, `?order=` for takeaway / room service) instead of a
 * dynamic path segment, so the single exported `/pos/order` shell serves every
 * runtime id — the kiosk's static file server cannot render per-id dynamic
 * paths. `useSearchParams` requires a Suspense boundary under `output: export`.
 */
export default function OrderPage() {
  return (
    <Suspense fallback={<FullscreenSpinner label="Loading…" />}>
      <OrderRoute />
    </Suspense>
  );
}
