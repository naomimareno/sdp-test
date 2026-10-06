import { getRepository, listAuthorMerges } from "./db.js";
import { parseLog, readMailmap, resolveMailmap } from "./git.js";
import { resolveAuthors } from "./authors.js";
import { computeMetrics } from "./metrics.js";
import { selectCommits } from "./filters.js";

// Ingested repositories are immutable, so parsed history can be cached for the
// life of the process (it is recomputed from the stored repo, never persisted).
const logCache = new Map();
const mailmapCache = new Map();

/**
 * @typedef {object} RepoAnalysis
 * @property {import("./db.js").Repository} repo
 * @property {Array<{name: string, email: string, commits: number, aliases: string[]}>} authors every author of the repository (filter selector, merge panel)
 * @property {Array<{name: string, email: string, commits: number, aliases: string[]}>} setAuthors authors within the selected commit set (results table)
 * @property {import("./db.js").AuthorMerge[]} merges
 * @property {number} mailmapEntries
 * @property {number} commitCount commits in the full history
 * @property {import("./filters.js").CommitFilters} filters the filters that were applied
 * @property {import("./metrics.js").Metrics} metrics metrics over the selected commit set
 */

export function dropRepoCache(repoPath) {
  if (!repoPath) return;
  logCache.delete(repoPath);
  mailmapCache.delete(repoPath);
}

/**
 * @param {string} repoPath
 * @returns {Promise<Array<{authorName: string, authorEmail: string, files: Array<{path: string, added: number, deleted: number, renameFrom?: string}>}>>}
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
 * Full analysis for one repository. By default the commit set is the entire
 * history (all non-merge commits reachable from HEAD); the author and date
 * filters narrow it (F07/F09). The caller picks the repository (F06) and the
 * UI narrows displayed objects by path (F08).
 *
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number} repoId
 * @param {import("./filters.js").CommitFilters} [filters]
 * @returns {Promise<RepoAnalysis | null>}
 */
export async function getRepoAnalysis(db, repoId, filters = {}) {
  const repo = getRepository(db, repoId);
  if (!repo) return null;

  const commits = await getParsedCommits(repo.storage_path);
  const mailmap = await getMailmap(repo.storage_path, commits);
  const merges = listAuthorMerges(db, repo.id);
  const manualMerges = new Map(
    merges.map((m) => [m.merged_email.toLowerCase(), { name: m.canonical_name, email: m.canonical_email }])
  );

  const { authors, identityByHash } = resolveAuthors(commits, mailmap.resolved, manualMerges);
  const selected = selectCommits(commits, identityByHash, filters);
  const { authors: setAuthors } = resolveAuthors(selected, mailmap.resolved, manualMerges);

  return {
    repo,
    authors,
    setAuthors,
    merges,
    mailmapEntries: mailmap.entries,
    commitCount: commits.length,
    filters: {
      authorEmail: filters.authorEmail ?? null,
      from: filters.from ?? null,
      to: filters.to ?? null,
    },
    metrics: computeMetrics(selected, identityByHash),
  };
}
