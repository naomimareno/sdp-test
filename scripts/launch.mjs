#!/usr/bin/env node
/**
 * Project command launcher that guarantees a supported Node.js version.
 *
 * Next.js 16 requires Node >= 20.9, and the data layer stores its data with
 * the built-in `node:sqlite` module (Node >= 22.5). When the system Node is
 * older than what a command needs, this script re-executes itself through
 * `npx node@22`, so `npm run dev` / `npm run build` / `npm test` keep working
 * on older Node installations (the first fallback run may download Node 22).
 *
 * Usage: node scripts/launch.mjs <next-dev|next-build|next-start|test> [args...]
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const [mode, ...rest] = process.argv.slice(2);

const requirements = {
  "next-dev": { major: 20, minor: 9, why: "Next.js 16" },
  "next-build": { major: 20, minor: 9, why: "Next.js 16" },
  "next-start": { major: 20, minor: 9, why: "Next.js 16" },
  test: { major: 22, minor: 5, why: "the node:sqlite test harness" },
};

const requirement = requirements[mode];
if (!requirement) {
  console.error(`unknown launcher mode: ${mode}`);
  process.exit(2);
}

function supported() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  return (
    major > requirement.major ||
    (major === requirement.major && minor >= requirement.minor)
  );
}

if (!supported()) {
  console.error(
    `This system runs Node ${process.version}, but ${requirement.why} needs ` +
      `>= ${requirement.major}.${requirement.minor}. Re-running with Node 22 ` +
      "via npx (the first run may download it once)..."
  );
  const rerun = spawnSync(
    "npx",
    ["--yes", "node@22", fileURLToPath(import.meta.url), mode, ...rest],
    { stdio: "inherit" }
  );
  process.exit(rerun.status ?? 1);
}

const require = createRequire(import.meta.url);

if (mode === "test") {
  const run = spawnSync(
    process.execPath,
    ["--test", "tests/**/*.test.mjs", ...rest],
    { stdio: "inherit" }
  );
  process.exit(run.status ?? 1);
}

const nextBin = require.resolve("next/dist/bin/next");
const subcommand = { "next-dev": "dev", "next-build": "build", "next-start": "start" }[mode];
const run = spawnSync(process.execPath, [nextBin, subcommand, ...rest], {
  stdio: "inherit",
});
process.exit(run.status ?? 1);
