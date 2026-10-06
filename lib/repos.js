import { getRepository, listAuthorMerges } from "./db.js";
import { parseLog, readMailmap, resolveMailmap } from "./git.js";
import { resolveAuthors } from "./authors.js";
import { computeMetrics } from "./metrics.js";

// Ingested repositories are immutable, so parsed history can be cached for the
// life of the process (it is recomputed from the stored repo, never persisted).
const logCache = new Map();
const mailmapCache = new Map();

/**
 * @typedef {object} RepoAnalysis
 * @property {import("./db.js").Repository} repo
 * @property {Array<{name: string, email: string, commits: number, aliases: string[]}>} authors
 * @property {import("./db.js").AuthorMerge[]} merges
 * @property {number} mailmapEntries
 * @property {import("./metrics.js").Metrics} metrics
 */

export function dropRepoCache(repoPath) {
  if (!repoPath) return;
  logCache.delete(repoPath);
  mailmapCache.delete(repoPath);
}

/**
 * @param {string} repoPath
 * @returns {Promise<Array<{authorName: string, authorEmail: string, files: Array<{path: string, added: number, deleted: number}>}>>}
 */
export async function getParsedCommits(repoPath) {
  let commits = logCache.get(repoPath);
  if (!commits) {
    commits = await parseLog(repoPath);
    logCache.set(repoPath, commits);
  }
  return commits;
}

/** @param {string} repoPath */
async function getMailmap(repoPath, commits) {
  let mailmap = mailmapCache.get(repoPath);
  if (!mailmap) {
    const rawIdentities = [...new Set(commits.map((c) => `${c.authorName} <${c.authorEmail}>`))];
    mailmap = {
      resolved: resolveMailmap(repoPath, rawIdentities),
      entries: (await readMailmap(repoPath)).size,
    };
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
 * @returns {Promise<RepoAnalysis | null>}
 */
export async function getRepoAnalysis(db, repoId) {
  const repo = getRepository(db, repoId);
  if (!repo) return null;

  const commits = await getParsedCommits(repo.storage_path);
  const mailmap = await getMailmap(repo.storage_path, commits);
  const merges = listAuthorMerges(db, repo.id);
  const manualMerges = new Map(
    merges.map((m) => [m.merged_email.toLowerCase(), { name: m.canonical_name, email: m.canonical_email }])
  );

  const { authors, identityByHash } = resolveAuthors(commits, mailmap.resolved, manualMerges);

  return {
    repo,
    authors,
    merges,
    mailmapEntries: mailmap.entries,
    metrics: computeMetrics(commits, identityByHash),
  };
}
