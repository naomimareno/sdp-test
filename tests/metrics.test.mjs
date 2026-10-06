import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import {
  buildMailmapFixture,
  buildMetricsFixture,
  buildRenameFixture,
  makeScratchDir,
} from "./helpers.mjs";
import { ingestFromUrl, ingestFromZip } from "../lib/ingest.js";
import { getRepoAnalysis } from "../lib/repos.js";
import { addAuthorMerge, openDb } from "../lib/db.js";

const scratch = makeScratchDir();
process.env.RAT_DATA_DIR = path.join(scratch, "data");
const db = openDb(path.join(scratch, "test.db"));

after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function byPath(rows) {
  return new Map(rows.map((r) => [r.path, r]));
}

function expectMetrics(row, expected) {
  assert.ok(row, `missing metrics row for ${JSON.stringify(expected)}`);
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(row[key], value, `${row.path} ${key}: expected ${value}, got ${row[key]}`);
  }
}

test("full-history metrics are exact (modify, rename, delete, binary, merge exclusion)", async () => {
  const fixture = buildMetricsFixture(path.join(scratch, "metrics-fixture"));
  const repo = await ingestFromUrl(db, fixture);
  const analysis = await getRepoAnalysis(db, repo.id);

  assert.equal(analysis.metrics.commitCount, 7, "merge commit must be excluded");

  const files = byPath(analysis.metrics.files);
  expectMetrics(files.get("src/app.ts"), { added: 8, removed: 1, growth: 7, churn: 9 });
  expectMetrics(files.get("src/util.ts"), { added: 3, removed: 0, growth: 3, churn: 3 });
  expectMetrics(files.get("src/lib/util.ts"), { added: 1, removed: 0, growth: 1, churn: 1 });
  expectMetrics(files.get("README.md"), { added: 2, removed: 2, growth: 0, churn: 4 });
  expectMetrics(files.get("src/lib/new.ts"), { added: 4, removed: 0, growth: 4, churn: 4 });

  assert.equal(files.has("assets/logo.bin"), false, "binary files are not measured");
  assert.ok([...files.keys()].every((p) => !p.includes(" => ")), "rename notation never leaks into rows");

  const dirs = byPath(analysis.metrics.directories);
  expectMetrics(dirs.get("/"), { added: 18, removed: 3, growth: 15, churn: 21 });
  expectMetrics(dirs.get("src"), { added: 16, removed: 1, growth: 15, churn: 17 });
  expectMetrics(dirs.get("src/lib"), { added: 5, removed: 0, growth: 5, churn: 5 });

  // repository metrics are the root directory metrics
  assert.deepEqual(analysis.metrics.totals, { added: 18, removed: 3, growth: 15, churn: 21 });

  const authors = new Map(analysis.authors.map((a) => [a.email, a]));
  assert.equal(authors.get("alice@example.com").commits, 3);
  assert.equal(authors.get("bob@example.com").commits, 3);
  assert.equal(authors.get("carol@example.com").commits, 1);
});

test("a pure rename does not change metrics", async () => {
  const fixture = buildRenameFixture(path.join(scratch, "rename-fixture"));
  const repo = await ingestFromUrl(db, fixture);
  const analysis = await getRepoAnalysis(db, repo.id);

  assert.equal(analysis.metrics.commitCount, 2);
  assert.deepEqual(analysis.metrics.totals, { added: 4, removed: 0, growth: 4, churn: 4 });

  const files = byPath(analysis.metrics.files);
  expectMetrics(files.get("tools/x.txt"), { added: 4, removed: 0, growth: 4, churn: 4 });
  const renamed = files.get("vendor/x.txt");
  if (renamed) expectMetrics(renamed, { added: 0, removed: 0, growth: 0, churn: 0 });
});

test(".mailmap merges authors automatically; manual merges apply on top", async () => {
  const fixture = buildMailmapFixture(path.join(scratch, "mailmap-fixture"));
  const zip = new AdmZip();
  zip.addLocalFolder(fixture, "repo"); // nested folder exercises git-root discovery
  const zipPath = path.join(scratch, "mailmap.zip");
  zip.writeZip(zipPath);

  const repo = await ingestFromZip(db, zipPath, "mailmap.zip");
  const analysis = await getRepoAnalysis(db, repo.id);

  assert.equal(analysis.mailmapEntries, 1);
  const authors = new Map(analysis.authors.map((a) => [a.email, a]));
  assert.equal(authors.size, 2, "Alice (incl. Carol via .mailmap) and Dave");
  assert.equal(authors.get("alice@example.com").commits, 3);
  assert.equal(authors.get("dave@example.com").commits, 1);
  assert.ok(
    authors.get("alice@example.com").aliases.some((a) => a.includes("carol@example.com")),
    "Carol's raw identity is listed as an alias of Alice"
  );

  addAuthorMerge(db, repo.id, {
    canonicalName: "Alice",
    canonicalEmail: "alice@example.com",
    mergedEmail: "dave@example.com",
  });
  const merged = await getRepoAnalysis(db, repo.id);
  assert.equal(merged.authors.length, 1);
  assert.equal(merged.authors[0].email, "alice@example.com");
  assert.equal(merged.authors[0].commits, 4);
});
