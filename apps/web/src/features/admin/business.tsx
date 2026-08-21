'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm, type UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { DEFAULT_CURRENCY_SYMBOL, type OutletDTO } from '@pos/shared';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { FullscreenSpinner, Spinner } from '@/components/ui/spinner';
import { useOutlet, useUpdateOutlet, type OutletInput } from './api';
import { AdminPage, ErrorNote, SectionCard, TextInput, inputClass } from './ui';

/**
 * Business tab (spec: owner-editable receipt). Edits the singleton outlet's
 * identity and every customer-receipt header/footer line. Each line pairs a text
 * value with a "Show on receipt" toggle; the live preview mirrors exactly what
 * the print-agent renders (a line prints only when its toggle is on and the
 * value is non-empty). Currency label prefixes the total on the printed bill.
 */
const businessSchema = z.object({
  name: z.string().trim().min(1, 'Business name is required'),
  tagline: z.string().trim(),
  address: z.string().trim(),
  phone: z.string().trim(),
  taxNumber: z.string().trim(),
  receiptCurrencyLabel: z.string().trim(),
  receiptFooter: z.string().trim(),
  showName: z.boolean(),
  showTagline: z.boolean(),
  showAddress: z.boolean(),
  showPhone: z.boolean(),
  showTaxNumber: z.boolean(),
  showCurrencyLabel: z.boolean(),
  showFooter: z.boolean(),
  showLogo: z.boolean(),
});
type BusinessValues = z.infer<typeof businessSchema>;

type TextField =
  | 'name'
  | 'tagline'
  | 'address'
  | 'phone'
  | 'taxNumber'
  | 'receiptCurrencyLabel'
  | 'receiptFooter';
type ShowField =
  | 'showName'
  | 'showTagline'
  | 'showAddress'
  | 'showPhone'
  | 'showTaxNumber'
  | 'showCurrencyLabel'
  | 'showFooter';

function toValues(o: OutletDTO): BusinessValues {
  return {
    name: o.name ?? '',
    tagline: o.tagline ?? '',
    address: o.address ?? '',
    phone: o.phone ?? '',
    taxNumber: o.taxNumber ?? '',
    receiptCurrencyLabel: o.receiptCurrencyLabel ?? '',
    receiptFooter: o.receiptFooter ?? '',
    showName: o.showName,
    showTagline: o.showTagline,
    showAddress: o.showAddress,
    showPhone: o.showPhone,
    showTaxNumber: o.showTaxNumber,
    showCurrencyLabel: o.showCurrencyLabel,
    showFooter: o.showFooter,
    showLogo: o.showLogo,
  };
}

export function BusinessScreen() {
  const outlet = useOutlet();
  if (outlet.isLoading) return <FullscreenSpinner label="Loading business settings…" />;
  if (outlet.isError || !outlet.data) {
    return (
      <AdminPage title="Business" subtitle="Business identity and customer-receipt customisation.">
        <ErrorNote message="Could not load the outlet settings." />
      </AdminPage>
    );
  }
  return <BusinessForm outlet={outlet.data} />;
}

