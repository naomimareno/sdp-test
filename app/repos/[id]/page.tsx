import Link from "next/link";
import { notFound } from "next/navigation";
import DeleteRepoButton from "@/app/components/DeleteRepoButton";
import MergesPanel from "@/app/components/MergesPanel";
import { getDb } from "@/lib/db";
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

export default async function RepoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repoId = Number(id);
  if (!Number.isInteger(repoId) || repoId < 1) notFound();

  const analysis = await getRepoAnalysis(getDb(), repoId);
  if (!analysis) notFound();

  const { repo, authors, merges, mailmapEntries, metrics } = analysis;

  const contributions = new Map(metrics.totals.authors.map((a) => [`${a.name} <${a.email}>`, a]));

  const directories = [...metrics.directories]
    .filter((d) => d.path !== "/")
    .sort((a, b) => a.path.localeCompare(b.path));
  const files = [...metrics.files].sort((a, b) => b.churn - a.churn || a.path.localeCompare(b.path));

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
          Whole history of HEAD, excluding merge commits; committer date; the initial commit is measured against an
          empty tree. Growth = added − removed, churn = added + removed. A modification is a commit that changed the
          object; modification frequency and churn rate divide modifications and churn by the number of commits.
          Binary files are not measured.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Authors</h2>
        <div className="rounded-lg border border-zinc-200 bg-white">
          {authors.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">No commits found.</p>
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
                {authors.map((author) => {
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
