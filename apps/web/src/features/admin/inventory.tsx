'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { BASE_UNITS, INGREDIENT_DEPARTMENTS, formatMoney, type IngredientDepartment, type IngredientDTO } from '@pos/shared';
import { ApiError } from '@pos/client-core';
import { Button } from '@pos/client-core';
import { Modal } from '@pos/client-core';
import { FullscreenSpinner, Spinner } from '@pos/client-core';
import {
  useAdjustStock,
  useCreateIngredient,
  useIngredients,
  useStockMovements,
  useSuppliers,
  useUpdateIngredient,
} from './api';
import {
  BASE_UNIT_LABELS,
  BASE_UNIT_SHORT,
  INGREDIENT_DEPARTMENT_LABELS,
  INGREDIENT_DEPARTMENT_TONE,
  STOCK_REASON_LABELS,
  STOCK_REASON_TONE,
  formatDateTime,
  formatQty,
} from './format';
import { AdminPage, Badge, ErrorNote, Field, SearchInput, SectionCard, SelectInput, Table, TextInput } from './ui';

/** Inventory workspace (spec §2.2/§2.8): ingredients, live stock, manual adjustments. */
export function InventoryScreen() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const [department, setDepartment] = useState<IngredientDepartment | 'all'>('all');
  const [query, setQuery] = useState('');
  const ingredients = useIngredients(includeInactive);
  const [editing, setEditing] = useState<IngredientDTO | 'new' | null>(null);
  const [adjusting, setAdjusting] = useState<IngredientDTO | null>(null);
  const [history, setHistory] = useState<IngredientDTO | null>(null);

  if (ingredients.isLoading) return <FullscreenSpinner label="Loading inventory…" />;

  const q = query.trim().toLowerCase();
  const rows = (ingredients.data ?? []).filter(
    (r) => (department === 'all' || r.department === department) && (!q || r.name.toLowerCase().includes(q)),
  );
  // A new ingredient defaults to the department currently in view (Bar/Restaurant).
  const newDepartment: IngredientDepartment = department === 'all' ? 'restaurant' : department;

  return (
    <AdminPage
      title="Inventory"
      subtitle="Bar stock and restaurant raw materials, live stock levels and manual adjustments."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search ingredients…"
            className="w-full sm:w-56"
          />
          <div className="flex rounded-xl border border-sand-200 bg-sand-100 p-1 text-sm font-semibold">
            {(['all', 'bar', 'restaurant'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDepartment(d)}
                className={`rounded-lg px-4 py-1.5 ${department === d ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
              >
                {d === 'all' ? 'All' : INGREDIENT_DEPARTMENT_LABELS[d]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Show inactive
          </label>
          <Button onClick={() => setEditing('new')}>Add ingredient</Button>
        </div>
      }
    >
      <SectionCard>
        <Table
          rows={rows}
          keyOf={(r) => r.id}
          empty={q ? 'No ingredients match your search.' : 'No ingredients yet. Add one to start tracking stock.'}
          columns={[
            {
              header: 'Ingredient',
              cell: (r) => (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{r.name}</span>
                  {!r.isActive ? <Badge tone="slate">Inactive</Badge> : null}
                </div>
              ),
            },
            { header: 'Unit', cell: (r) => BASE_UNIT_LABELS[r.baseUnit] },
            {
              header: 'Department',
              cell: (r) => (
                <Badge tone={INGREDIENT_DEPARTMENT_TONE[r.department]}>
                  {INGREDIENT_DEPARTMENT_LABELS[r.department]}
                </Badge>
              ),
            },
            {
              header: 'In stock',
              align: 'right',
              cell: (r) => (
                <span className={r.lowStock ? 'font-bold text-amber-600' : 'font-semibold'}>
                  {r.currentStock.toLocaleString('en-US')} {BASE_UNIT_SHORT[r.baseUnit]}
                </span>
              ),
            },
            {
              header: 'Reorder at',
              align: 'right',
              cell: (r) => `${r.reorderLevel.toLocaleString('en-US')} ${BASE_UNIT_SHORT[r.baseUnit]}`,
            },
            { header: 'Cost / unit', align: 'right', cell: (r) => formatMoney(r.costPerUnit) },
            {
              header: '',
              align: 'right',
              cell: (r) => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" onClick={() => setHistory(r)}>
                    History
                  </Button>
                  <Button variant="ghost" onClick={() => setAdjusting(r)}>
                    Adjust
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(r)}>
                    Edit
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </SectionCard>

      {editing ? (
        <IngredientModal
          ingredient={editing === 'new' ? null : editing}
          defaultDepartment={newDepartment}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {adjusting ? <AdjustModal ingredient={adjusting} onClose={() => setAdjusting(null)} /> : null}
      {history ? <MovementsModal ingredient={history} onClose={() => setHistory(null)} /> : null}
    </AdminPage>
  );
}

// --- Create / edit ingredient ------------------------------------------------

const ingredientSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  baseUnit: z.enum(['g', 'ml', 'pcs']),
  department: z.enum(['bar', 'restaurant']),
  reorderLevel: z.coerce.number().min(0, 'Must be 0 or more'),
  costPerUnit: z.coerce.number().min(0, 'Must be 0 or more'),
  supplierId: z.string(),
  openingStock: z.coerce.number().min(0, 'Must be 0 or more'),
  isActive: z.boolean(),
});
type IngredientValues = z.infer<typeof ingredientSchema>;

function IngredientModal({
  ingredient,
  defaultDepartment,
  onClose,
}: {
  ingredient: IngredientDTO | null;
  defaultDepartment: IngredientDepartment;
  onClose: () => void;
}) {
  const isEdit = !!ingredient;
  const suppliers = useSuppliers();
  const create = useCreateIngredient();
  const update = useUpdateIngredient();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<IngredientValues>({
    resolver: zodResolver(ingredientSchema),
    defaultValues: {
      name: ingredient?.name ?? '',
      baseUnit: ingredient?.baseUnit ?? 'g',
      department: ingredient?.department ?? defaultDepartment,
      reorderLevel: ingredient?.reorderLevel ?? 0,
      costPerUnit: ingredient?.costPerUnit ?? 0,
      supplierId: ingredient?.supplierId ?? '',
      openingStock: 0,
      isActive: ingredient?.isActive ?? true,
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: ingredient.id,
          body: {
            name: v.name,
            baseUnit: v.baseUnit,
            department: v.department,
            reorderLevel: v.reorderLevel,
            costPerUnit: v.costPerUnit,
            supplierId: v.supplierId || null,
            isActive: v.isActive,
          },
        });
      } else {
        await create.mutateAsync({
          name: v.name,
          baseUnit: v.baseUnit,
          department: v.department,
          reorderLevel: v.reorderLevel,
          costPerUnit: v.costPerUnit,
          supplierId: v.supplierId || undefined,
          openingStock: v.openingStock || undefined,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the ingredient');
    }
  });

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit ${ingredient.name}` : 'New ingredient'} widthClassName="max-w-md">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Name" htmlFor="ing-name" error={errors.name?.message}>
          <TextInput id="ing-name" autoFocus {...register('name')} />
        </Field>
        <Field
          label="Department"
          htmlFor="ing-dept"
          error={errors.department?.message}
          hint="Bar stock (spirits, wine, mixers) or restaurant raw materials"
        >
          <SelectInput id="ing-dept" {...register('department')}>
            {INGREDIENT_DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {INGREDIENT_DEPARTMENT_LABELS[d]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Base unit" htmlFor="ing-unit" error={errors.baseUnit?.message}>
            <SelectInput id="ing-unit" disabled={isEdit} {...register('baseUnit')}>
              {BASE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {BASE_UNIT_LABELS[u]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Reorder level" htmlFor="ing-reorder" error={errors.reorderLevel?.message}>
            <TextInput id="ing-reorder" type="number" step="0.001" min="0" {...register('reorderLevel')} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Cost / unit"
            htmlFor="ing-cost"
            error={errors.costPerUnit?.message}
            hint="Auto-updated on goods receiving"
          >
            <TextInput id="ing-cost" type="number" step="0.01" min="0" {...register('costPerUnit')} />
          </Field>
          {isEdit ? (
            <Field label="Status" htmlFor="ing-active">
              <label className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" className="h-5 w-5" {...register('isActive')} /> Active
              </label>
            </Field>
          ) : (
            <Field label="Opening stock" htmlFor="ing-opening" error={errors.openingStock?.message}>
              <TextInput id="ing-opening" type="number" step="0.001" min="0" {...register('openingStock')} />
            </Field>
          )}
        </div>
        <Field label="Supplier" htmlFor="ing-supplier">
          <SelectInput id="ing-supplier" {...register('supplierId')}>
            <option value="">- None -</option>
            {(suppliers.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectInput>
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

// --- Manual stock adjustment (spec §2.2: wastage / adjustment / return) -------

const adjustSchema = z.object({
  direction: z.enum(['add', 'remove']),
  amount: z.coerce.number().positive('Enter an amount greater than zero'),
  reason: z.enum(['adjustment', 'wastage', 'return']),
  note: z.string().trim().optional(),
});
type AdjustValues = z.infer<typeof adjustSchema>;

function AdjustModal({ ingredient, onClose }: { ingredient: IngredientDTO; onClose: () => void }) {
  const adjust = useAdjustStock();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AdjustValues>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { direction: 'remove', amount: 0, reason: 'wastage', note: '' },
  });

  const direction = watch('direction');
  const amount = Number(watch('amount')) || 0;
  const delta = direction === 'add' ? amount : -amount;
  const projected = ingredient.currentStock + delta;

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await adjust.mutateAsync({
        id: ingredient.id,
        body: {
          changeQty: v.direction === 'add' ? v.amount : -v.amount,
          reason: v.reason,
          note: v.note || undefined,
        },
      });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not adjust stock');
    }
  });

  return (
    <Modal open onClose={onClose} title={`Adjust - ${ingredient.name}`} widthClassName="max-w-md">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="text-sm text-slate-500">
          Current stock:{' '}
          <span className="font-bold text-slate-800">
            {ingredient.currentStock.toLocaleString('en-US')} {BASE_UNIT_SHORT[ingredient.baseUnit]}
          </span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Direction" htmlFor="adj-dir">
            <SelectInput id="adj-dir" {...register('direction')}>
              <option value="remove">Remove (−)</option>
              <option value="add">Add (+)</option>
            </SelectInput>
          </Field>
          <Field label={`Amount (${BASE_UNIT_SHORT[ingredient.baseUnit]})`} htmlFor="adj-amt" error={errors.amount?.message}>
            <TextInput id="adj-amt" type="number" step="0.001" min="0" autoFocus {...register('amount')} />
          </Field>
        </div>
        <Field label="Reason" htmlFor="adj-reason">
          <SelectInput id="adj-reason" {...register('reason')}>
            <option value="wastage">Wastage</option>
            <option value="adjustment">Adjustment (stock-take)</option>
            <option value="return">Return</option>
          </SelectInput>
        </Field>
        <Field label="Note (optional)" htmlFor="adj-note">
          <TextInput id="adj-note" placeholder="e.g. spoiled, breakage, recount" {...register('note')} />
        </Field>
        <div className="rounded-xl bg-sand-50 px-4 py-3 text-sm">
          New level:{' '}
          <span className={projected < 0 ? 'font-bold text-red-600' : 'font-bold text-slate-800'}>
            {projected.toLocaleString('en-US')} {BASE_UNIT_SHORT[ingredient.baseUnit]}
          </span>
          {projected < 0 ? <span className="ml-2 text-red-600">- would go negative</span> : null}
        </div>
        <ErrorNote message={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={isSubmitting || amount === 0}>
            {isSubmitting ? <Spinner /> : 'Apply adjustment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// --- Stock movement history --------------------------------------------------

function MovementsModal({ ingredient, onClose }: { ingredient: IngredientDTO; onClose: () => void }) {
  const movements = useStockMovements(ingredient.id);
  return (
    <Modal open onClose={onClose} title={`Stock history - ${ingredient.name}`} widthClassName="max-w-2xl">
      {movements.isLoading ? (
        <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          <Table
            rows={movements.data ?? []}
            keyOf={(m) => m.id}
            empty="No movements recorded yet."
            columns={[
              { header: 'When', cell: (m) => <span className="text-xs text-slate-500">{formatDateTime(m.createdAt)}</span> },
              { header: 'Reason', cell: (m) => <Badge tone={STOCK_REASON_TONE[m.reason]}>{STOCK_REASON_LABELS[m.reason]}</Badge> },
              {
                header: 'Change',
                align: 'right',
                cell: (m) => (
                  <span className={m.changeQty >= 0 ? 'font-bold text-emerald-600' : 'font-bold text-red-600'}>
                    {formatQty(m.changeQty, ingredient.baseUnit, true)}
                  </span>
                ),
              },
              { header: 'Note', cell: (m) => <span className="text-slate-500">{m.note ?? '-'}</span> },
            ]}
          />
        </div>
      )}
      <div className="mt-4">
        <Button className="w-full" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
