import Link from "next/link";
import AddRepoForms from "./components/AddRepoForms";
import DeleteRepoButton from "./components/DeleteRepoButton";
import { getDb, listRepositories } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const repositories = listRepositories(getDb());

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">Repositories</h1>
          <span className="text-sm text-zinc-500">
            {repositories.length} {repositories.length === 1 ? "repository" : "repositories"}
          </span>
        </div>
        {repositories.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500">
            Nothing ingested yet. Add a repository below by URL (deep clone) or by uploading a zip that contains its
            .git directory.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {repositories.map((repo) => (
              <li key={repo.id} className="rounded-lg border border-zinc-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/repos/${repo.id}`} className="font-medium hover:underline">
                      {repo.name}
                    </Link>
                    <p className="mt-1 break-all text-xs text-zinc-500">{repo.source}</p>
                    <p className="mt-2 text-xs text-zinc-400">
                      {repo.source_type} · ingested {repo.created_at} UTC
                    </p>
                  </div>
                  <DeleteRepoButton repoId={repo.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Add a repository</h2>
        <AddRepoForms />
      </section>
    </div>
  );
}
