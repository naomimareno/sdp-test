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
