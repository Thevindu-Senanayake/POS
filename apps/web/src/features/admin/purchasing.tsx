'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { formatMoney, type PurchaseOrderDTO, type SupplierDTO } from '@pos/shared';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FullscreenSpinner, Spinner } from '@/components/ui/spinner';
import {
  useCreatePurchaseOrder,
  useCreateSupplier,
  useDeletePurchaseOrder,
  useDeleteSupplier,
  useIngredients,
  usePurchaseOrders,
  useReceivePurchaseOrder,
  useSuppliers,
  useUpdatePurchaseOrder,
  useUpdateSupplier,
} from './api';
import { BASE_UNIT_SHORT, PO_STATUS_LABELS, PO_STATUS_TONE, formatDate } from './format';
import {
  AdminPage,
  Badge,
  ErrorNote,
  Field,
  SectionCard,
  SelectInput,
  Table,
  TextInput,
  inputClass,
} from './ui';

type Tab = 'orders' | 'suppliers';

/** Purchasing (spec §2.2/§4): suppliers and purchase orders → goods receiving. */
export function PurchasingScreen() {
  const [tab, setTab] = useState<Tab>('orders');
  return (
    <AdminPage
      title="Purchasing"
      subtitle="Raise purchase orders, receive goods into stock, and manage suppliers."
      actions={
        <div className="flex rounded-xl border border-sand-200 bg-sand-100 p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setTab('orders')}
            className={`rounded-lg px-4 py-1.5 ${tab === 'orders' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
          >
            Purchase orders
          </button>
          <button
            type="button"
            onClick={() => setTab('suppliers')}
            className={`rounded-lg px-4 py-1.5 ${tab === 'suppliers' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
          >
            Suppliers
          </button>
        </div>
      }
    >
      {tab === 'orders' ? <PurchaseOrders /> : <Suppliers />}
    </AdminPage>
  );
}

// --- Purchase orders ---------------------------------------------------------

function PurchaseOrders() {
  const [status, setStatus] = useState<'all' | 'draft' | 'received'>('all');
  const orders = usePurchaseOrders(status === 'all' ? undefined : status);
  const [editing, setEditing] = useState<PurchaseOrderDTO | 'new' | null>(null);
  const [receiving, setReceiving] = useState<PurchaseOrderDTO | null>(null);
  const [deleting, setDeleting] = useState<PurchaseOrderDTO | null>(null);

  return (
    <SectionCard
      title="Purchase orders"
      actions={
        <div className="flex items-center gap-2">
          <SelectInput
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="!w-auto py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="received">Received</option>
          </SelectInput>
          <Button onClick={() => setEditing('new')}>New order</Button>
        </div>
      }
    >
      {orders.isLoading ? (
        <div className="px-4 py-10 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <Table
          rows={orders.data ?? []}
          keyOf={(o) => o.id}
          empty="No purchase orders yet."
          columns={[
            {
              header: 'Supplier',
              cell: (o) => (
                <div>
                  <div className="font-semibold text-slate-900">{o.supplierName ?? '—'}</div>
                  {o.reference ? <div className="text-xs text-slate-400">Ref: {o.reference}</div> : null}
                </div>
              ),
            },
            { header: 'Ordered', cell: (o) => <span className="text-slate-500">{formatDate(o.orderedAt)}</span> },
            { header: 'Items', align: 'right', cell: (o) => o.items.length },
            { header: 'Total', align: 'right', cell: (o) => <span className="font-semibold">{formatMoney(o.total)}</span> },
            { header: 'Status', cell: (o) => <Badge tone={PO_STATUS_TONE[o.status]}>{PO_STATUS_LABELS[o.status]}</Badge> },
            {
              header: '',
              align: 'right',
              cell: (o) =>
                o.status === 'draft' ? (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" onClick={() => setDeleting(o)}>
                      Delete
                    </Button>
                    <Button variant="secondary" onClick={() => setEditing(o)}>
                      Edit
                    </Button>
                    <Button onClick={() => setReceiving(o)}>Receive</Button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">
                    Received {o.receivedAt ? formatDate(o.receivedAt) : ''}
                  </span>
                ),
            },
          ]}
        />
      )}

      {editing ? (
        <PurchaseOrderModal order={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
      {receiving ? <ReceiveModal order={receiving} onClose={() => setReceiving(null)} /> : null}
      {deleting ? <DeletePoModal order={deleting} onClose={() => setDeleting(null)} /> : null}
    </SectionCard>
  );
}

const poSchema = z.object({
  supplierId: z.string().min(1, 'Choose a supplier'),
  reference: z.string().trim().optional(),
  items: z
    .array(
      z.object({
        ingredientId: z.string().min(1, 'Choose an ingredient'),
        qty: z.coerce.number().positive('Qty > 0'),
        unitCost: z.coerce.number().min(0, 'Cost ≥ 0'),
        batchRef: z.string().trim().optional(),
      }),
    )
    .min(1, 'Add at least one line'),
});
type PoValues = z.infer<typeof poSchema>;

function PurchaseOrderModal({ order, onClose }: { order: PurchaseOrderDTO | null; onClose: () => void }) {
  const isEdit = !!order;
  const ingredients = useIngredients();
  const suppliers = useSuppliers();
  const create = useCreatePurchaseOrder();
  const update = useUpdatePurchaseOrder();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PoValues>({
    resolver: zodResolver(poSchema),
    defaultValues: {
      supplierId: order?.supplierId ?? '',
      reference: order?.reference ?? '',
      items: order?.items.map((i) => ({
        ingredientId: i.ingredientId,
        qty: i.qty,
        unitCost: i.unitCost,
        batchRef: i.batchRef ?? '',
      })) ?? [{ ingredientId: '', qty: 1, unitCost: 0, batchRef: '' }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watched = watch('items');
  const grandTotal = (watched ?? []).reduce(
    (sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitCost) || 0),
    0,
  );

  const activeIngredients = useMemo(() => ingredients.data ?? [], [ingredients.data]);
  const unitFor = (id: string) => activeIngredients.find((i) => i.id === id)?.baseUnit;

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const items = v.items.map((i) => ({
        ingredientId: i.ingredientId,
        qty: i.qty,
        unitCost: i.unitCost,
        batchRef: i.batchRef || undefined,
      }));
      if (isEdit) {
        // Draft edit: the API replaces the whole item set; supplier/reference are fixed.
        await update.mutateAsync({ id: order.id, body: { items } });
      } else {
        await create.mutateAsync({ supplierId: v.supplierId, reference: v.reference || undefined, items });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the purchase order');
    }
  });

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit draft order' : 'New purchase order'} widthClassName="max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Supplier" htmlFor="po-supplier" error={errors.supplierId?.message}>
            <SelectInput id="po-supplier" disabled={isEdit} {...register('supplierId')}>
              <option value="">— Choose —</option>
              {(suppliers.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Reference (optional)" htmlFor="po-ref">
            <TextInput id="po-ref" disabled={isEdit} placeholder="Invoice / PO no." {...register('reference')} />
          </Field>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Line items</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => append({ ingredientId: '', qty: 1, unitCost: 0, batchRef: '' })}
            >
              + Add line
            </Button>
          </div>
          {errors.items?.message ? <ErrorNote message={errors.items.message} /> : null}

          <div className="space-y-2">
            {fields.map((f, idx) => {
              const unit = unitFor(watched?.[idx]?.ingredientId ?? '');
              const lineTotal = (Number(watched?.[idx]?.qty) || 0) * (Number(watched?.[idx]?.unitCost) || 0);
              return (
                <div key={f.id} className="grid grid-cols-[1fr_84px_100px_36px] items-start gap-2">
                  <div>
                    <select className={inputClass} {...register(`items.${idx}.ingredientId` as const)}>
                      <option value="">— Ingredient —</option>
                      {activeIngredients.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                    {errors.items?.[idx]?.ingredientId ? (
                      <p className="mt-1 text-xs text-red-600">{errors.items[idx]?.ingredientId?.message}</p>
                    ) : null}
                  </div>
                  <div>
                    <input
                      className={inputClass}
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder={unit ? `qty (${BASE_UNIT_SHORT[unit]})` : 'qty'}
                      {...register(`items.${idx}.qty` as const)}
                    />
                  </div>
                  <div>
                    <input
                      className={inputClass}
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="unit cost"
                      {...register(`items.${idx}.unitCost` as const)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => (fields.length > 1 ? remove(idx) : null)}
                    className="mt-2 text-slate-400 hover:text-red-600 disabled:opacity-30"
                    disabled={fields.length <= 1}
                    aria-label="Remove line"
                  >
                    ✕
                  </button>
                  <div className="col-span-4 -mt-1 text-right text-xs text-slate-400">
                    Line: {formatMoney(lineTotal)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-sand-50 px-4 py-3">
          <span className="text-sm font-semibold text-slate-600">Order total</span>
          <span className="text-lg font-bold text-slate-900">{formatMoney(grandTotal)}</span>
        </div>

        <ErrorNote message={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : isEdit ? 'Save draft' : 'Create order'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReceiveModal({ order, onClose }: { order: PurchaseOrderDTO; onClose: () => void }) {
  const receive = useReceivePurchaseOrder();
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setError(null);
    try {
      await receive.mutateAsync(order.id);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not receive the order');
    }
  };
  return (
    <Modal open onClose={onClose} title="Receive goods" widthClassName="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Receiving <span className="font-semibold">{order.supplierName}</span>&apos;s order adds{' '}
          <span className="font-semibold">{order.items.length}</span> item{order.items.length === 1 ? '' : 's'} into
          stock and updates weighted-average costs. This cannot be undone.
        </p>
        <div className="rounded-xl bg-sand-50 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Order total</span>
            <span className="font-bold">{formatMoney(order.total)}</span>
          </div>
        </div>
        <ErrorNote message={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={run} disabled={receive.isPending}>
            {receive.isPending ? <Spinner /> : 'Confirm & receive'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DeletePoModal({ order, onClose }: { order: PurchaseOrderDTO; onClose: () => void }) {
  const del = useDeletePurchaseOrder();
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setError(null);
    try {
      await del.mutateAsync(order.id);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete the order');
    }
  };
  return (
    <Modal open onClose={onClose} title="Delete draft order" widthClassName="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Delete this draft order from <span className="font-semibold">{order.supplierName}</span>? This cannot be
          undone.
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

// --- Suppliers ---------------------------------------------------------------

function Suppliers() {
  const suppliers = useSuppliers();
  const [editing, setEditing] = useState<SupplierDTO | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SupplierDTO | null>(null);

  if (suppliers.isLoading) return <FullscreenSpinner label="Loading suppliers…" />;

  return (
    <SectionCard title="Suppliers" actions={<Button onClick={() => setEditing('new')}>Add supplier</Button>}>
      <Table
        rows={suppliers.data ?? []}
        keyOf={(s) => s.id}
        empty="No suppliers yet."
        columns={[
          { header: 'Name', cell: (s) => <span className="font-semibold text-slate-900">{s.name}</span> },
          { header: 'Contact', cell: (s) => <span className="text-slate-500">{s.contactInfo ?? '—'}</span> },
          { header: 'Phone', cell: (s) => <span className="text-slate-500">{s.phone ?? '—'}</span> },
          { header: 'Email', cell: (s) => <span className="text-slate-500">{s.email ?? '—'}</span> },
          {
            header: '',
            align: 'right',
            cell: (s) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" onClick={() => setDeleting(s)}>
                  Delete
                </Button>
                <Button variant="secondary" onClick={() => setEditing(s)}>
                  Edit
                </Button>
              </div>
            ),
          },
        ]}
      />
      {editing ? (
        <SupplierModal supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
      {deleting ? <DeleteSupplierModal supplier={deleting} onClose={() => setDeleting(null)} /> : null}
    </SectionCard>
  );
}

const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  contactInfo: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.union([z.string().trim().email('Enter a valid email'), z.literal('')]),
});
type SupplierValues = z.infer<typeof supplierSchema>;

function SupplierModal({ supplier, onClose }: { supplier: SupplierDTO | null; onClose: () => void }) {
  const isEdit = !!supplier;
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SupplierValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: supplier?.name ?? '',
      contactInfo: supplier?.contactInfo ?? '',
      phone: supplier?.phone ?? '',
      email: supplier?.email ?? '',
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    const body = {
      name: v.name,
      contactInfo: v.contactInfo || undefined,
      phone: v.phone || undefined,
      email: v.email || undefined,
    };
    try {
      if (isEdit) await update.mutateAsync({ id: supplier.id, body });
      else await create.mutateAsync(body);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the supplier');
    }
  });

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit ${supplier.name}` : 'New supplier'} widthClassName="max-w-md">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Name" htmlFor="sup-name" error={errors.name?.message}>
          <TextInput id="sup-name" autoFocus {...register('name')} />
        </Field>
        <Field label="Contact person (optional)" htmlFor="sup-contact">
          <TextInput id="sup-contact" {...register('contactInfo')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone (optional)" htmlFor="sup-phone">
            <TextInput id="sup-phone" {...register('phone')} />
          </Field>
          <Field label="Email (optional)" htmlFor="sup-email" error={errors.email?.message}>
            <TextInput id="sup-email" type="email" {...register('email')} />
          </Field>
        </div>
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

function DeleteSupplierModal({ supplier, onClose }: { supplier: SupplierDTO; onClose: () => void }) {
  const del = useDeleteSupplier();
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setError(null);
    try {
      await del.mutateAsync(supplier.id);
      onClose();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 409
            ? 'This supplier is referenced by ingredients or orders and cannot be deleted.'
            : e.message
          : 'Could not delete the supplier',
      );
    }
  };
  return (
    <Modal open onClose={onClose} title="Delete supplier" widthClassName="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Delete <span className="font-semibold">{supplier.name}</span>? This cannot be undone.
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
