'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { formatMoney, type BookingDTO, type RoomDTO } from '@pos/shared';
import { FullscreenSpinner } from '@/components/ui/spinner';
import { useBookings, useRooms } from './api';
import { ROOM_STATUS_STYLES } from './format';

/**
 * Live room board (spec §1/§5): every room grouped by category with its status,
 * the in-house guest when occupied, and a hint for an upcoming reservation.
 * Realtime `rooms:updated` events keep it in sync with the front desk. Tapping a
 * room opens its folio / booking workspace.
 */
export function RoomsBoard() {
  const router = useRouter();
  const roomsQuery = useRooms();
  const checkedIn = useBookings('checked_in');
  const reserved = useBookings('reserved');

  const { guestByRoom, reservationByRoom } = useMemo(() => {
    const guestByRoom = indexByRoom(checkedIn.data);
    const reservationByRoom = indexByRoom(reserved.data);
    return { guestByRoom, reservationByRoom };
  }, [checkedIn.data, reserved.data]);

  const groups = useMemo(() => groupByCategory(roomsQuery.data ?? []), [roomsQuery.data]);

  if (roomsQuery.isLoading) return <FullscreenSpinner label="Loading rooms…" />;
  if (roomsQuery.isError) {
    return (
      <div className="p-8 text-center text-slate-500">
        Could not load rooms. Is the API running?
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-slate-900">Rooms</h1>
        <p className="text-sm text-slate-500">Tap a room to manage its booking and folio.</p>
      </div>

      {groups.map(({ category, rooms }) => (
        <section key={category} className="mb-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            {category} <span className="text-slate-300">({rooms.length})</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {rooms.map((room) => (
              <RoomTile
                key={room.id}
                room={room}
                guest={guestByRoom.get(room.id)}
                reservation={reservationByRoom.get(room.id)}
                onClick={() => router.push(`/rooms/${room.id}`)}
              />
            ))}
          </div>
        </section>
      ))}

      <Legend />
    </div>
  );
}

function RoomTile({
  room,
  guest,
  reservation,
  onClick,
}: {
  room: RoomDTO;
  guest?: BookingDTO;
  reservation?: BookingDTO;
  onClick: () => void;
}) {
  const style = ROOM_STATUS_STYLES[room.status];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[104px] flex-col rounded-2xl border p-3 text-left transition-colors ${style.tile}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-lg font-extrabold">{room.roomNumber}</span>
        <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} aria-hidden />
      </div>
      <div className="mt-1 text-xs font-medium opacity-80">{room.categoryName ?? 'Room'}</div>
      <div className="mt-auto pt-2 text-sm font-semibold">
        {guest ? (
          <span className="truncate">{guest.guestName}</span>
        ) : reservation ? (
          <span className="truncate opacity-80">Reserved · {reservation.guestName}</span>
        ) : (
          <span className="opacity-70">{formatMoney(room.effectiveRate)}/night</span>
        )}
      </div>
    </button>
  );
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
      {(Object.keys(ROOM_STATUS_STYLES) as Array<keyof typeof ROOM_STATUS_STYLES>).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${ROOM_STATUS_STYLES[s].dot}`} aria-hidden />
          {ROOM_STATUS_STYLES[s].label}
        </span>
      ))}
    </div>
  );
}

/** Map roomId → its (single active) booking for O(1) tile lookup. */
function indexByRoom(bookings?: BookingDTO[]): Map<string, BookingDTO> {
  const map = new Map<string, BookingDTO>();
  for (const b of bookings ?? []) if (!map.has(b.roomId)) map.set(b.roomId, b);
  return map;
}

/** Group rooms by category name, categories alphabetical, rooms by number. */
function groupByCategory(rooms: RoomDTO[]): { category: string; rooms: RoomDTO[] }[] {
  const byCat = new Map<string, RoomDTO[]>();
  for (const room of rooms) {
    const key = room.categoryName ?? 'Rooms';
    (byCat.get(key) ?? byCat.set(key, []).get(key)!).push(room);
  }
  return [...byCat.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, list]) => ({
      category,
      rooms: [...list].sort((a, b) =>
        a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }),
      ),
    }));
}
