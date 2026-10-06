import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, accessSync, constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("package.json exposes dev, build and test scripts", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const script of ["dev", "build", "test"]) {
    assert.ok(pkg.scripts && pkg.scripts[script], `missing npm script: ${script}`);
  }
});

test("npm scripts run directly on the system Node", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts.dev, "next dev");
  assert.equal(pkg.scripts.build, "next build");
  assert.equal(pkg.scripts.start, "next start");
  assert.match(pkg.scripts.test, /^node --test\b/, "tests run with the system Node test runner");
});

test("package.json allows the university Node 18 runtime", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.ok(pkg.engines && pkg.engines.node, "engines.node documents the supported Node range");
  assert.equal(pkg.engines.node, ">=18.18");
});

test("README.md starts with \"How to run\"", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.match(readme, /^# How to run/);
});

test("start.sh exists and is executable", () => {
  accessSync(join(root, "start.sh"), constants.X_OK);
});

test(".gitignore covers node_modules, .env and database files", () => {
  const ignore = readFileSync(join(root, ".gitignore"), "utf8");
  for (const pattern of ["node_modules", ".env", "*.db"]) {
    assert.ok(ignore.includes(pattern), `missing ignore pattern: ${pattern}`);
  }
});
