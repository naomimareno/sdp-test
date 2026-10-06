import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dbPath, ensureDir } from "./paths.js";

const schemaFile = () => path.join(process.cwd(), "lib", "schema.sql");

/**
 * Open (creating if needed) a database at the given file and apply the schema.
 * @param {string} file
 */
export function openDb(file) {
  ensureDir(path.dirname(file));
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(fs.readFileSync(schemaFile(), "utf8"));
  return db;
}

let cachedDb = null;
let cachedFile = null;

/** Process-wide database handle (the app's default data store). */
export function getDb() {
  const file = dbPath();
  if (!cachedDb || cachedFile !== file) {
    if (cachedDb) cachedDb.close();
    cachedDb = openDb(file);
    cachedFile = file;
  }
  return cachedDb;
}

// ---------------------------------------------------------------- repositories

export function listRepositories(db) {
  return db.prepare("SELECT * FROM repositories ORDER BY id").all();
}

export function getRepository(db, id) {
  return db.prepare("SELECT * FROM repositories WHERE id = ?").get(id);
}

export function insertRepository(db, { name, source_type, source }) {
  const result = db
    .prepare("INSERT INTO repositories (name, source_type, source, storage_path) VALUES (?, ?, ?, '')")
    .run(name, source_type, source);
  return getRepository(db, Number(result.lastInsertRowid));
}

export function setRepositoryStorage(db, id, storagePath) {
  db.prepare("UPDATE repositories SET storage_path = ? WHERE id = ?").run(storagePath, id);
}

export function deleteRepository(db, id) {
  db.prepare("DELETE FROM repositories WHERE id = ?").run(id);
}

// -------------------------------------------------------------- author merges

export function listAuthorMerges(db, repositoryId) {
  return db.prepare("SELECT * FROM author_merges WHERE repository_id = ? ORDER BY id").all(repositoryId);
}

export function addAuthorMerge(db, repositoryId, { canonicalName, canonicalEmail, mergedEmail }) {
  const result = db
    .prepare(
      "INSERT INTO author_merges (repository_id, canonical_name, canonical_email, merged_email) VALUES (?, ?, ?, ?)"
    )
    .run(repositoryId, canonicalName, canonicalEmail, mergedEmail);
  return db.prepare("SELECT * FROM author_merges WHERE id = ?").get(Number(result.lastInsertRowid));
}

export function deleteAuthorMerge(db, id) {
  db.prepare("DELETE FROM author_merges WHERE id = ?").run(id);
}
