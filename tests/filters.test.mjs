import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathMatches, selectCommits } from "../lib/filters.js";
import { getRepoAnalysis } from "../lib/repos.js";
import { ingestFromUrl } from "../lib/ingest.js";
import { listRepositories, openDb } from "../lib/db.js";
import { buildDatedFixture, buildSimpleRepo, makeScratchDir } from "./helpers.mjs";

const scratch = makeScratchDir();
process.env.RAT_DATA_DIR = path.join(scratch, "data");
const db = openDb(path.join(scratch, "test.db"));

after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const commits = [
  { hash: "1", authorName: "Alice", authorEmail: "alice@example.com", committerDate: "2020-06-15T12:00:00+02:00", files: [] },
  { hash: "2", authorName: "Bob", authorEmail: "bob@example.com", committerDate: "2021-06-15T12:00:00-05:00", files: [] },
  { hash: "3", authorName: "Carol", authorEmail: "carol@example.com", committerDate: "2022-06-15T12:00:00Z", files: [] },
];
const identities = new Map([
  ["1", { name: "Alice", email: "alice@example.com" }],
  ["2", { name: "Bob", email: "bob@example.com" }],
  ["3", { name: "Carol", email: "carol@example.com" }],
]);
const hashes = (list) => list.map((c) => c.hash);

test("selectCommits narrows by author, by date window and by both", () => {
  assert.equal(selectCommits(commits, identities, {}).length, 3, "no filters selects everything");
  assert.deepEqual(hashes(selectCommits(commits, identities, { authorEmail: "bob@example.com" })), ["2"]);

  // The author filter matches the resolved identity and ignores case: commit 2
  // is Bob on the wire but a .mailmap merge resolves it to Alice.
  const merged = new Map([
    ["1", { name: "Alice", email: "alice@example.com" }],
    ["2", { name: "Alice", email: "alice@example.com" }],
    ["3", { name: "Carol", email: "carol@example.com" }],
  ]);
  assert.deepEqual(hashes(selectCommits(commits, merged, { authorEmail: "ALICE@example.com" })), ["1", "2"]);

  // from is inclusive, to is exclusive.
  assert.deepEqual(
    hashes(selectCommits(commits, identities, { from: "2021-06-15T00:00:00Z", to: "2022-01-01T00:00:00Z" })),
    ["2"]
  );
  assert.deepEqual(hashes(selectCommits(commits, identities, { from: "2022-01-01T00:00:00Z" })), ["3"]);
  assert.deepEqual(
    hashes(selectCommits(commits, identities, { to: "2020-06-15T10:00:00Z" })),
    [],
    "a commit exactly at the to bound is excluded (commit 1 is 12:00+02:00 = 10:00Z)"
  );

  // Combination: author + period.
  assert.deepEqual(
    hashes(selectCommits(commits, identities, { authorEmail: "carol@example.com", from: "2022-01-01T00:00:00Z" })),
    ["3"]
  );
  assert.deepEqual(hashes(selectCommits(commits, identities, { authorEmail: "bob@example.com", from: "2022-01-01T00:00:00Z" })), []);

  // Unparseable dates are ignored instead of crashing.
  assert.equal(selectCommits(commits, identities, { from: "not-a-date", to: "" }).length, 3);
});

test("pathMatches selects a file or a whole subtree, segment by segment", () => {
  assert.equal(pathMatches("src/app.ts", ""), true, "an empty filter matches everything");
  assert.equal(pathMatches("src", "src"), true, "a directory matches itself");
  assert.equal(pathMatches("src/app.ts", "src"), true);
  assert.equal(pathMatches("src/lib/util.js", "src"), true);
  assert.equal(pathMatches("src/app.ts", "src/"), true, "a trailing slash is ignored");
  assert.equal(pathMatches("src/app.ts", "src/app.ts"), true, "an exact file path matches");
  assert.equal(pathMatches("src2/file.js", "src"), false, "prefix matching is per path segment");
  assert.equal(pathMatches("src-app/file.js", "src"), false);
  assert.equal(pathMatches("README.md", "src"), false);
  assert.equal(pathMatches("Src/app.ts", "src"), false, "paths are case-sensitive, like git");
});

test("author filter produces that author's exact contribution metrics", async () => {
  const fixture = buildDatedFixture(path.join(scratch, "dated-fixture"));
  const repo = await ingestFromUrl(db, fixture);

  const all = await getRepoAnalysis(db, repo.id);
  assert.equal(all.commitCount, 3);
  assert.equal(all.metrics.commitCount, 3, "without filters the commit set is the full history");
  assert.equal(all.filters.authorEmail, null);

  const byBob = await getRepoAnalysis(db, repo.id, { authorEmail: "bob@example.com" });
  assert.equal(byBob.metrics.commitCount, 1);
  assert.deepEqual(byBob.metrics.files.map((f) => f.path), ["b.txt"], "only Bob's file is measured");
  assert.equal(byBob.metrics.totals.churn, 1);
  assert.equal(byBob.metrics.totals.modifications, 1);
  assert.equal(byBob.setAuthors.length, 1);
  assert.equal(byBob.setAuthors[0].email, "bob@example.com");
  assert.equal(byBob.authors.length, 3, "the selector still lists every author of the repository");
});

