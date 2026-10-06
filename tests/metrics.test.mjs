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
import { expandRenamePath, expandRenamePaths } from "../lib/git.js";
import { computeMetrics } from "../lib/metrics.js";
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
  expectMetrics(analysis.metrics.totals, {
    added: 18,
    removed: 3,
    growth: 15,
    churn: 21,
    modifications: 7,
    modificationFrequency: 1,
    churnRate: 3,
  });

  const authors = new Map(analysis.authors.map((a) => [a.email, a]));
  assert.equal(authors.get("alice@example.com").commits, 3);
  assert.equal(authors.get("bob@example.com").commits, 3);
  assert.equal(authors.get("carol@example.com").commits, 1);
});

test("derived metrics: modifications, frequency, churn rate and ownership are exact", async () => {
  const fixture = buildMetricsFixture(path.join(scratch, "derived-fixture"));
  const repo = await ingestFromUrl(db, fixture);
  const analysis = await getRepoAnalysis(db, repo.id);

  const files = byPath(analysis.metrics.files);
  expectMetrics(files.get("src/app.ts"), {
    modifications: 3,
    modificationFrequency: 3 / 7,
    churnRate: 9 / 7,
  });
  expectMetrics(files.get("README.md"), { modifications: 2, modificationFrequency: 2 / 7, churnRate: 4 / 7 });
  expectMetrics(files.get("src/lib/util.ts"), { modifications: 1, modificationFrequency: 1 / 7, churnRate: 1 / 7 });

  const dirs = byPath(analysis.metrics.directories);
  expectMetrics(dirs.get("src"), { modifications: 6, modificationFrequency: 6 / 7, churnRate: 17 / 7 });
  expectMetrics(dirs.get("src/lib"), { modifications: 3 });
  expectMetrics(dirs.get("/"), { modifications: 7, modificationFrequency: 1, churnRate: 3 });

  // repository author contributions, including ownership
  const repoAuthors = new Map(analysis.metrics.totals.authors.map((a) => [a.email, a]));
  assert.equal(repoAuthors.size, 3, "authors without churn are omitted");
  const alice = repoAuthors.get("alice@example.com");
  expectMetrics(alice, { added: 11, removed: 2, growth: 9, churn: 13, modifications: 3 });
  assert.equal(alice.ownership, 13 / 21);
  const bob = repoAuthors.get("bob@example.com");
  expectMetrics(bob, { added: 6, removed: 1, growth: 5, churn: 7, modifications: 3 });
  assert.equal(bob.ownership, 7 / 21);
  const carol = repoAuthors.get("carol@example.com");
  expectMetrics(carol, { added: 1, removed: 0, churn: 1, modifications: 1 });
  assert.equal(carol.ownership, 1 / 21);

  // per-file author contributions
  const appAuthors = new Map(files.get("src/app.ts").authors.map((a) => [a.email, a]));
  expectMetrics(appAuthors.get("alice@example.com"), { added: 5, removed: 0, churn: 5, modifications: 1 });
  expectMetrics(appAuthors.get("bob@example.com"), { added: 2, removed: 1, churn: 3, modifications: 1 });
  expectMetrics(appAuthors.get("carol@example.com"), { added: 1, removed: 0, churn: 1, modifications: 1 });
  assert.equal(appAuthors.get("alice@example.com").ownership, 5 / 9);
});

test("rename path expansion handles plain and brace-compressed forms", () => {
  assert.equal(expandRenamePath("tools/x.txt => vendor/x.txt"), "vendor/x.txt");
  assert.equal(expandRenamePath("{tools => vendor}/x.txt"), "vendor/x.txt");
  assert.equal(expandRenamePath("src/{lib => }/util.js"), "src/util.js");
  assert.equal(expandRenamePath("src/{ => lib}/util.js"), "src/lib/util.js");
  assert.equal(expandRenamePath("{lib => }/util.js"), "util.js");
  assert.equal(expandRenamePath("plain/path.js"), "plain/path.js");

  assert.deepEqual(expandRenamePaths("tools/x.txt => vendor/x.txt"), {
    oldPath: "tools/x.txt",
    path: "vendor/x.txt",
  });
  assert.deepEqual(expandRenamePaths("src/{lib => }/util.js"), { oldPath: "src/lib/util.js", path: "src/util.js" });
  assert.deepEqual(expandRenamePaths("src/{ => lib}/util.js"), { oldPath: "src/util.js", path: "src/lib/util.js" });
  assert.deepEqual(expandRenamePaths("Documentation/{RelNotes-1.5.5.6.txt => RelNotes/1.5.5.6.txt}"), {
    oldPath: "Documentation/RelNotes-1.5.5.6.txt",
    path: "Documentation/RelNotes/1.5.5.6.txt",
  });
  assert.deepEqual(expandRenamePaths("plain/path.js"), { path: "plain/path.js" });
});

test("rename sources stay file objects even with no other log history", () => {
  // Shape of a git.git case: a file introduced by a merge commit has no
  // creation line in the (merge-free) log stream, so its only appearance is
  // as a rename source. The reference metrics keep an all-zero row for it.
  const metrics = computeMetrics([
    {
      hash: "a".repeat(40),
      authorName: "Alice",
      authorEmail: "alice@example.com",
      files: [{ path: "vendor/x.txt", renameFrom: "tools/x.txt", added: 0, deleted: 0 }],
    },
  ]);

  const files = byPath(metrics.files);
  assert.equal(files.size, 2, "both the rename source and target are file objects");
  expectMetrics(files.get("tools/x.txt"), { added: 0, removed: 0, growth: 0, churn: 0, modifications: 0 });
  expectMetrics(files.get("vendor/x.txt"), { added: 0, removed: 0, growth: 0, churn: 0, modifications: 0 });
  assert.equal(metrics.totals.modifications, 0, "a pure rename counts as no modification");
  assert.deepEqual(files.get("tools/x.txt").authors, []);
});

test("a pure rename does not change metrics", async () => {
  const fixture = buildRenameFixture(path.join(scratch, "rename-fixture"));
  const repo = await ingestFromUrl(db, fixture);
  const analysis = await getRepoAnalysis(db, repo.id);

  assert.equal(analysis.metrics.commitCount, 2);
  expectMetrics(analysis.metrics.totals, {
    added: 4,
    removed: 0,
    growth: 4,
    churn: 4,
    modifications: 1,
    modificationFrequency: 1 / 2,
    churnRate: 2,
  });

  const files = byPath(analysis.metrics.files);
  expectMetrics(files.get("tools/x.txt"), { added: 4, removed: 0, growth: 4, churn: 4, modifications: 1 });
  const renamed = files.get("vendor/x.txt");
  assert.ok(renamed, "the pure-rename target is still an object");
  expectMetrics(renamed, { added: 0, removed: 0, growth: 0, churn: 0, modifications: 0 });
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
  assert.equal(merged.metrics.totals.authors.length, 1, "author metrics follow the manual merge");
  assert.equal(merged.metrics.totals.authors[0].ownership, 1);
});
