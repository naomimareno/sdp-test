import { NextResponse } from "next/server";
import { getDb, listRepositories } from "@/lib/db";
import { ingestFromUrl } from "@/lib/ingest";

export const dynamic = "force-dynamic";

export async function GET() {
  const repositories = listRepositories(getDb());
  return NextResponse.json({ repositories });
}

export async function POST(request: Request) {
  let url = "";
  try {
    const body = await request.json();
    if (typeof body?.url === "string") url = body.url.trim();
  } catch {
    // fall through to the validation error below
  }
  if (!url) {
    return NextResponse.json({ error: "A repository URL is required." }, { status: 400 });
  }

  try {
    const repository = await ingestFromUrl(getDb(), url);
    return NextResponse.json({ repository }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not ingest the repository." },
      { status: 400 }
    );
  }
}
