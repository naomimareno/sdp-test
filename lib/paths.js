import fs from "node:fs";
import path from "node:path";

/** Absolute path of the data directory. Overridable for tests via RAT_DATA_DIR. */
export function dataDir() {
  return process.env.RAT_DATA_DIR ?? path.join(process.cwd(), "data");
}

export function dbPath() {
  return path.join(dataDir(), "rat.db");
}

export function reposDir() {
  return path.join(dataDir(), "repos");
}

export function workDir() {
  return path.join(dataDir(), "work");
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
