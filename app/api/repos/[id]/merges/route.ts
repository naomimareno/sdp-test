import { NextResponse } from "next/server";
import { addAuthorMerge, deleteAuthorMerge, getAuthorMerge, getDb, getRepository } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function resolveRepo(id: string) {
  const repoId = Number(id);
  if (!Number.isInteger(repoId) || repoId < 1) return { error: "Invalid repository id.", status: 400 as const };
  const repo = getRepository(getDb(), repoId);
  if (!repo) return { error: "Repository not found.", status: 404 as const };
  return { repoId };
}

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const resolved = await resolveRepo(id);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = await request.json();
  } catch {
    // fall through to the validation error below
  }
  const canonicalEmail =
    typeof body?.canonicalEmail === "string" ? body.canonicalEmail.trim().toLowerCase() : "";
  const mergedEmail = typeof body?.mergedEmail === "string" ? body.mergedEmail.trim().toLowerCase() : "";
  const canonicalName =
    typeof body?.canonicalName === "string" && body.canonicalName.trim() !== ""
      ? body.canonicalName.trim()
      : canonicalEmail;

  if (!canonicalEmail || !mergedEmail) {
    return NextResponse.json({ error: "Both the canonical and the merged email are required." }, { status: 400 });
  }

  try {
    const merge = addAuthorMerge(getDb(), resolved.repoId, { canonicalName, canonicalEmail, mergedEmail });
    return NextResponse.json({ merge }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "That merge is invalid: it duplicates an existing merge or merges an author into itself." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const resolved = await resolveRepo(id);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const mergeId = Number(new URL(request.url).searchParams.get("mergeId"));
  if (!Number.isInteger(mergeId) || mergeId < 1) {
    return NextResponse.json({ error: "A valid mergeId query parameter is required." }, { status: 400 });
  }

  const db = getDb();
  const merge = getAuthorMerge(db, mergeId);
  if (!merge || merge.repository_id !== resolved.repoId) {
    return NextResponse.json({ error: "Merge not found for this repository." }, { status: 404 });
  }

  deleteAuthorMerge(db, mergeId);
  return NextResponse.json({ ok: true });
}
