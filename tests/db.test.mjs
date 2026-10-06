import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeScratchDir } from "./helpers.mjs";
import {
  addAuthorMerge,
  deleteRepository,
  getAuthorMerge,
  getRepository,
  insertRepository,
  listAuthorMerges,
  listRepositories,
  openDb,
} from "../lib/db.js";

const scratch = makeScratchDir();
const dbFile = path.join(scratch, "test.db");

after(() => fs.rmSync(scratch, { recursive: true, force: true }));

test("schema creates repositories and author_merges tables", () => {
  const db = openDb(dbFile);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
  assert.ok(tables.includes("repositories"));
  assert.ok(tables.includes("author_merges"));
  db.close();
});

test("repository round-trip and source_type CHECK constraint", () => {
  const db = openDb(dbFile);
  const repo = insertRepository(db, { name: "demo", source_type: "url", source: "https://example.com/demo.git" });
  assert.equal(repo.name, "demo");
  assert.ok(repo.id >= 1);
  assert.equal(getRepository(db, repo.id).source, "https://example.com/demo.git");
  assert.equal(listRepositories(db).length, 1);

  assert.throws(
    () => insertRepository(db, { name: "bad", source_type: "ftp", source: "x" }),
    /constraint/i
  );
  db.close();
});

test("author merge UNIQUE and CHECK constraints", () => {
  const db = openDb(dbFile);
  const repo = listRepositories(db)[0];
  const merge = addAuthorMerge(db, repo.id, {
    canonicalName: "Alice",
    canonicalEmail: "alice@example.com",
    mergedEmail: "carol@example.com",
  });
  assert.equal(merge.merged_email, "carol@example.com");

  assert.throws(
    () =>
      addAuthorMerge(db, repo.id, {
        canonicalName: "Alice",
        canonicalEmail: "alice@example.com",
        mergedEmail: "carol@example.com",
      }),
    /constraint/i
  );
  assert.throws(
    () =>
      addAuthorMerge(db, repo.id, {
        canonicalName: "Alice",
        canonicalEmail: "alice@example.com",
        mergedEmail: "alice@example.com",
      }),
    /constraint/i
  );
  db.close();
});

test("deleting a repository cascades to its author merges", () => {
  const db = openDb(dbFile);
  const repo = listRepositories(db)[0];
  assert.equal(listAuthorMerges(db, repo.id).length, 1);
  deleteRepository(db, repo.id);
  assert.equal(listAuthorMerges(db, repo.id).length, 0);
  db.close();
});

test("data survives closing and reopening the database", () => {
  const db = openDb(dbFile);
  insertRepository(db, { name: "persisted", source_type: "zip", source: "persisted.zip" });
  db.close();

  const reopened = openDb(dbFile);
  assert.ok(listRepositories(reopened).some((r) => r.name === "persisted"));
  reopened.close();
});

test("rows are plain objects safe to pass to client components", () => {
  const db = openDb(dbFile);
  const repo = listRepositories(db)[0];
  assert.equal(Object.getPrototypeOf(repo), Object.prototype);

  const merge = addAuthorMerge(db, repo.id, {
    canonicalName: "A",
    canonicalEmail: "a@example.com",
    mergedEmail: "b@example.com",
  });
  assert.equal(Object.getPrototypeOf(merge), Object.prototype);
  assert.equal(Object.getPrototypeOf(getRepository(db, repo.id)), Object.prototype);
  assert.equal(Object.getPrototypeOf(getAuthorMerge(db, merge.id)), Object.prototype);
  assert.equal(Object.getPrototypeOf(listAuthorMerges(db, repo.id)[0]), Object.prototype);
  db.close();
});
