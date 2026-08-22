'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { TABLE_AREAS, TABLE_STATUSES, type DiningTableDTO, type TableArea } from '@pos/shared';
import { ApiError } from '@pos/client-core';
import { Button } from '@pos/client-core';
import { Modal } from '@pos/client-core';
import { FullscreenSpinner, Spinner } from '@pos/client-core';
import { useCreateTable, useDeleteTable, useTables, useUpdateTable } from './api';
import { AREA_LABELS, TABLE_STATUS_LABELS, TABLE_STATUS_TONE } from './format';
import { AdminPage, Badge, ErrorNote, Field, SectionCard, SelectInput, Table, TextInput } from './ui';

/** Restaurant first, then Bar — matches the POS floor board's `AREA_ORDER`. */
const AREA_ORDER: TableArea[] = ['restaurant', 'bar'];

/** What the table modal is editing: an existing table, or a new one preset to an area. */
type Editing = { table: DiningTableDTO } | { newArea: TableArea } | null;

/**
 * Tables admin (spec §2.6/§5): the physical floor layout, split into Restaurant
 * and Bar sections. Admins add/rename/resize tables, change their status, and
 * move them between areas; the live POS floor board reflects edits over the
 * `tables:updated` socket. Sessions / seating stay on the operational board.
 */
export function TablesAdminScreen() {
  const tables = useTables();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<DiningTableDTO | null>(null);

  if (tables.isLoading) return <FullscreenSpinner label="Loading tables…" />;

  const all = tables.data ?? [];

  return (
    <AdminPage
      title="Floor & tables"
      subtitle="Physical dining tables, grouped by area. Bar tables can also order food."
      actions={
        <Link href="/pos" className="text-sm font-semibold text-brand-700 hover:underline">
          Live board →
        </Link>
      }
    >
      <div className="space-y-6">
        {AREA_ORDER.map((area) => {
          const rows = all.filter((t) => t.area === area);
          return (
            <SectionCard
              key={area}
              title={AREA_LABELS[area]}
              actions={<Button onClick={() => setEditing({ newArea: area })}>Add table</Button>}
            >
              <Table
                rows={rows}
                keyOf={(t) => t.id}
                empty={`No ${AREA_LABELS[area].toLowerCase()} tables yet.`}
                columns={[
                  {
                    header: 'Table',
                    cell: (t) => <span className="font-semibold text-slate-900">{t.name}</span>,
                  },
                  { header: 'Seats', align: 'right', cell: (t) => t.capacity },
                  {
                    header: 'Status',
                    cell: (t) => <Badge tone={TABLE_STATUS_TONE[t.status]}>{TABLE_STATUS_LABELS[t.status]}</Badge>,
                  },
                  {
                    header: '',
                    align: 'right',
                    cell: (t) => (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => setDeleting(t)}>
                          Delete
                        </Button>
                        <Button variant="secondary" onClick={() => setEditing({ table: t })}>
                          Edit
                        </Button>
                      </div>
                    ),
                  },
                ]}
              />
            </SectionCard>
          );
        })}
      </div>

      {editing ? (
        <TableModal
          table={'table' in editing ? editing.table : null}
          initialArea={'newArea' in editing ? editing.newArea : editing.table.area}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? <DeleteTableModal table={deleting} onClose={() => setDeleting(null)} /> : null}
    </AdminPage>
  );
}

const tableSchema = z.object({
  area: z.enum(['restaurant', 'bar']),
  name: z.string().trim().min(1, 'Name is required'),
  capacity: z.coerce.number().int('Whole number').min(1, 'At least 1 seat').max(50, 'At most 50 seats'),
  status: z.enum(['free', 'occupied', 'reserved', 'needs_cleaning']),
});
type TableValues = z.infer<typeof tableSchema>;

function TableModal({
  table,
  initialArea,
  onClose,
}: {
  table: DiningTableDTO | null;
  initialArea: TableArea;
  onClose: () => void;
}) {
  const isEdit = !!table;
  const create = useCreateTable();
  const update = useUpdateTable();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TableValues>({
    resolver: zodResolver(tableSchema),
    defaultValues: {
      area: table?.area ?? initialArea,
      name: table?.name ?? '',
      capacity: table?.capacity ?? 2,
      status: table?.status ?? 'free',
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: table.id,
          body: { area: v.area, name: v.name, capacity: v.capacity, status: v.status },
        });
      } else {
        // createTable ignores status — a new table always starts `free`.
        await create.mutateAsync({ area: v.area, name: v.name, capacity: v.capacity });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the table');
    }
  });

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit ${table.name}` : 'New table'} widthClassName="max-w-md">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Area" htmlFor="tbl-area" error={errors.area?.message}>
            <SelectInput id="tbl-area" {...register('area')}>
              {TABLE_AREAS.map((a) => (
                <option key={a} value={a}>
                  {AREA_LABELS[a]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Seats" htmlFor="tbl-cap" error={errors.capacity?.message}>
            <TextInput id="tbl-cap" type="number" min="1" max="50" step="1" {...register('capacity')} />
          </Field>
        </div>
        <Field label="Name" htmlFor="tbl-name" error={errors.name?.message} hint="e.g. T1, Bar 3, Patio 2">
          <TextInput id="tbl-name" autoFocus placeholder="Table name" {...register('name')} />
        </Field>
        {isEdit ? (
          <Field label="Status" htmlFor="tbl-status">
            <SelectInput id="tbl-status" {...register('status')}>
              {TABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TABLE_STATUS_LABELS[s]}
                </option>
              ))}
            </SelectInput>
          </Field>
        ) : null}
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

function DeleteTableModal({ table, onClose }: { table: DiningTableDTO; onClose: () => void }) {
  const del = useDeleteTable();
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setError(null);
    try {
      await del.mutateAsync(table.id);
      onClose();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 409
            ? 'This table has session history and can’t be deleted. Set its status instead.'
            : e.message
          : 'Could not delete the table',
      );
    }
  };
  return (
    <Modal open onClose={onClose} title="Delete table" widthClassName="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Delete <span className="font-semibold">{table.name}</span>? Tables that have served guests can&apos;t be
          deleted.
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
