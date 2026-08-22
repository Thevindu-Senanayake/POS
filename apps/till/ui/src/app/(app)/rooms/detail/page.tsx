'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { FullscreenSpinner } from '@pos/client-core';
import { RoomDetail } from '@/features/rooms/room-detail';

function RoomDetailRoute() {
  const params = useSearchParams();
  const roomId = params.get('room') ?? '';
  return <RoomDetail roomId={roomId} />;
}

/**
 * Static-export-friendly room detail route (see `/pos/order` for the rationale):
 * the room id travels as `?room=` so the single exported shell serves any id.
 */
export default function RoomDetailPage() {
  return (
    <Suspense fallback={<FullscreenSpinner label="Loading…" />}>
      <RoomDetailRoute />
    </Suspense>
  );
}
