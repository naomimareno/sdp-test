import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { buildSimpleRepo, makeScratchDir, writeFile } from "./helpers.mjs";
import { ingestFromUrl, ingestFromZip, safeZipJoin } from "../lib/ingest.js";
import { listRepositories, openDb } from "../lib/db.js";
import { parseLog } from "../lib/git.js";

const scratch = makeScratchDir();
process.env.RAT_DATA_DIR = path.join(scratch, "data");
const db = openDb(path.join(scratch, "test.db"));
const sourceRepo = buildSimpleRepo(path.join(scratch, "source-repo"));

after(() => fs.rmSync(scratch, { recursive: true, force: true }));

test("ingestFromUrl deep-clones into a bare mirror store and reads history", async () => {
  const repo = await ingestFromUrl(db, sourceRepo);
  assert.equal(repo.source_type, "url");
  assert.ok(fs.existsSync(path.join(repo.storage_path, "HEAD")), "bare mirror has a HEAD file");
  const commits = await parseLog(repo.storage_path);
  assert.equal(commits.length, 2);
  assert.equal(commits[0].authorEmail, "bob@example.com");
});

test("ingestFromZip extracts a repo containing .git and cleans up the upload", async () => {
  const zipPath = path.join(scratch, "upload.zip");
  const zip = new AdmZip();
  zip.addLocalFolder(sourceRepo);
  zip.writeZip(zipPath);

  const repo = await ingestFromZip(db, zipPath, "upload.zip");
  assert.equal(repo.source_type, "zip");
  assert.ok(fs.existsSync(path.join(repo.storage_path, ".git")), "extracted repo keeps its .git");
  assert.equal(fs.existsSync(zipPath), false, "temporary upload zip is deleted");
  const commits = await parseLog(repo.storage_path);
  assert.equal(commits.length, 2);
});

test("a zip without a git repository is rejected and leaves no rows behind", async () => {
  const dir = path.join(scratch, "no-git");
  writeFile(dir, "plain.txt", "nothing to see\n");
  const zipPath = path.join(scratch, "no-git.zip");
  const zip = new AdmZip();
  zip.addLocalFolder(dir);
  zip.writeZip(zipPath);

  const before = listRepositories(db).length;
  await assert.rejects(() => ingestFromZip(db, zipPath, "no-git.zip"), /does not contain a git repository/i);
  assert.equal(listRepositories(db).length, before);
});

test("safeZipJoin rejects absolute paths and path traversal", () => {
  assert.throws(() => safeZipJoin("/tmp/target", "/etc/passwd"), /absolute path/i);
  assert.throws(() => safeZipJoin("/tmp/target", "../escape.txt"), /escapes/i);
  assert.throws(() => safeZipJoin("/tmp/target", "a/../../escape.txt"), /escapes/i);
});
