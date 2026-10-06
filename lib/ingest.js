import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { runGit } from "./git.js";
import { deleteRepository, getRepository, insertRepository, setRepositoryStorage } from "./db.js";
import { ensureDir, reposDir } from "./paths.js";

function firstLine(err) {
  const message = err instanceof Error ? err.message : String(err);
  return message.split("\n")[0];
}

/** Derive a short display name from a URL or zip filename. */
export function deriveRepoName(source) {
  const cleaned = source
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .replace(/\.zip$/i, "");
  const segment = cleaned.split(/[/:\\]/).filter(Boolean).pop() ?? "";
  return segment || "repository";
}

async function assertUsableRepo(repoPath) {
  try {
    await runGit(["rev-parse", "--verify", "HEAD^{commit}"], repoPath, { timeoutMs: 30 * 1000 });
  } catch {
    throw new Error("repository has no commits (HEAD does not resolve)");
  }
}

/**
 * Join a zip entry name to the target dir, rejecting absolute paths and
 * path traversal ("zip slip").
 */
export function safeZipJoin(targetDir, entryName) {
  if (entryName.startsWith("/") || /^[A-Za-z]:/.test(entryName)) {
    throw new Error(`zip contains an absolute path: ${entryName}`);
  }
  const root = path.resolve(targetDir);
  const target = path.resolve(root, entryName);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`zip entry escapes the target directory: ${entryName}`);
  }
  return target;
}

/** Extract a zip, skipping macOS junk and rejecting unsafe entries. */
export function extractZipSafely(zipPath, targetDir) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  if (entries.length === 0) throw new Error("zip file is empty");
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.replace(/\\/g, "/");
    if (name.startsWith("__MACOSX/") || name === ".DS_Store" || name.endsWith("/.DS_Store")) continue;
    const target = safeZipJoin(targetDir, name);
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, entry.getData());
  }
}

/**
 * Find the shallowest directory containing a usable git repository.
 * @returns {Promise<string | null>}
 */
export async function findGitRoot(root, maxDepth = 3) {
  let sawGit = false;
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift();
    if (fs.existsSync(path.join(dir, ".git"))) {
      sawGit = true;
      try {
        await runGit(["rev-parse", "--verify", "HEAD^{commit}"], dir, { timeoutMs: 30 * 1000 });
        return dir;
      } catch {
        // .git present but unusable (e.g. a submodule); keep searching deeper
      }
    }
    if (depth < maxDepth) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name !== ".git") {
          queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
        }
      }
    }
  }
  if (sawGit) throw new Error("the zip's .git directory has no usable commits");
  return null;
}

/**
 * Ingest a repository by deep-cloning a remote URL.
 * @param {import("better-sqlite3").Database} db
 * @param {string} url
 */
export async function ingestFromUrl(db, url) {
  const repo = insertRepository(db, { name: deriveRepoName(url), source_type: "url", source: url });
  const dest = path.join(reposDir(), String(repo.id));
  ensureDir(reposDir());
  try {
    await runGit(["clone", "--mirror", "--", url, dest], reposDir(), { timeoutMs: 15 * 60 * 1000 });
    await assertUsableRepo(dest);
    setRepositoryStorage(db, repo.id, dest);
    return getRepository(db, repo.id);
  } catch (err) {
    fs.rmSync(dest, { recursive: true, force: true });
    deleteRepository(db, repo.id);
    throw new Error(`Could not ingest repository from "${url}": ${firstLine(err)}`);
  }
}

/**
 * Ingest a repository from an uploaded zip containing its .git.
 * The temporary zip is deleted when done.
 * @param {import("better-sqlite3").Database} db
 * @param {string} zipPath
 * @param {string} originalName
 */
export async function ingestFromZip(db, zipPath, originalName) {
  const repo = insertRepository(db, { name: deriveRepoName(originalName), source_type: "zip", source: originalName });
  const dest = path.join(reposDir(), String(repo.id));
  try {
    ensureDir(dest);
    const checkout = ensureDir(path.join(dest, "checkout"));
    extractZipSafely(zipPath, checkout);
    const gitRoot = await findGitRoot(checkout);
    if (!gitRoot) throw new Error("the zip does not contain a git repository (no .git found)");
    await assertUsableRepo(gitRoot);
    setRepositoryStorage(db, repo.id, gitRoot);
    return getRepository(db, repo.id);
  } catch (err) {
    fs.rmSync(dest, { recursive: true, force: true });
    deleteRepository(db, repo.id);
    throw new Error(`Could not ingest zip "${originalName}": ${firstLine(err)}`);
  } finally {
    fs.rmSync(zipPath, { force: true });
  }
}
