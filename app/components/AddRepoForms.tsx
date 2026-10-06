"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function AddRepoForms() {
  const router = useRouter();

  const [url, setUrl] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  async function addByUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUrlError(null);
    if (!url.trim()) {
      setUrlError("Enter a repository URL.");
      return;
    }
    setUrlBusy(true);
    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUrlError(typeof data.error === "string" ? data.error : "Could not ingest the repository.");
        return;
      }
      setUrl("");
      router.push(`/repos/${data.repository.id}`);
      router.refresh();
    } catch {
      setUrlError("Could not reach the server.");
    } finally {
      setUrlBusy(false);
    }
  }

  async function addByZip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setZipError(null);
    if (!file) {
      setZipError("Choose a .zip file first.");
      return;
    }
    setZipBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/repos/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setZipError(typeof data.error === "string" ? data.error : "Could not ingest the zip.");
        return;
      }
      setFile(null);
      router.push(`/repos/${data.repository.id}`);
      router.refresh();
    } catch {
      setZipError("Could not reach the server.");
    } finally {
      setZipBusy(false);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <form onSubmit={addByUrl} className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="font-medium">From a URL</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Deep-clones the full history (git clone --mirror). Works with any cloneable URL, including a local path.
        </p>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo.git"
          className="mt-3 w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
        <button
          type="submit"
          disabled={urlBusy}
          className="mt-3 rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {urlBusy ? "Cloning…" : "Add repository"}
        </button>
        {urlError ? <p className="mt-2 text-sm text-red-600">{urlError}</p> : null}
      </form>

      <form onSubmit={addByZip} className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="font-medium">From a zip</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Upload a zip that contains the repository&apos;s .git directory. The upload is deleted after extraction.
        </p>
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-3 block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-zinc-200"
        />
        <button
          type="submit"
          disabled={zipBusy}
          className="mt-3 rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {zipBusy ? "Uploading…" : "Upload zip"}
        </button>
        {zipError ? <p className="mt-2 text-sm text-red-600">{zipError}</p> : null}
      </form>
    </div>
  );
}
