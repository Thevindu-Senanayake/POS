'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  CHANNELS,
  MENU_CATEGORIES,
  STATIONS,
  formatMoney,
  type Channel,
  type IngredientDTO,
  type MenuItemDTO,
} from '@pos/shared';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FullscreenSpinner, Spinner } from '@/components/ui/spinner';
import {
  useCreateMenuItem,
  useDeleteMenuItem,
  useIngredients,
  useMenuItems,
  useRecipe,
  useSetPrices,
  useSetRecipe,
  useUpdateMenuItem,
} from './api';
import {
  BASE_UNIT_SHORT,
  CHANNEL_LABELS,
  CHANNEL_SHORT,
  MENU_CATEGORY_LABELS,
  STATION_LABELS,
} from './format';
import {
  AdminPage,
  Badge,
  ErrorNote,
  Field,
  SearchInput,
  SectionCard,
  SelectInput,
  Table,
  TextInput,
  inputClass,
} from './ui';

/** Menu & recipes (spec §2.3/§2.4/§2.9): items, per-channel prices, and BOM. */
export function MenuScreen() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const items = useMenuItems(includeInactive);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<MenuItemDTO | 'new' | null>(null);
  const [pricing, setPricing] = useState<MenuItemDTO | null>(null);
  const [recipeFor, setRecipeFor] = useState<MenuItemDTO | null>(null);
  const [deleting, setDeleting] = useState<MenuItemDTO | null>(null);

  if (items.isLoading) return <FullscreenSpinner label="Loading menu…" />;

  const q = query.trim().toLowerCase();
  const rows = (items.data ?? []).filter(
    (m) => !q || m.name.toLowerCase().includes(q) || MENU_CATEGORY_LABELS[m.category].toLowerCase().includes(q),
  );

  return (
    <AdminPage
      title="Menu & recipes"
      subtitle="Menu items, per-channel prices, and the recipe (BOM) that drives stock deduction."
      actions={
        <>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search items…"
            className="w-full sm:w-56"
          />
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Show inactive
          </label>
          <Button onClick={() => setEditing('new')}>Add item</Button>
        </>
      }
    >
      <SectionCard>
        <Table
          rows={rows}
          keyOf={(m) => m.id}
          empty={q ? 'No items match your search.' : 'No menu items yet.'}
          columns={[
            {
              header: 'Item',
              cell: (m) => (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{m.name}</span>
                  {!m.isActive ? <Badge tone="slate">Inactive</Badge> : null}
                </div>
              ),
            },
            { header: 'Category', cell: (m) => MENU_CATEGORY_LABELS[m.category] },
            { header: 'Station', cell: (m) => <Badge tone="slate">{STATION_LABELS[m.station]}</Badge> },
            {
              header: 'Prices',
              cell: (m) =>
                m.prices.length === 0 ? (
                  <span className="text-xs font-semibold text-amber-600">No prices set</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {m.prices.map((p) => (
                      <span
                        key={p.channel}
                        className="rounded-lg bg-sand-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-sand-200"
                        title={CHANNEL_LABELS[p.channel]}
                      >
                        {CHANNEL_SHORT[p.channel]} {formatMoney(p.price)}
                      </span>
                    ))}
                  </div>
                ),
            },
            {
              header: '',
              align: 'right',
              cell: (m) => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" onClick={() => setDeleting(m)}>
                    Delete
                  </Button>
                  <Button variant="ghost" onClick={() => setRecipeFor(m)}>
                    Recipe
                  </Button>
                  <Button variant="ghost" onClick={() => setPricing(m)}>
                    Prices
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(m)}>
                    Edit
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </SectionCard>

      {editing ? <ItemModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {pricing ? <PricesModal item={pricing} onClose={() => setPricing(null)} /> : null}
      {recipeFor ? <RecipeModal item={recipeFor} onClose={() => setRecipeFor(null)} /> : null}
      {deleting ? <DeleteItemModal item={deleting} onClose={() => setDeleting(null)} /> : null}
    </AdminPage>
  );
}

// --- Create / edit item ------------------------------------------------------

const itemSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  category: z.enum(['food', 'bar', 'room_service']),
  station: z.enum(['kitchen', 'bar']),
  isActive: z.boolean(),
});
type ItemValues = z.infer<typeof itemSchema>;

