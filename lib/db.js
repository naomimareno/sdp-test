import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { dbPath, ensureDir } from "./paths.js";

/**
 * @typedef {object} Repository
 * @property {number} id
 * @property {string} name
 * @property {"zip" | "url"} source_type
 * @property {string} source
 * @property {string} storage_path
 * @property {string} created_at
 *
 * @typedef {object} AuthorMerge
 * @property {number} id
 * @property {number} repository_id
 * @property {string} canonical_name
 * @property {string} canonical_email
 * @property {string} merged_email
 */

const schemaFile = () => path.join(process.cwd(), "lib", "schema.sql");

/**
 * Driver rows are copied into plain objects: they are handed across the
 * server -> client component boundary, which rejects exotic prototypes.
 * @template T
 * @param {T} row
 * @returns {T}
 */
function plain(row) {
  return row ? { ...row } : row;
}

/**
 * Open (creating if needed) a database at the given file and apply the schema.
 * @param {string} file
 * @returns {import("better-sqlite3").Database}
 */
export function openDb(file) {
  ensureDir(path.dirname(file));
  const db = new Database(file);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(fs.readFileSync(schemaFile(), "utf8"));
  return db;
}

let cachedDb = null;
let cachedFile = null;

/**
 * Process-wide database handle (the app's default data store).
 * @returns {import("better-sqlite3").Database}
 */
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

/**
 * @param {import("better-sqlite3").Database} db
 * @returns {Repository[]}
 */
export function listRepositories(db) {
  return db.prepare("SELECT * FROM repositories ORDER BY id").all().map((row) => plain(row));
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number | bigint} id
 * @returns {Repository | undefined}
 */
export function getRepository(db, id) {
  return plain(db.prepare("SELECT * FROM repositories WHERE id = ?").get(id));
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{name: string, source_type: "zip" | "url", source: string}} repo
 * @returns {Repository}
 */
export function insertRepository(db, { name, source_type, source }) {
  const result = db
    .prepare("INSERT INTO repositories (name, source_type, source, storage_path) VALUES (?, ?, ?, '')")
    .run(name, source_type, source);
  return getRepository(db, Number(result.lastInsertRowid));
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number | bigint} id
 * @param {string} storagePath
 */
export function setRepositoryStorage(db, id, storagePath) {
  db.prepare("UPDATE repositories SET storage_path = ? WHERE id = ?").run(storagePath, id);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number | bigint} id
 */
export function deleteRepository(db, id) {
  db.prepare("DELETE FROM repositories WHERE id = ?").run(id);
}

// -------------------------------------------------------------- author merges

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number | bigint} repositoryId
 * @returns {AuthorMerge[]}
 */
export function listAuthorMerges(db, repositoryId) {
  return db
    .prepare("SELECT * FROM author_merges WHERE repository_id = ? ORDER BY id")
    .all(repositoryId)
    .map((row) => plain(row));
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number | bigint} repositoryId
 * @param {{canonicalName: string, canonicalEmail: string, mergedEmail: string}} merge
 * @returns {AuthorMerge}
 */
export function addAuthorMerge(db, repositoryId, { canonicalName, canonicalEmail, mergedEmail }) {
  const result = db
    .prepare(
      "INSERT INTO author_merges (repository_id, canonical_name, canonical_email, merged_email) VALUES (?, ?, ?, ?)"
    )
    .run(repositoryId, canonicalName, canonicalEmail, mergedEmail);
  return plain(db.prepare("SELECT * FROM author_merges WHERE id = ?").get(Number(result.lastInsertRowid)));
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number | bigint} id
 */
export function deleteAuthorMerge(db, id) {
  db.prepare("DELETE FROM author_merges WHERE id = ?").run(id);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number | bigint} id
 * @returns {AuthorMerge | undefined}
 */
export function getAuthorMerge(db, id) {
  return plain(db.prepare("SELECT * FROM author_merges WHERE id = ?").get(id));
}
