import Link from "next/link";
import { notFound } from "next/navigation";
import DeleteRepoButton from "@/app/components/DeleteRepoButton";
import MergesPanel from "@/app/components/MergesPanel";
import { getDb, listRepositories } from "@/lib/db";
import { pathMatches } from "@/lib/filters";
import { getRepoAnalysis } from "@/lib/repos";

export const dynamic = "force-dynamic";

type MetricsRow = {
  path: string;
  added: number;
  removed: number;
  growth: number;
  churn: number;
  modifications: number;
};

const number = new Intl.NumberFormat("en-US");
const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

const inputClass = "mt-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** "YYYY-MM-DD" -> ISO instant at the start of that day (UTC); invalid -> undefined. */
function utcInstant(date?: string): string | undefined {
  if (!date) return undefined;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

/** "YYYY-MM-DD" (inclusive) -> ISO instant at the start of the next day (UTC). */
function endOfDayUtcInstant(date?: string): string | undefined {
  const start = utcInstant(date);
  if (!start) return undefined;
  return new Date(Date.parse(start) + 24 * 60 * 60 * 1000).toISOString();
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{decimal.format(value)}</p>
    </div>
  );
}

function MetricsTable({ title, firstHeader, rows }: { title: string; firstHeader: string; rows: MetricsRow[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      <h2 className="border-b border-zinc-200 px-4 py-2 font-semibold">
        {title} <span className="text-sm font-normal text-zinc-500">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-zinc-500">No line changes recorded.</p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">{firstHeader}</th>
                <th className="px-4 py-2 text-right font-medium">Added</th>
                <th className="px-4 py-2 text-right font-medium">Removed</th>
                <th className="px-4 py-2 text-right font-medium">Growth</th>
                <th className="px-4 py-2 text-right font-medium">Churn</th>
                <th className="px-4 py-2 text-right font-medium">Mods</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.path} className="hover:bg-zinc-50">
                  <td className="break-all px-4 py-1.5 font-mono text-xs">{row.path}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{number.format(row.added)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{number.format(row.removed)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{number.format(row.growth)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{number.format(row.churn)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{number.format(row.modifications)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function RepoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const repoId = Number(id);
  if (!Number.isInteger(repoId) || repoId < 1) notFound();

  const authorEmail = first(query.author)?.trim() || undefined;
  const fromDate = first(query.from)?.trim() || undefined;
  const toDate = first(query.to)?.trim() || undefined;
  const pathFilter = first(query.path)?.trim() ?? "";

  const db = getDb();
  const analysis = await getRepoAnalysis(db, repoId, {
    authorEmail,
    from: utcInstant(fromDate),
    to: endOfDayUtcInstant(toDate),
  });
  if (!analysis) notFound();

  const repositories = listRepositories(db);
  const { repo, authors, setAuthors, merges, mailmapEntries, metrics, commitCount, filters } = analysis;
  const isFiltered = Boolean(filters.authorEmail || filters.from || filters.to);

  const contributions = new Map(metrics.totals.authors.map((a) => [`${a.name} <${a.email}>`, a]));

  const directories = [...metrics.directories]
    .filter((d) => d.path !== "/" && pathMatches(d.path, pathFilter))
    .sort((a, b) => a.path.localeCompare(b.path));
  const files = [...metrics.files]
    .filter((f) => pathMatches(f.path, pathFilter))
    .sort((a, b) => b.churn - a.churn || a.path.localeCompare(b.path));

  // F08: a path filter that names a single file or directory focuses its metrics.
  const focused =
    pathFilter === ""
      ? null
      : (metrics.files.find((f) => f.path === pathFilter) ??
        metrics.directories.find((d) => d.path !== "/" && d.path === pathFilter) ??
        null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{repo.name}</h1>
            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs uppercase text-zinc-600">{repo.source_type}</span>
          </div>
          <p className="mt-1 break-all text-sm text-zinc-500">{repo.source}</p>
          <p className="mt-1 text-xs text-zinc-400">Ingested {repo.created_at} UTC</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link href="/" className="text-sm text-zinc-600 hover:underline">
            ← All repositories
          </Link>
          <DeleteRepoButton repoId={repo.id} />
        </div>
      </div>

      <nav className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Repository</span>
        {repositories.map((entry) => (
          <Link
            key={entry.id}
            href={`/repos/${entry.id}`}
            className={
              entry.id === repo.id
                ? "rounded-full bg-zinc-900 px-3 py-1 font-medium text-white"
                : "rounded-full border border-zinc-300 bg-white px-3 py-1 text-zinc-700 hover:border-zinc-400"
            }
          >
            {entry.name}
          </Link>
        ))}
      </nav>

      <form
        method="get"
        action={`/repos/${repo.id}`}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
      >
        <label className="flex flex-col text-xs font-medium text-zinc-500">
          Author
          <select name="author" defaultValue={authorEmail ?? ""} className={inputClass}>
            <option value="">All authors</option>
            {authors.map((author) => (
              <option key={`${author.name} <${author.email}>`} value={author.email}>
                {author.name} &lt;{author.email}&gt;
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs font-medium text-zinc-500">
          From date (UTC)
          <input type="date" name="from" defaultValue={fromDate ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col text-xs font-medium text-zinc-500">
          To date (UTC, inclusive)
          <input type="date" name="to" defaultValue={toDate ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col text-xs font-medium text-zinc-500">
          File or directory
          <input type="text" name="path" defaultValue={pathFilter} placeholder="e.g. src/lib" className={inputClass} />
        </label>
        <button type="submit" className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
          Apply filters
        </button>
        <Link href={`/repos/${repo.id}`} className="text-sm text-zinc-600 hover:underline">
          Clear
        </Link>
      </form>

      {isFiltered ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Commit set: {filters.authorEmail ? `author ${filters.authorEmail}` : "all authors"}
          {fromDate ? `, from ${fromDate}` : ""}
          {toDate ? `, to ${toDate} (inclusive)` : ""} — {number.format(metrics.commitCount)} of{" "}
          {number.format(commitCount)} commits. Every metric below is computed on this commit set.
        </p>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Repository metrics</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Commits" value={metrics.commitCount} />
          <MetricCard label="Added" value={metrics.totals.added} />
          <MetricCard label="Removed" value={metrics.totals.removed} />
          <MetricCard label="Growth" value={metrics.totals.growth} />
          <MetricCard label="Churn" value={metrics.totals.churn} />
          <MetricCard label="Modifications" value={metrics.totals.modifications} />
          <MetricCard label="Modification frequency" value={metrics.totals.modificationFrequency} />
          <MetricCard label="Churn rate" value={metrics.totals.churnRate} />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {isFiltered
            ? "Metrics for the filtered commit set above (merge commits excluded; committer date; the initial commit is measured against an empty tree)."
            : "Whole history of HEAD, excluding merge commits; committer date; the initial commit is measured against an empty tree."}{" "}
          Growth = added − removed, churn = added + removed. A modification is a commit that changed the object;
          modification frequency and churn rate divide modifications and churn by the number of commits. Binary files
          are not measured.
        </p>
      </section>

      {pathFilter !== "" ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            File / directory filter: <span className="font-mono text-base">{pathFilter}</span>
          </h2>
          {focused ? (
            <>
              <p className="text-xs text-zinc-500">
                Metrics for this object over the selected commit set; the tables below list every path inside it.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard label="Added" value={focused.added} />
                <MetricCard label="Removed" value={focused.removed} />
                <MetricCard label="Growth" value={focused.growth} />
                <MetricCard label="Churn" value={focused.churn} />
                <MetricCard label="Modifications" value={focused.modifications} />
                <MetricCard label="Modification frequency" value={focused.modificationFrequency} />
                <MetricCard label="Churn rate" value={focused.churnRate} />
              </div>
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500">
              No object is named exactly <span className="font-mono">{pathFilter}</span> — the tables below show every
              path inside it.
            </p>
          )}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Authors {isFiltered ? <span className="text-sm font-normal text-zinc-500">(in the commit set)</span> : null}
        </h2>
        <div className="rounded-lg border border-zinc-200 bg-white">
          {setAuthors.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">
              {isFiltered ? "No commits match the filters." : "No commits found."}
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Author</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 text-right font-medium">Commits</th>
                  <th className="px-4 py-2 text-right font-medium">Churn</th>
                  <th className="px-4 py-2 text-right font-medium">Ownership</th>
                  <th className="px-4 py-2 font-medium">Merged identities</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {setAuthors.map((author) => {
                  const contribution = contributions.get(`${author.name} <${author.email}>`);
                  return (
                    <tr key={`${author.name} <${author.email}>`} className="hover:bg-zinc-50">
                      <td className="px-4 py-2">{author.name}</td>
                      <td className="break-all px-4 py-2 font-mono text-xs">{author.email}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{number.format(author.commits)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {contribution ? number.format(contribution.churn) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {contribution ? percent.format(contribution.ownership) : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-zinc-500">
                        {author.aliases.length === 0 ? "—" : author.aliases.join(", ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          Ownership is each author&apos;s share of this repository&apos;s churn.{" "}
          {mailmapEntries === 0
            ? "No .mailmap was found in this repository."
            : `${number.format(mailmapEntries)} identit${mailmapEntries === 1 ? "y" : "ies"} folded automatically from the repository's .mailmap.`}
        </p>
        <MergesPanel repoId={repo.id} authors={authors} merges={merges} />
      </section>

      <section className="grid items-start gap-4 lg:grid-cols-2">
        <MetricsTable title="Directories" firstHeader="Directory" rows={directories} />
        <MetricsTable title="Files" firstHeader="File" rows={files} />
      </section>
    </div>
  );
}