function ItemModal({ item, onClose }: { item: MenuItemDTO | null; onClose: () => void }) {
  const isEdit = !!item;
  const create = useCreateMenuItem();
  const update = useUpdateMenuItem();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ItemValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: item?.name ?? '',
      category: item?.category ?? 'food',
      station: item?.station ?? 'kitchen',
      isActive: item?.isActive ?? true,
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: item.id,
          body: { name: v.name, category: v.category, station: v.station, isActive: v.isActive },
        });
      } else {
        await create.mutateAsync({ name: v.name, category: v.category, station: v.station });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the item');
    }
  });

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit ${item.name}` : 'New menu item'} widthClassName="max-w-md">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Name" htmlFor="mi-name" error={errors.name?.message}>
          <TextInput id="mi-name" autoFocus {...register('name')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor="mi-cat">
            <SelectInput id="mi-cat" {...register('category')}>
              {MENU_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {MENU_CATEGORY_LABELS[c]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Print station" htmlFor="mi-station" hint="Where the KOT prints">
            <SelectInput id="mi-station" {...register('station')}>
              {STATIONS.map((s) => (
                <option key={s} value={s}>
                  {STATION_LABELS[s]}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
        {isEdit ? (
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" className="h-5 w-5" {...register('isActive')} /> Active (available to order)
          </label>
        ) : (
          <p className="rounded-xl bg-sand-50 px-4 py-3 text-xs text-slate-500">
            After creating the item, set its per-channel prices and recipe from the list.
          </p>
        )}
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

// --- Per-channel prices ------------------------------------------------------

function PricesModal({ item, onClose }: { item: MenuItemDTO; onClose: () => void }) {
  const setPrices = useSetPrices();
  const [error, setError] = useState<string | null>(null);
  // Prefill each channel from existing prices; empty string = "not offered on this channel".
  const [values, setValues] = useState<Record<Channel, string>>(() => {
    const initial = {} as Record<Channel, string>;
    for (const ch of CHANNELS) {
      const existing = item.prices.find((p) => p.channel === ch);
      initial[ch] = existing ? String(existing.price) : '';
    }
    return initial;
  });

  const save = async () => {
    setError(null);
    const prices = CHANNELS.filter((ch) => values[ch].trim() !== '').map((ch) => ({
      channel: ch,
      price: Number(values[ch]),
    }));
    if (prices.some((p) => Number.isNaN(p.price) || p.price < 0)) {
      setError('Prices must be zero or more.');
      return;
    }
    if (prices.length === 0) {
      setError('Set at least one channel price.');
      return;
    }
    try {
      await setPrices.mutateAsync({ id: item.id, prices });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save prices');
    }
  };

  return (
    <Modal open onClose={onClose} title={`Prices - ${item.name}`} widthClassName="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Set a price per sales channel. Leave a channel blank if the item isn&apos;t offered there.
        </p>
        <div className="space-y-3">
          {CHANNELS.map((ch) => (
            <div key={ch} className="flex items-center gap-3">
              <label htmlFor={`price-${ch}`} className="flex-1 text-sm font-medium text-slate-700">
                {CHANNEL_LABELS[ch]}
              </label>
              <input
                id={`price-${ch}`}
                className={`${inputClass} !w-40`}
                type="number"
                step="0.01"
                min="0"
                placeholder="-"
                value={values[ch]}
                onChange={(e) => setValues((v) => ({ ...v, [ch]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <ErrorNote message={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={save} disabled={setPrices.isPending}>
            {setPrices.isPending ? <Spinner /> : 'Save prices'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// --- Recipe / BOM editor -----------------------------------------------------

const recipeSchema = z.object({
  items: z.array(
    z.object({
      ingredientId: z.string().min(1, 'Choose an ingredient'),
      quantity: z.coerce.number().positive('Qty > 0'),
      notes: z.string().trim().optional(),
    }),
  ),
});
type RecipeValues = z.infer<typeof recipeSchema>;

function RecipeModal({ item, onClose }: { item: MenuItemDTO; onClose: () => void }) {
  const recipe = useRecipe(item.id);
  const ingredients = useIngredients();
  const setRecipe = useSetRecipe();
  const [error, setError] = useState<string | null>(null);

  if (recipe.isLoading || ingredients.isLoading) {
    return (
      <Modal open onClose={onClose} title={`Recipe - ${item.name}`} widthClassName="max-w-2xl">
        <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
      </Modal>
    );
  }

  return (
    <RecipeForm
      item={item}
      initial={(recipe.data ?? []).map((r) => ({
        ingredientId: r.ingredientId,
        quantity: r.quantity,
        notes: r.notes ?? '',
      }))}
      ingredients={ingredients.data ?? []}
      onClose={onClose}
      error={error}
      setError={setError}
      submitting={setRecipe.isPending}
      onSave={async (items) => {
        setError(null);
        try {
          await setRecipe.mutateAsync({ menuItemId: item.id, items });
          onClose();
        } catch (e) {
          setError(e instanceof ApiError ? e.message : 'Could not save the recipe');
        }
      }}
    />
  );
}

function RecipeForm({
  item,
  initial,
  ingredients,
  onClose,
  onSave,
  error,
  submitting,
}: {
  item: MenuItemDTO;
  initial: RecipeValues['items'];
  ingredients: IngredientDTO[];
  onClose: () => void;
  onSave: (items: { ingredientId: string; quantity: number; notes?: string }[]) => void;
  error: string | null;
  setError: (s: string | null) => void;
  submitting: boolean;
}) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RecipeValues>({
    resolver: zodResolver(recipeSchema),
    defaultValues: { items: initial },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watched = watch('items');
  const unitFor = (id: string) => ingredients.find((i) => i.id === id)?.baseUnit;

  const submit = handleSubmit((v) => {
    onSave(
      v.items.map((i) => ({ ingredientId: i.ingredientId, quantity: i.quantity, notes: i.notes || undefined })),
    );
  });

  return (
    <Modal open onClose={onClose} title={`Recipe - ${item.name}`} widthClassName="max-w-2xl">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-slate-500">
          Each line deducts <span className="font-medium">quantity × items sold</span> from stock when the order is
          sent to the kitchen. An empty recipe means no stock is deducted.
        </p>

        <div className="space-y-2">
          {fields.length === 0 ? (
            <p className="rounded-xl bg-sand-50 px-4 py-6 text-center text-sm text-slate-400">
              No ingredients. Add a line to build the recipe.
            </p>
          ) : null}
          {fields.map((f, idx) => {
            const unit = unitFor(watched?.[idx]?.ingredientId ?? '');
            return (
              <div key={f.id} className="grid grid-cols-[1fr_120px_1fr_36px] items-start gap-2">
                <div>
                  <select className={inputClass} {...register(`items.${idx}.ingredientId` as const)}>
                    <option value="">- Ingredient -</option>
                    {ingredients.map((i) => (
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
                    placeholder={unit ? BASE_UNIT_SHORT[unit] : 'qty'}
                    {...register(`items.${idx}.quantity` as const)}
                  />
                  {errors.items?.[idx]?.quantity ? (
                    <p className="mt-1 text-xs text-red-600">{errors.items[idx]?.quantity?.message}</p>
                  ) : null}
                </div>
                <input className={inputClass} placeholder="notes (optional)" {...register(`items.${idx}.notes` as const)} />
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="mt-2 text-slate-400 hover:text-red-600"
                  aria-label="Remove line"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() => append({ ingredientId: '', quantity: 1, notes: '' })}
        >
          + Add ingredient
        </Button>

        <ErrorNote message={error} />
        <div className="flex gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={submitting}>
            {submitting ? <Spinner /> : 'Save recipe'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// --- Delete ------------------------------------------------------------------

function DeleteItemModal({ item, onClose }: { item: MenuItemDTO; onClose: () => void }) {
  const del = useDeleteMenuItem();
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setError(null);
    try {
      await del.mutateAsync(item.id);
      onClose();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 409
            ? 'This item appears on past orders and cannot be deleted. Mark it inactive instead.'
            : e.message
          : 'Could not delete the item',
      );
    }
  };
  return (
    <Modal open onClose={onClose} title="Delete menu item" widthClassName="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Delete <span className="font-semibold">{item.name}</span>? If it appears on past orders, mark it inactive
          instead.
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
