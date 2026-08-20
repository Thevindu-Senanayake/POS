'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ROOM_STATUSES, formatMoney, type RoomCategoryDTO, type RoomDTO } from '@pos/shared';
import { ApiError } from '@/lib/api-client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FullscreenSpinner, Spinner } from '@/components/ui/spinner';
import {
  useCreateRoom,
  useCreateRoomCategory,
  useDeleteRoom,
  useDeleteRoomCategory,
  useRoomCategories,
  useRooms,
  useUpdateRoom,
  useUpdateRoomCategory,
} from './api';
import { ROOM_STATUS_LABELS, ROOM_STATUS_TONE } from './format';
import { AdminPage, Badge, ErrorNote, Field, SectionCard, SelectInput, Table, TextInput } from './ui';

type Tab = 'rooms' | 'categories';

/** Rooms admin (spec §2.6/§5): categories + rooms and their effective rates.
 *  Live bookings / check-in / checkout stay on the operational Rooms board. */
export function RoomsAdminScreen() {
  const [tab, setTab] = useState<Tab>('rooms');
  return (
    <AdminPage
      title="Rooms & rates"
      subtitle="Room categories, individual rooms and nightly rates."
      actions={
        <div className="flex items-center gap-3">
          <Link href="/rooms" className="text-sm font-semibold text-brand-700 hover:underline">
            Live board →
          </Link>
          <div className="flex rounded-xl border border-sand-200 bg-sand-100 p-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setTab('rooms')}
              className={`rounded-lg px-4 py-1.5 ${tab === 'rooms' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
            >
              Rooms
            </button>
            <button
              type="button"
              onClick={() => setTab('categories')}
              className={`rounded-lg px-4 py-1.5 ${tab === 'categories' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
            >
              Categories
            </button>
          </div>
        </div>
      }
    >
      {tab === 'rooms' ? <Rooms /> : <Categories />}
    </AdminPage>
  );
}

// --- Rooms -------------------------------------------------------------------

function Rooms() {
  const rooms = useRooms();
  const categories = useRoomCategories();
  const [editing, setEditing] = useState<RoomDTO | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RoomDTO | null>(null);

  if (rooms.isLoading || categories.isLoading) return <FullscreenSpinner label="Loading rooms…" />;

  const hasCategories = (categories.data ?? []).length > 0;

  return (
    <SectionCard
      title="Rooms"
      actions={
        <Button onClick={() => setEditing('new')} disabled={!hasCategories}>
          Add room
        </Button>
      }
    >
      {!hasCategories ? (
        <div className="px-4 py-8 text-center text-sm text-slate-500">
          Create a room category first — rooms inherit their default nightly rate from a category.
        </div>
      ) : (
        <Table
          rows={rooms.data ?? []}
          keyOf={(r) => r.id}
          empty="No rooms yet."
          columns={[
            { header: 'Room', cell: (r) => <span className="font-semibold text-slate-900">{r.roomNumber}</span> },
            { header: 'Category', cell: (r) => r.categoryName ?? '—' },
            {
              header: 'Rate / night',
              align: 'right',
              cell: (r) => (
                <div>
                  <span className="font-semibold">{formatMoney(r.effectiveRate)}</span>
                  {r.rateOverride != null ? (
                    <span className="ml-1 text-xs text-brand-600">(override)</span>
                  ) : null}
                </div>
              ),
            },
            { header: 'Status', cell: (r) => <Badge tone={ROOM_STATUS_TONE[r.status]}>{ROOM_STATUS_LABELS[r.status]}</Badge> },
            {
              header: '',
              align: 'right',
              cell: (r) => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" onClick={() => setDeleting(r)}>
                    Delete
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(r)}>
                    Edit
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}

      {editing ? (
        <RoomModal
          room={editing === 'new' ? null : editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? <DeleteRoomModal room={deleting} onClose={() => setDeleting(null)} /> : null}
    </SectionCard>
  );
}

const roomSchema = z.object({
  roomNumber: z.string().trim().min(1, 'Room number is required'),
  roomCategoryId: z.string().min(1, 'Choose a category'),
  rateOverride: z.string().trim(),
  status: z.enum(['vacant', 'occupied', 'maintenance']),
});
type RoomValues = z.infer<typeof roomSchema>;

function RoomModal({
  room,
  categories,
  onClose,
}: {
  room: RoomDTO | null;
  categories: RoomCategoryDTO[];
  onClose: () => void;
}) {
  const isEdit = !!room;
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RoomValues>({
    resolver: zodResolver(roomSchema),
    defaultValues: {
      roomNumber: room?.roomNumber ?? '',
      roomCategoryId: room?.roomCategoryId ?? categories[0]?.id ?? '',
      rateOverride: room?.rateOverride != null ? String(room.rateOverride) : '',
      status: room?.status ?? 'vacant',
    },
  });

  const selectedCat = categories.find((c) => c.id === watch('roomCategoryId'));

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    const rateOverride = v.rateOverride.trim() === '' ? null : Number(v.rateOverride);
    if (rateOverride != null && (Number.isNaN(rateOverride) || rateOverride < 0)) {
      setError('Rate override must be zero or more, or blank to use the category rate.');
      return;
    }
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: room.id,
          body: { roomNumber: v.roomNumber, roomCategoryId: v.roomCategoryId, rateOverride, status: v.status },
        });
      } else {
        await create.mutateAsync({
          roomNumber: v.roomNumber,
          roomCategoryId: v.roomCategoryId,
          rateOverride: rateOverride ?? undefined,
          status: v.status,
        });
      }
      onClose();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 409
            ? 'A room with that number already exists.'
            : e.message
          : 'Could not save the room',
      );
    }
  });

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit room ${room.roomNumber}` : 'New room'} widthClassName="max-w-md">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Room number" htmlFor="rm-num" error={errors.roomNumber?.message}>
            <TextInput id="rm-num" autoFocus {...register('roomNumber')} />
          </Field>
          <Field label="Status" htmlFor="rm-status">
            <SelectInput id="rm-status" {...register('status')}>
              {ROOM_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ROOM_STATUS_LABELS[s]}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <Field label="Category" htmlFor="rm-cat" error={errors.roomCategoryId?.message}>
          <SelectInput id="rm-cat" {...register('roomCategoryId')}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {formatMoney(c.defaultRate)}/night
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field
          label="Rate override (optional)"
          htmlFor="rm-rate"
          hint={selectedCat ? `Blank = category rate ${formatMoney(selectedCat.defaultRate)}` : undefined}
        >
          <TextInput id="rm-rate" type="number" step="0.01" min="0" placeholder="Use category rate" {...register('rateOverride')} />
        </Field>
        <ErrorNote message={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteRoomModal({ room, onClose }: { room: RoomDTO; onClose: () => void }) {
  const del = useDeleteRoom();
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setError(null);
    try {
      await del.mutateAsync(room.id);
      onClose();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 409
            ? 'This room has booking history and cannot be deleted. Set it to maintenance instead.'
            : e.message
          : 'Could not delete the room',
      );
    }
  };
  return (
    <Modal open onClose={onClose} title="Delete room" widthClassName="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Delete room <span className="font-semibold">{room.roomNumber}</span>? Rooms with booking history can&apos;t
          be deleted.
        </p>
        <ErrorNote message={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={run} disabled={del.isPending}>
            {del.isPending ? <Spinner /> : 'Delete'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// --- Categories --------------------------------------------------------------

function Categories() {
  const categories = useRoomCategories();
  const [editing, setEditing] = useState<RoomCategoryDTO | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RoomCategoryDTO | null>(null);

  if (categories.isLoading) return <FullscreenSpinner label="Loading categories…" />;

  return (
    <SectionCard title="Room categories" actions={<Button onClick={() => setEditing('new')}>Add category</Button>}>
      <Table
        rows={categories.data ?? []}
        keyOf={(c) => c.id}
        empty="No categories yet."
        columns={[
          { header: 'Category', cell: (c) => <span className="font-semibold text-slate-900">{c.name}</span> },
          { header: 'Default rate / night', align: 'right', cell: (c) => formatMoney(c.defaultRate) },
          {
            header: '',
            align: 'right',
            cell: (c) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" onClick={() => setDeleting(c)}>
                  Delete
                </Button>
                <Button variant="secondary" onClick={() => setEditing(c)}>
                  Edit
                </Button>
              </div>
            ),
          },
        ]}
      />
      {editing ? (
        <CategoryModal category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
      {deleting ? <DeleteCategoryModal category={deleting} onClose={() => setDeleting(null)} /> : null}
    </SectionCard>
  );
}

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  defaultRate: z.coerce.number().min(0, 'Rate must be zero or more'),
});
type CategoryValues = z.infer<typeof categorySchema>;

function CategoryModal({ category, onClose }: { category: RoomCategoryDTO | null; onClose: () => void }) {
  const isEdit = !!category;
  const create = useCreateRoomCategory();
  const update = useUpdateRoomCategory();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: category?.name ?? '', defaultRate: category?.defaultRate ?? 0 },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      if (isEdit) await update.mutateAsync({ id: category.id, body: v });
      else await create.mutateAsync(v);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the category');
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Edit ${category.name}` : 'New room category'}
      widthClassName="max-w-md"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Name" htmlFor="cat-name" error={errors.name?.message}>
          <TextInput id="cat-name" autoFocus placeholder="e.g. Deluxe Double" {...register('name')} />
        </Field>
        <Field label="Default rate / night" htmlFor="cat-rate" error={errors.defaultRate?.message}>
          <TextInput id="cat-rate" type="number" step="0.01" min="0" {...register('defaultRate')} />
        </Field>
        <ErrorNote message={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteCategoryModal({ category, onClose }: { category: RoomCategoryDTO; onClose: () => void }) {
  const del = useDeleteRoomCategory();
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setError(null);
    try {
      await del.mutateAsync(category.id);
      onClose();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 409
            ? 'This category still has rooms. Reassign or delete them first.'
            : e.message
          : 'Could not delete the category',
      );
    }
  };
  return (
    <Modal open onClose={onClose} title="Delete category" widthClassName="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Delete <span className="font-semibold">{category.name}</span>? Categories with rooms can&apos;t be deleted.
        </p>
        <ErrorNote message={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={run} disabled={del.isPending}>
            {del.isPending ? <Spinner /> : 'Delete'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