function BusinessForm({ outlet }: { outlet: OutletDTO }) {
  const update = useUpdateOutlet();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<BusinessValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: toValues(outlet),
  });

  // Keep the form in sync if the outlet is refetched from elsewhere.
  useEffect(() => {
    reset(toValues(outlet));
  }, [outlet, reset]);

  const values = watch();

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    setSavedAt(null);
    // Empty text → null so the owner can clear a line entirely.
    const clean = (s: string): string | null => (s.trim() === '' ? null : s.trim());
    const body: OutletInput = {
      name: v.name.trim(),
      address: clean(v.address),
      phone: clean(v.phone),
      tagline: clean(v.tagline),
      taxNumber: clean(v.taxNumber),
      receiptCurrencyLabel: clean(v.receiptCurrencyLabel),
      receiptFooter: clean(v.receiptFooter),
      showName: v.showName,
      showTagline: v.showTagline,
      showAddress: v.showAddress,
      showPhone: v.showPhone,
      showTaxNumber: v.showTaxNumber,
      showCurrencyLabel: v.showCurrencyLabel,
      showFooter: v.showFooter,
      showLogo: v.showLogo,
    };
    try {
      const updated = await update.mutateAsync(body);
      reset(toValues(updated));
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save business settings');
    }
  });

  return (
    <AdminPage
      title="Business"
      subtitle="Business identity and the customer-receipt header, footer and currency label."
    >
      <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-3" noValidate>
        <div className="space-y-4 lg:col-span-2">
          <SectionCard
            title="Logo"
            description="Printed centered at the very top of every customer bill, above the header."
          >
            <div className="flex flex-wrap items-center gap-4 p-4">
              <img
                src="/receipt-logo.png"
                alt="Receipt logo"
                className="h-16 w-auto rounded-lg bg-white p-2 ring-1 ring-sand-200"
              />
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" className="h-5 w-5" {...register('showLogo')} /> Show logo on
                  receipt
                </label>
                <p className="mt-1 text-xs text-slate-400">
                  The logo ships with the printer agent. Turn it off to print bills without it.
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Receipt header"
            description="Printed at the top of every customer bill. Toggle each line on or off; a line only prints when shown and not empty."
          >
            <div className="space-y-3 p-4">
              <LineField
                label="Business name"
                field="name"
                toggle="showName"
                register={register}
                error={errors.name?.message}
                hint="Required. Printed bold at the top."
              />
              <LineField
                label="Tagline"
                field="tagline"
                toggle="showTagline"
                register={register}
                hint="e.g. Restaurant · Bar · Rooms"
              />
              <LineField label="Address" field="address" toggle="showAddress" register={register} />
              <LineField label="Phone" field="phone" toggle="showPhone" register={register} />
              <LineField
                label="Tax / reg. number"
                field="taxNumber"
                toggle="showTaxNumber"
                register={register}
                hint="e.g. NTN 1234567-8"
              />
            </div>
          </SectionCard>

          <SectionCard title="Currency & footer">
            <div className="space-y-3 p-4">
              <LineField
                label="Currency label"
                field="receiptCurrencyLabel"
                toggle="showCurrencyLabel"
                register={register}
                hint={`Prefixes the total on the bill (e.g. Rs.). Falls back to ${DEFAULT_CURRENCY_SYMBOL} when hidden.`}
              />
              <LineField
                label="Footer message"
                field="receiptFooter"
                toggle="showFooter"
                register={register}
                textarea
                hint="Printed centered below the total (e.g. Thank you for dining with us!)."
              />
            </div>
          </SectionCard>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              {error ? (
                <ErrorNote message={error} />
              ) : savedAt ? (
                <span className="font-medium text-emerald-600">Saved.</span>
              ) : isDirty ? (
                <span className="text-slate-400">Unsaved changes</span>
              ) : (
                <span className="text-slate-400">All changes saved.</span>
              )}
            </div>
            <Button type="submit" size="lg" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? <Spinner /> : 'Save changes'}
            </Button>
          </div>
        </div>

        <div className="lg:col-span-1">
          <SectionCard title="Receipt preview" description="How the header prints right now.">
            <ReceiptPreview values={values} />
          </SectionCard>
        </div>
      </form>
    </AdminPage>
  );
}

/** One editable receipt line: a value input plus its "Show on receipt" toggle. */
function LineField({
  label,
  field,
  toggle,
  register,
  error,
  hint,
  textarea,
}: {
  label: string;
  field: TextField;
  toggle: ShowField;
  register: UseFormRegister<BusinessValues>;
  error?: string;
  hint?: string;
  textarea?: boolean;
}) {
  return (
    <div className="rounded-xl border border-sand-200 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={`b-${field}`} className="text-sm font-semibold text-slate-700">
          {label}
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <input type="checkbox" className="h-5 w-5" {...register(toggle)} /> Show on receipt
        </label>
      </div>
      {textarea ? (
        <textarea id={`b-${field}`} rows={2} className={inputClass} {...register(field)} />
      ) : (
        <TextInput id={`b-${field}`} {...register(field)} />
      )}
      {error ? (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

/** Live monospace preview mirroring the print-agent's header/footer rules. */
function ReceiptPreview({ values }: { values: BusinessValues }) {
  const line = (show: boolean, value: string) => (show && value.trim() !== '' ? value.trim() : null);
  const currency =
    line(values.showCurrencyLabel, values.receiptCurrencyLabel) ?? DEFAULT_CURRENCY_SYMBOL;
  const header = [
    line(values.showName, values.name),
    line(values.showTagline, values.tagline),
    line(values.showAddress, values.address),
    line(values.showPhone, values.phone) ? `Tel: ${values.phone.trim()}` : null,
    line(values.showTaxNumber, values.taxNumber),
  ].filter((l): l is string => l !== null);
  const footer = line(values.showFooter, values.receiptFooter);

  return (
    <div className="p-4">
      <div className="mx-auto max-w-[260px] rounded-lg bg-sand-50 p-4 font-mono text-[11px] leading-5 text-slate-700 ring-1 ring-sand-200">
        {values.showLogo ? (
          <div className="mb-2 flex justify-center">
            <img src="/receipt-logo.png" alt="" className="h-10 w-auto" />
          </div>
        ) : null}
        <div className="text-center">
          {header.length === 0 ? (
            <div className="text-slate-300">(no header lines shown)</div>
          ) : (
            header.map((l, i) => (
              <div key={i} className={i === 0 ? 'font-bold' : ''}>
                {l}
              </div>
            ))
          )}
        </div>
        <div className="my-2 border-t border-dashed border-sand-300" />
        <div className="flex justify-between">
          <span>Sample item</span>
          <span>1,250.00</span>
        </div>
        <div className="my-2 border-t border-dashed border-sand-300" />
        <div className="flex justify-between font-bold">
          <span>TOTAL</span>
          <span>{currency} 1,250.00</span>
        </div>
        {footer ? <div className="mt-3 text-center">{footer}</div> : null}
      </div>
    </div>
  );
}
