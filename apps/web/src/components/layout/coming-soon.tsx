/** Placeholder shown by section stubs until their feature task lands. */
export function ComingSoon({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-slate-600">{note ?? 'This workspace is being built.'}</p>
      </div>
    </div>
  );
}
