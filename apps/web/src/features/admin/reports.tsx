'use client';

import { useState } from 'react';
import { formatMoney, type AuditAction } from '@pos/shared';
import { Spinner } from '@/components/ui/spinner';
import { useAuditLog, useSalesReport, useVarianceReport } from './api';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_TONE,
  BASE_UNIT_SHORT,
  CHANNEL_LABELS,
  MENU_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  formatDate,
  formatDateTime,
} from './format';
import { AdminPage, Badge, SectionCard, SelectInput, StatCard, Table, inputClass } from './ui';

type Tab = 'sales' | 'variance' | 'audit';

/** Reports (spec §2.8/§5/§8): sales, inventory variance, and the audit trail. */
export function ReportsScreen() {
  const [tab, setTab] = useState<Tab>('sales');
  return (
    <AdminPage
      title="Reports"
      subtitle="Sales performance, inventory variance and the compliance audit trail."
      actions={
        <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-1 text-sm font-semibold">
          {(
            [
              ['sales', 'Sales'],
              ['variance', 'Variance'],
              ['audit', 'Audit log'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg px-4 py-1.5 ${tab === key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'sales' ? <SalesReport /> : tab === 'variance' ? <VarianceReport /> : <AuditReport />}
    </AdminPage>
  );
}

/** Shared from/to controls; blank means "let the API default to the last 30 days". */
function DateRange({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-1.5 font-medium text-slate-600">
        From
        <input type="date" className={`${inputClass} !w-auto py-1.5`} value={from} onChange={(e) => onFrom(e.target.value)} />
      </label>
      <label className="flex items-center gap-1.5 font-medium text-slate-600">
        To
        <input type="date" className={`${inputClass} !w-auto py-1.5`} value={to} onChange={(e) => onTo(e.target.value)} />
      </label>
      {from || to ? (
        <button
          type="button"
          onClick={() => {
            onFrom('');
            onTo('');
          }}
          className="text-sm font-semibold text-slate-400 hover:text-slate-600"
        >
          Clear
        </button>
      ) : (
        <span className="text-xs text-slate-400">Defaults to the last 30 days</span>
      )}
    </div>
  );
}

// --- Sales -------------------------------------------------------------------

const GROUP_OPTIONS = [
  ['day', 'By day'],
  ['category', 'By category'],
  ['payment_method', 'By payment method'],
  ['channel', 'By channel'],
] as const;

function SalesReport() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [groupBy, setGroupBy] = useState<string>('day');
  const report = useSalesReport({ from: from || undefined, to: to || undefined, groupBy });

  const keyLabel = (key: string): string => {
    if (groupBy === 'day') return formatDate(key);
    if (groupBy === 'category')
      return key === 'uncategorized' ? 'Uncategorized' : (MENU_CATEGORY_LABELS as Record<string, string>)[key] ?? key;
    if (groupBy === 'payment_method') return (PAYMENT_METHOD_LABELS as Record<string, string>)[key] ?? key;
    if (groupBy === 'channel') return (CHANNEL_LABELS as Record<string, string>)[key] ?? key;
    return key;
  };

  const totals = report.data?.totals;

  return (
    <div className="space-y-4">
      <SectionCard
        title="Sales"
        actions={
          <SelectInput value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="!w-auto py-1.5 text-sm">
            {GROUP_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectInput>
        }
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        </div>

        {report.isLoading ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            <Spinner /> Loading…
          </div>
        ) : report.isError ? (
          <div className="px-4 py-10 text-center text-sm text-red-600">Could not load the sales report.</div>
        ) : (
          <>
            {totals ? (
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
                <StatCard label="Net sales" value={formatMoney(totals.net)} tone="brand" />
                <StatCard label="Gross" value={formatMoney(totals.gross)} />
                <StatCard label="Discounts" value={formatMoney(totals.discounts)} />
                <StatCard label="Service charge" value={formatMoney(totals.serviceCharge)} />
                <StatCard label="Orders" value={totals.orders} />
              </div>
            ) : null}
            <Table
              rows={report.data?.rows ?? []}
              keyOf={(r) => r.key}
              empty="No sales in this period."
              columns={[
                { header: GROUP_OPTIONS.find(([v]) => v === groupBy)?.[1].replace('By ', '') ?? 'Key', cell: (r) => <span className="font-semibold text-slate-900">{keyLabel(r.key)}</span> },
                { header: 'Orders', align: 'right', cell: (r) => r.orders },
                { header: 'Gross', align: 'right', cell: (r) => formatMoney(r.gross) },
                { header: 'Discounts', align: 'right', cell: (r) => formatMoney(r.discounts) },
                { header: 'Service charge', align: 'right', cell: (r) => formatMoney(r.serviceCharge) },
                { header: 'Net', align: 'right', cell: (r) => <span className="font-semibold">{formatMoney(r.net)}</span> },
              ]}
            />
          </>
        )}
      </SectionCard>
    </div>
  );
}

// --- Variance ----------------------------------------------------------------

function VarianceReport() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const report = useVarianceReport({ from: from || undefined, to: to || undefined });

  return (
    <SectionCard
      title="Inventory variance"
      description="Theoretical (recipe-based) vs actual consumption. Positive variance = more stock consumed than recipes predict — shrinkage, over-pour or wastage."
    >
      <div className="border-b border-slate-100 px-4 py-3">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>
      {report.isLoading ? (
        <div className="px-4 py-10 text-center text-sm text-slate-400">
          <Spinner /> Loading…
        </div>
      ) : (
        <Table
          rows={report.data ?? []}
          keyOf={(r) => r.ingredientId}
          empty="No consumption in this period."
          columns={[
            { header: 'Ingredient', cell: (r) => <span className="font-semibold text-slate-900">{r.ingredientName}</span> },
            {
              header: 'Purchased',
              align: 'right',
              cell: (r) => `${r.purchased.toLocaleString('en-US')} ${BASE_UNIT_SHORT[r.baseUnit]}`,
            },
            {
              header: 'Theoretical',
              align: 'right',
              cell: (r) => `${r.theoreticalConsumption.toLocaleString('en-US')} ${BASE_UNIT_SHORT[r.baseUnit]}`,
            },
            {
              header: 'Actual',
              align: 'right',
              cell: (r) => `${r.actualConsumption.toLocaleString('en-US')} ${BASE_UNIT_SHORT[r.baseUnit]}`,
            },
            {
              header: 'Variance',
              align: 'right',
              cell: (r) => (
                <span className={r.variance === 0 ? 'text-slate-500' : 'font-semibold text-amber-600'}>
                  {r.variance > 0 ? '+' : ''}
                  {r.variance.toLocaleString('en-US')} {BASE_UNIT_SHORT[r.baseUnit]}
                </span>
              ),
            },
            {
              header: 'Variance cost',
              align: 'right',
              cell: (r) => (
                <span className={r.varianceCost === 0 ? 'text-slate-500' : 'font-bold text-red-600'}>
                  {formatMoney(r.varianceCost)}
                </span>
              ),
            },
          ]}
        />
      )}
    </SectionCard>
  );
}

// --- Audit log ---------------------------------------------------------------

const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[];

function AuditReport() {
  const [action, setAction] = useState<string>('');
  const [limit, setLimit] = useState(100);
  const log = useAuditLog({ action: action || undefined, limit });

  return (
    <SectionCard
      title="Audit log"
      description="Every void, discount, override, split/merge/transfer and goods-received event — with actor and PIN approver."
      actions={
        <div className="flex items-center gap-2">
          <SelectInput value={action} onChange={(e) => setAction(e.target.value)} className="!w-auto py-1.5 text-sm">
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABELS[a]}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            value={String(limit)}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="!w-auto py-1.5 text-sm"
          >
            <option value="50">Last 50</option>
            <option value="100">Last 100</option>
            <option value="200">Last 200</option>
            <option value="500">Last 500</option>
          </SelectInput>
        </div>
      }
    >
      {log.isLoading ? (
        <div className="px-4 py-10 text-center text-sm text-slate-400">
          <Spinner /> Loading…
        </div>
      ) : (
        <Table
          rows={log.data ?? []}
          keyOf={(r) => r.id}
          empty="No audit entries match this filter."
          columns={[
            { header: 'When', cell: (r) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.createdAt)}</span> },
            {
              header: 'Action',
              cell: (r) => <Badge tone={AUDIT_ACTION_TONE[r.action as AuditAction] ?? 'slate'}>{AUDIT_ACTION_LABELS[r.action as AuditAction] ?? r.action}</Badge>,
            },
            { header: 'Actor', cell: (r) => r.actorName ?? '—' },
            {
              header: 'Approver',
              cell: (r) => (r.approverName ? <span className="text-amber-700">{r.approverName}</span> : <span className="text-slate-400">—</span>),
            },
            {
              header: 'Details',
              cell: (r) => (
                <div className="text-sm text-slate-500">
                  <span className="text-slate-600">{r.entityType}</span>
                  {r.reason ? <span className="text-slate-400"> · {r.reason}</span> : null}
                </div>
              ),
            },
          ]}
        />
      )}
    </SectionCard>
  );
}
