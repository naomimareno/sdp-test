import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ingestFromZip } from "@/lib/ingest";
import { ensureDir, workDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form with a zip file." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a non-empty .zip file to upload." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return NextResponse.json({ error: "Only .zip uploads are supported." }, { status: 400 });
  }

  const tempName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${path.basename(file.name)}`;
  const zipPath = path.join(ensureDir(path.join(workDir(), "uploads")), tempName);

  try {
    fs.writeFileSync(zipPath, Buffer.from(await file.arrayBuffer()));
    const repository = await ingestFromZip(getDb(), zipPath, file.name);
    return NextResponse.json({ repository }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not ingest the zip." },
      { status: 400 }
    );
  } finally {
    // ingestFromZip removes its copy of the upload; make sure it is gone either way.
    fs.rmSync(zipPath, { force: true });
  }
}
