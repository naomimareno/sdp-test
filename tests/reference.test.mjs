/**
 * Validate the metric engine end-to-end against the lecturer's reference CSVs
 * (repo-references/<repo>_<sha>.csv) and clones of the reference repositories.
 *
 * The reference data is not committed, so these tests skip gracefully when it
 * is absent. To run them locally:
 *
 *   node scripts/fetch-reference-repos.mjs                          (clones into data/ref-repos)
 *   RAT_REFERENCE_DIR=~/Downloads/repo-references npm test          (default location)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveAuthors } from "../lib/authors.js";
import { parseLog, resolveMailmap } from "../lib/git.js";
import { computeMetrics } from "../lib/metrics.js";
import { projectRoot } from "./helpers.mjs";

const referenceDir = process.env.RAT_REFERENCE_DIR ?? path.join(os.homedir(), "Downloads", "repo-references");
const reposDir = process.env.RAT_REFERENCE_REPOS ?? path.join(projectRoot, "data", "ref-repos");

const CASES = ["cJSON", "redis", "git"];
const TOL = 1e-9;

/** RFC 4180-ish CSV line splitter (author names and paths contain commas/quotes). */
function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else cur += ch;
  }
  fields.push(cur);
  return fields;
}

const num = (value) => (value === "" || value === undefined ? null : Number(value));

/** @returns {{file: Map, directory: Map, repository: Map}} path -> {all, authors} */
function loadReference(csvPath) {
  const [headerLine, ...lines] = fs.readFileSync(csvPath, "utf8").trim().split("\n");
  const header = parseCsvLine(headerLine);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const objects = { file: new Map(), directory: new Map(), repository: new Map() };
  for (const line of lines) {
    const f = parseCsvLine(line);
    if (f.length !== header.length) continue;
    const row = {
      commitCount: num(f[idx.commit_count]),
      added: num(f[idx.added]),
      removed: num(f[idx.removed]),
      growth: num(f[idx.growth]),
      churn: num(f[idx.churn]),
      modifications: num(f[idx.modifications]),
      modificationFrequency: num(f[idx.modification_frequency]),
      churnRate: num(f[idx.churn_rate]),
      ownership: num(f[idx.ownership]),
    };
    const bucket = objects[f[idx.object_type]];
    let object = bucket.get(f[idx.path]);
    if (!object) {
      object = { all: null, authors: new Map() };
      bucket.set(f[idx.path], object);
    }
    if (f[idx.author] === "ALL") object.all = row;
    else object.authors.set(f[idx.author], row);
  }
  return objects;
}

const same = (a, b) => Math.abs(a - b) <= TOL;

const ALL_KEYS = ["added", "removed", "growth", "churn", "modifications", "modificationFrequency", "churnRate"];

function compareObject(problems, label, mine, refObject) {
  for (const key of ALL_KEYS) {
    const expected = refObject.all[key];
    if (expected === null) continue;
    if (!same(mine[key], expected)) problems.push(`${label}: ${key} mine=${mine[key]} ref=${expected}`);
  }
  const mineAuthors = new Map(mine.authors.map((a) => [`${a.name} <${a.email}>`, a]));
  if (mineAuthors.size !== refObject.authors.size) {
    problems.push(`${label}: author count mine=${mineAuthors.size} ref=${refObject.authors.size}`);
  }
  for (const [author, refRow] of refObject.authors) {
    const m = mineAuthors.get(author);
    if (!m) {
      problems.push(`${label}: missing author ${author}`);
      continue;
    }
    for (const key of ["added", "removed", "growth", "churn", "modifications"]) {
      if (!same(m[key], refRow[key])) problems.push(`${label} ${author}: ${key} mine=${m[key]} ref=${refRow[key]}`);
    }
    if (refRow.ownership !== null && !same(m.ownership, refRow.ownership)) {
      problems.push(`${label} ${author}: ownership mine=${m.ownership} ref=${refRow.ownership}`);
    }
  }
}

async function analyze(repoPath) {
  const commits = await parseLog(repoPath);
  const rawIdentities = [...new Set(commits.map((c) => `${c.authorName} <${c.authorEmail}>`))];
  const resolved = resolveMailmap(repoPath, rawIdentities);
  const { identityByHash } = resolveAuthors(commits, resolved, new Map());
  return computeMetrics(commits, identityByHash);
}

function findAllProblems(metrics, reference) {
  const problems = [];

  const repoRow = reference.repository.get("/");
  if (metrics.commitCount !== repoRow.all.commitCount) {
    problems.push(`commit count mine=${metrics.commitCount} ref=${repoRow.all.commitCount}`);
  }
  compareObject(problems, "repository", metrics.totals, repoRow);

  const myFiles = new Map(metrics.files.map((row) => [row.path, row]));
  const missingFiles = [...reference.file.keys()].filter((p) => !myFiles.has(p));
  const extraFiles = [...myFiles.keys()].filter((p) => !reference.file.has(p));
  if (missingFiles.length) problems.push(`file paths missing: ${missingFiles.length} (e.g. ${missingFiles.slice(0, 3).join(", ")})`);
  if (extraFiles.length) problems.push(`unexpected file paths: ${extraFiles.length} (e.g. ${extraFiles.slice(0, 3).join(", ")})`);
  for (const [p, refObject] of reference.file) {
    const mine = myFiles.get(p);
    if (mine) compareObject(problems, `file ${p}`, mine, refObject);
  }

  // The reference reports the root only as object_type=repository; our engine
  // also exposes it as the "/" directory (same values), so ignore it here.
  const myDirs = new Map(metrics.directories.filter((row) => row.path !== "/").map((row) => [row.path, row]));
  const missingDirs = [...reference.directory.keys()].filter((p) => !myDirs.has(p));
  const extraDirs = [...myDirs.keys()].filter((p) => !reference.directory.has(p));
  if (missingDirs.length) problems.push(`directory paths missing: ${missingDirs.length} (e.g. ${missingDirs.slice(0, 3).join(", ")})`);
  if (extraDirs.length) problems.push(`unexpected directory paths: ${extraDirs.length} (e.g. ${extraDirs.slice(0, 3).join(", ")})`);
  for (const [p, refObject] of reference.directory) {
    const mine = myDirs.get(p);
    if (mine) compareObject(problems, `directory ${p}`, mine, refObject);
  }
  return problems;
}

function findCsv(name) {
  if (!fs.existsSync(referenceDir)) return null;
  const found = fs.readdirSync(referenceDir).find((f) => f.startsWith(`${name}_`) && f.endsWith(".csv"));
  return found ? path.join(referenceDir, found) : null;
}

for (const name of CASES) {
  test(`reference metrics match the lecturer CSV exactly: ${name}`, async (t) => {
    const csvPath = findCsv(name);
    const repoPath = path.join(reposDir, name);
    if (!csvPath || !fs.existsSync(path.join(repoPath, ".git"))) {
      t.skip(`reference data not present; run \`node scripts/fetch-reference-repos.mjs\` and put the CSVs in ${referenceDir}`);
      return;
    }
    const metrics = await analyze(repoPath);
    const problems = findAllProblems(metrics, loadReference(csvPath));
    assert.deepEqual(problems, [], `${problems.length} mismatches:\n${problems.slice(0, 20).join("\n")}`);
  });
}
