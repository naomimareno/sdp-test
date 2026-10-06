"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteRepoButton({ repoId }: { repoId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (!window.confirm("Delete this repository, its stored clone and its author merges?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/repos/${repoId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Could not delete the repository.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="rounded border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
