import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { deleteRepository, getDb, getRepository } from "@/lib/db";
import { reposDir } from "@/lib/paths";
import { dropRepoCache } from "@/lib/repos";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repoId = Number(id);
  if (!Number.isInteger(repoId) || repoId < 1) {
    return NextResponse.json({ error: "Invalid repository id." }, { status: 400 });
  }

  const db = getDb();
  const repo = getRepository(db, repoId);
  if (!repo) {
    return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  }

  dropRepoCache(repo.storage_path);
  deleteRepository(db, repoId); // cascades to author_merges
  fs.rmSync(path.join(reposDir(), String(repoId)), { recursive: true, force: true });

  return NextResponse.json({ ok: true });
}
