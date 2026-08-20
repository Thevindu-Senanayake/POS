'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { PrinterDTO, PrintJobStatus } from '@pos/shared';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FullscreenSpinner, Spinner } from '@/components/ui/spinner';
import { usePrinters, usePrintJobs, useRetryPrintJob, useUpdatePrinter } from './api';
import { CONNECTION_LABELS, ROLE_LABELS, STATION_LABELS, formatDateTime } from './format';
import { AdminPage, Badge, ErrorNote, Field, SectionCard, SelectInput, Table, TextInput } from './ui';

const JOB_STATUS_LABELS: Record<PrintJobStatus, string> = {
  pending: 'Pending',
  printing: 'Printing',
  done: 'Done',
  failed: 'Failed',
};
const JOB_STATUS_TONE: Record<PrintJobStatus, 'amber' | 'brand' | 'green' | 'red'> = {
  pending: 'amber',
  printing: 'brand',
  done: 'green',
  failed: 'red',
};

/** Printing (spec §3.3): live printer health + the print-job queue with retry. */
export function PrintersScreen() {
  const printers = usePrinters();
  const [editing, setEditing] = useState<PrinterDTO | null>(null);

  if (printers.isLoading) return <FullscreenSpinner label="Loading printers…" />;

  const offline = (printers.data ?? []).filter((p) => !p.online);

  return (
    <AdminPage title="Printers" subtitle="Station printer health and the print-job queue.">
      {offline.length > 0 ? (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
          <span className="flex h-3 w-3 flex-none animate-pulse rounded-full bg-red-500" />
          <div className="text-sm">
            <span className="font-bold text-red-700">
              {offline.length} printer{offline.length === 1 ? '' : 's'} offline
            </span>
            <span className="text-red-600"> - {offline.map((p) => p.name).join(', ')}. KOTs and bills won&apos;t print until resolved.</span>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(printers.data ?? []).map((p) => (
          <div key={p.id} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-card">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${p.online ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className="font-bold text-slate-900">{p.name}</span>
                </div>
                <Badge tone="slate">{ROLE_LABELS[p.role]}</Badge>
              </div>
              <Button variant="secondary" onClick={() => setEditing(p)}>
                Edit
              </Button>
            </div>
            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-400">Status</dt>
                <dd className={p.online ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
                  {p.online ? 'Online' : 'Offline'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Connection</dt>
                <dd className="font-medium text-slate-700">{CONNECTION_LABELS[p.connection]}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">{p.connection === 'usb' ? 'Device' : 'Address'}</dt>
                <dd className="font-medium text-slate-700">
                  {p.connection === 'usb'
                    ? (p.device ?? 'Not set')
                    : p.ip
                      ? `${p.ip}:${p.port}`
                      : 'Not set'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Type</dt>
                <dd className="font-medium text-slate-700">{p.type}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Last seen</dt>
                <dd className="font-medium text-slate-700">{p.lastSeenAt ? formatDateTime(p.lastSeenAt) : '-'}</dd>
              </div>
            </dl>
            {p.lastError ? (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{p.lastError}</p>
            ) : null}
          </div>
        ))}
        {(printers.data ?? []).length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-sand-300 px-4 py-10 text-center text-sm text-slate-400">
            No printers configured.
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        <PrintJobs statusLabels={JOB_STATUS_LABELS} statusTone={JOB_STATUS_TONE} />
      </div>

      {editing ? <PrinterModal printer={editing} onClose={() => setEditing(null)} /> : null}
    </AdminPage>
  );
}

// --- Print-job queue ---------------------------------------------------------

function PrintJobs({
  statusLabels,
  statusTone,
}: {
  statusLabels: Record<PrintJobStatus, string>;
  statusTone: Record<PrintJobStatus, 'amber' | 'brand' | 'green' | 'red'>;
}) {
  const [status, setStatus] = useState<string>('');
  const jobs = usePrintJobs(status || undefined);
  const retry = useRetryPrintJob();
  const [retryError, setRetryError] = useState<string | null>(null);

  const onRetry = async (id: string) => {
    setRetryError(null);
    try {
      await retry.mutateAsync(id);
    } catch (e) {
      setRetryError(e instanceof ApiError ? e.message : 'Could not requeue the job');
    }
  };

  return (
    <SectionCard
      title="Print queue"
      description="Auto-refreshes every 15 seconds. Failed jobs can be requeued (attempts reset)."
      actions={
        <SelectInput value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto py-1.5 text-sm">
          <option value="">All statuses</option>
          {(Object.keys(statusLabels) as PrintJobStatus[]).map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </SelectInput>
      }
    >
      {retryError ? (
        <div className="px-4 pt-3">
          <ErrorNote message={retryError} />
        </div>
      ) : null}
      {jobs.isLoading ? (
        <div className="px-4 py-10 text-center text-sm text-slate-400">
          <Spinner /> Loading…
        </div>
      ) : (
        <Table
          rows={jobs.data ?? []}
          keyOf={(j) => j.id}
          empty="No print jobs."
          columns={[
            {
              header: 'Job',
              cell: (j) => (
                <div>
                  <span className="font-semibold uppercase text-slate-900">{j.type}</span>
                  {j.station ? <span className="ml-2 text-xs text-slate-400">{STATION_LABELS[j.station]}</span> : null}
                </div>
              ),
            },
            { header: 'Status', cell: (j) => <Badge tone={statusTone[j.status]}>{statusLabels[j.status]}</Badge> },
            { header: 'Attempts', align: 'right', cell: (j) => `${j.attempts}/${j.maxAttempts}` },
            { header: 'Created', cell: (j) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(j.createdAt)}</span> },
            {
              header: 'Last error',
              cell: (j) => (j.lastError ? <span className="text-xs text-red-600">{j.lastError}</span> : <span className="text-slate-300">-</span>),
            },
            {
              header: '',
              align: 'right',
              cell: (j) =>
                j.status === 'failed' ? (
                  <Button variant="secondary" onClick={() => onRetry(j.id)} disabled={retry.isPending}>
                    Retry
                  </Button>
                ) : null,
            },
          ]}
        />
      )}
    </SectionCard>
  );
}

// --- Edit printer ------------------------------------------------------------

const printerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  connection: z.enum(['network', 'usb']),
  ip: z.string().trim(),
  port: z.coerce.number().int().min(1).max(65535),
  device: z.string().trim(),
  type: z.string().trim().min(1, 'Type is required'),
  online: z.boolean(),
});
type PrinterValues = z.infer<typeof printerSchema>;

function PrinterModal({ printer, onClose }: { printer: PrinterDTO; onClose: () => void }) {
  const update = useUpdatePrinter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PrinterValues>({
    resolver: zodResolver(printerSchema),
    defaultValues: {
      name: printer.name,
      connection: printer.connection,
      ip: printer.ip ?? '',
      port: printer.port,
      device: printer.device ?? '',
      type: printer.type,
      online: printer.online,
    },
  });
  const connection = watch('connection');

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await update.mutateAsync({
        id: printer.id,
        body: {
          name: v.name,
          connection: v.connection,
          ip: v.ip.trim() === '' ? null : v.ip.trim(),
          port: v.port,
          device: v.device.trim() === '' ? null : v.device.trim(),
          type: v.type,
          online: v.online,
        },
      });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the printer');
    }
  });

  return (
    <Modal open onClose={onClose} title={`Edit ${printer.name}`} widthClassName="max-w-md">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="text-sm text-slate-500">
          Role: <span className="font-semibold text-slate-700">{ROLE_LABELS[printer.role]}</span>
        </p>
        <Field label="Name" htmlFor="pr-name" error={errors.name?.message}>
          <TextInput id="pr-name" {...register('name')} />
        </Field>
        <Field label="Connection" htmlFor="pr-connection" hint="USB = local OS printer; Network = LAN ESC/POS">
          <SelectInput id="pr-connection" {...register('connection')}>
            <option value="network">Network (IP)</option>
            <option value="usb">USB (OS printer)</option>
          </SelectInput>
        </Field>
        {connection === 'usb' ? (
          <Field label="Device" htmlFor="pr-device" hint="OS/spooler printer name the agent prints to">
            <TextInput id="pr-device" placeholder="EPSON TM-T20" {...register('device')} />
          </Field>
        ) : (
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <Field label="IP address" htmlFor="pr-ip" hint="Blank = not networked (dev/stdout)">
              <TextInput id="pr-ip" placeholder="192.168.1.50" {...register('ip')} />
            </Field>
            <Field label="Port" htmlFor="pr-port" error={errors.port?.message}>
              <TextInput id="pr-port" type="number" min="1" max="65535" {...register('port')} />
            </Field>
          </div>
        )}
        <Field label="Type" htmlFor="pr-type" error={errors.type?.message} hint="e.g. escpos">
          <TextInput id="pr-type" {...register('type')} />
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" className="h-5 w-5" {...register('online')} /> Mark as online
        </label>
        <p className="text-xs text-slate-400">
          Health normally updates automatically from the print agent&apos;s heartbeat; this is a manual override.
        </p>
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
