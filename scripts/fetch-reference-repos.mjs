#!/usr/bin/env node
/**
 * Fetch the lecturer's reference repositories at the exact commits behind the
 * reference metrics, into data/ref-repos/ (gitignored).
 *
 * Reference CSVs are expected in ~/Downloads/repo-references (override with
 * RAT_REFERENCE_DIR). tests/reference.test.mjs validates the metric engine
 * against them whenever both the CSVs and these clones are present.
 *
 * Usage: node scripts/fetch-reference-repos.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetDir = path.join(projectRoot, "data", "ref-repos");

const REFERENCE_REPOS = [
  { name: "cJSON", url: "https://github.com/DaveGamble/cJSON.git", sha: "6d9f2443ab071f86e5d9b43025a40929ec41c46c" },
  { name: "redis", url: "https://github.com/redis/redis.git", sha: "b540ca49cba815f3fbe634363c3df68d4f4f127a" },
  { name: "git", url: "https://github.com/git/git.git", sha: "5a7d1e8045ce66c908f62598e26cbb8df7b39a90" },
];

const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], env });
}

fs.mkdirSync(targetDir, { recursive: true });
for (const repo of REFERENCE_REPOS) {
  const dir = path.join(targetDir, repo.name);
  if (fs.existsSync(path.join(dir, ".git"))) {
    const current = git(["rev-parse", "HEAD"], dir).trim();
    if (current === repo.sha) {
      console.log(`${repo.name}: already at ${repo.sha.slice(0, 12)}`);
      continue;
    }
    console.log(`${repo.name}: checking out ${repo.sha.slice(0, 12)} (was ${current.slice(0, 12)})`);
    git(["checkout", "--detach", repo.sha], dir);
    continue;
  }
  console.log(`${repo.name}: cloning ${repo.url} ...`);
  // Full clone: rename detection needs blob contents for the whole history.
  execFileSync("git", ["clone", repo.url, dir], { stdio: "inherit", env });
  console.log(`${repo.name}: checking out ${repo.sha.slice(0, 12)}`);
  git(["checkout", "--detach", repo.sha], dir);
}
console.log(`\nReference clones ready in ${path.relative(projectRoot, targetDir)}/`);
