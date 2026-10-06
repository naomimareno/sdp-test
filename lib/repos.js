import { getRepository, listAuthorMerges } from "./db.js";
import { parseLog, readMailmap } from "./git.js";
import { resolveAuthors } from "./authors.js";
import { computeMetrics } from "./metrics.js";

// Ingested repositories are immutable, so parsed history can be cached for the
// life of the process (it is recomputed from the stored repo, never persisted).
const logCache = new Map();
const mailmapCache = new Map();

export function dropRepoCache(repoPath) {
  if (!repoPath) return;
  logCache.delete(repoPath);
  mailmapCache.delete(repoPath);
}

/** @param {string} repoPath */
export async function getParsedCommits(repoPath) {
  let commits = logCache.get(repoPath);
  if (!commits) {
    commits = await parseLog(repoPath);
    logCache.set(repoPath, commits);
  }
  return commits;
}

/** @param {string} repoPath */
async function getMailmap(repoPath) {
  let mailmap = mailmapCache.get(repoPath);
  if (!mailmap) {
    mailmap = await readMailmap(repoPath);
    mailmapCache.set(repoPath, mailmap);
  }
  return mailmap;
}

/**
 * Full analysis for one repository: resolved authors and metrics over the
 * entire history (all non-merge commits reachable from HEAD).
 *
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number} repoId
 */
export async function getRepoAnalysis(db, repoId) {
  const repo = getRepository(db, repoId);
  if (!repo) return null;

  const commits = await getParsedCommits(repo.storage_path);
  const mailmap = await getMailmap(repo.storage_path);
  const merges = listAuthorMerges(db, repo.id);
  const manualMerges = new Map(
    merges.map((m) => [m.merged_email.toLowerCase(), { name: m.canonical_name, email: m.canonical_email }])
  );

  return {
    repo,
    authors: resolveAuthors(commits, mailmap, manualMerges),
    merges,
    mailmapEntries: mailmap.size,
    metrics: computeMetrics(commits),
  };
}