test("date-window filter narrows the commit set; empty windows stay consistent", async () => {
  const fixture = buildDatedFixture(path.join(scratch, "dated-window-fixture"));
  const repo = await ingestFromUrl(db, fixture);

  const in2021 = await getRepoAnalysis(db, repo.id, { from: "2021-01-01T00:00:00Z", to: "2022-01-01T00:00:00Z" });
  assert.equal(in2021.metrics.commitCount, 1);
  assert.deepEqual(in2021.metrics.files.map((f) => f.path), ["b.txt"]);
  assert.equal(in2021.metrics.totals.modifications, 1);

  const combined = await getRepoAnalysis(db, repo.id, {
    authorEmail: "alice@example.com",
    from: "2021-01-01T00:00:00Z",
  });
  assert.equal(combined.metrics.commitCount, 0, "author and period apply together");

  const empty = await getRepoAnalysis(db, repo.id, { from: "2030-01-01T00:00:00Z" });
  assert.equal(empty.metrics.commitCount, 0);
  assert.equal(empty.metrics.totals.churn, 0);
  assert.equal(empty.metrics.totals.churnRate, 0, "no division by zero on an empty commit set");
  assert.deepEqual(empty.metrics.files, []);
});

test("manual commit list (F10) keeps exactly the picked hashes and combines with other filters", () => {
  assert.deepEqual(hashes(selectCommits(commits, identities, { commits: ["1", "3"] })), ["1", "3"]);
  assert.deepEqual(hashes(selectCommits(commits, identities, { commits: ["2"] })), ["2"]);
  assert.deepEqual(
    hashes(selectCommits(commits, identities, { commits: [] })),
    ["1", "2", "3"],
    "an empty pick list keeps the whole history"
  );
  assert.deepEqual(
    hashes(selectCommits(commits, identities, { commits: ["2"], authorEmail: "bob@example.com" })),
    ["2"],
    "pick list and author filter AND together"
  );
  assert.deepEqual(
    hashes(selectCommits(commits, identities, { commits: ["3"], authorEmail: "bob@example.com" })),
    [],
    "a pick that contradicts the author filter selects nothing"
  );
  assert.deepEqual(
    hashes(selectCommits(commits, identities, { commits: ["1"], from: "2022-01-01T00:00:00Z" })),
    [],
    "a pick outside the date window selects nothing"
  );
});

test("manual commit selection drives the commit set over a real repository (F10)", async () => {
  const fixture = buildDatedFixture(path.join(scratch, "dated-pick-fixture"));
  const repo = await ingestFromUrl(db, fixture);

  const all = await getRepoAnalysis(db, repo.id);
  assert.equal(all.commits.length, 3, "the analysis exposes every commit for the picker");
  const bobCommit = all.commits.find((c) => c.email === "bob@example.com");
  assert.ok(bobCommit && bobCommit.hash && bobCommit.date, "picker entries carry hash, date and resolved identity");

  const picked = await getRepoAnalysis(db, repo.id, { commits: [bobCommit.hash] });
  assert.equal(picked.metrics.commitCount, 1);
  assert.deepEqual(picked.metrics.files.map((f) => f.path), ["b.txt"], "only the picked commit is measured");
  assert.deepEqual(picked.filters.commits, [bobCommit.hash]);

  const none = await getRepoAnalysis(db, repo.id, {
    commits: [bobCommit.hash],
    authorEmail: "alice@example.com",
  });
  assert.equal(none.metrics.commitCount, 0, "the pick list combines with the other filters");
});

test("repository selection yields each repository's own metrics", async () => {
  const first = await ingestFromUrl(db, buildSimpleRepo(path.join(scratch, "repo-one")));
  const second = await ingestFromUrl(db, buildDatedFixture(path.join(scratch, "repo-two")));

  const listed = listRepositories(db).map((r) => r.id);
  assert.ok(listed.includes(first.id) && listed.includes(second.id), "both repositories are available for selection");

  const one = await getRepoAnalysis(db, first.id);
  const two = await getRepoAnalysis(db, second.id);
  assert.equal(one.metrics.commitCount, 2);
  assert.equal(two.metrics.commitCount, 3);
  assert.notEqual(one.repo.name, two.repo.name);
});
