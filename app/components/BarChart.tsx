const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

export type BarEntry = { label: string; value: number };

/**
 * C02 baseline: a dependency-free horizontal bar chart (inline styles).
 * Values may be negative (growth): the bar grows from a zero baseline.
 */
export default function BarChart({ title, note, entries }: { title: string; note?: string; entries: BarEntry[] }) {
  const max = Math.max(1, ...entries.map((entry) => Math.abs(entry.value)));
  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      <h2 className="border-b border-zinc-200 px-4 py-2 font-semibold">
        {title}
        {note ? <span className="ml-2 text-xs font-normal text-zinc-500">{note}</span> : null}
      </h2>
      {entries.length === 0 ? (
        <p className="px-4 py-6 text-sm text-zinc-500">No data in this commit set.</p>
      ) : (
        <div className="space-y-2.5 p-4">
          {entries.map((entry) => (
            <div key={entry.label}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate font-mono" title={entry.label}>
                  {entry.label}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-600">{number.format(entry.value)}</span>
              </div>
              <div className="mt-1 h-2 w-full rounded bg-zinc-100">
                <div
                  className={entry.value < 0 ? "h-2 rounded bg-red-400" : "h-2 rounded bg-zinc-800"}
                  style={{ width: `${Math.max(1, (Math.abs(entry.value) / max) * 100).toFixed(1)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
