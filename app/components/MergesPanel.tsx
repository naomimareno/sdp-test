"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export type AuthorSummary = { name: string; email: string; commits: number; aliases: string[] };
export type MergeRecord = {
  id: number;
  canonical_name: string;
  canonical_email: string;
  merged_email: string;
};

export default function MergesPanel({
  repoId,
  authors,
  merges,
}: {
  repoId: number;
  authors: AuthorSummary[];
  merges: MergeRecord[];
}) {
  const router = useRouter();
  const [canonicalEmail, setCanonicalEmail] = useState(authors[0]?.email ?? "");
  const [mergedEmail, setMergedEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = authors.filter((a) => a.email !== canonicalEmail);

  async function addMerge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!canonicalEmail || !mergedEmail) {
      setError("Pick the author to merge and the author to keep.");
      return;
    }
    setBusy(true);
    try {
      const canonicalName = authors.find((a) => a.email === canonicalEmail)?.name ?? canonicalEmail;
      const res = await fetch(`/api/repos/${repoId}/merges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canonicalName, canonicalEmail, mergedEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not add the merge.");
        return;
      }
      setMergedEmail("");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMerge(id: number) {
    setError(null);
    try {
      const res = await fetch(`/api/repos/${repoId}/merges?mergeId=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Could not remove the merge.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <h2 className="border-b border-zinc-200 px-4 py-2 font-semibold">Manual author merges</h2>
      <div className="space-y-4 p-4">
        <p className="text-xs text-zinc-500">
          Merges apply per repository and stack on top of the repository&apos;s .mailmap. Merged identities disappear from
          the author table above and their commits count towards the canonical author.
        </p>

        {merges.length === 0 ? (
          <p className="text-sm text-zinc-500">No manual merges yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded border border-zinc-200">
            {merges.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="break-all">
                  <span className="text-zinc-700">{m.merged_email}</span>
                  <span className="mx-2 text-zinc-400">→</span>
                  <span className="font-medium">{m.canonical_name}</span>{" "}
                  <span className="text-zinc-500">&lt;{m.canonical_email}&gt;</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeMerge(m.id)}
                  className="shrink-0 rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {authors.length < 2 ? (
          <p className="text-sm text-zinc-500">At least two distinct authors are needed to create a merge.</p>
        ) : (
          <form onSubmit={addMerge} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-600">
              Merge this author
              <select
                value={mergedEmail}
                onChange={(e) => setMergedEmail(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
              >
                <option value="">Select an author…</option>
                {candidates.map((a) => (
                  <option key={a.email} value={a.email}>
                    {a.name} &lt;{a.email}&gt; ({a.commits} commits)
                  </option>
                ))}
              </select>
            </label>
            <span className="pb-1.5 text-zinc-400">into</span>
            <label className="flex flex-col gap-1 text-xs text-zinc-600">
              Keep this identity
              <select
                value={canonicalEmail}
                onChange={(e) => {
                  setCanonicalEmail(e.target.value);
                  if (mergedEmail === e.target.value) setMergedEmail("");
                }}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
              >
                {authors.map((a) => (
                  <option key={a.email} value={a.email}>
                    {a.name} &lt;{a.email}&gt;
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {busy ? "Merging…" : "Merge authors"}
            </button>
          </form>
        )}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}
