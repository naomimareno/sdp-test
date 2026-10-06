import { formatIdentity } from "./authors.js";

/**
 * Metric aggregation engine.
 *
 * All values are derived from commit diffs (added/removed line counts):
 *   growth = added - removed, churn = added + removed,
 *   modifications = commits where the object's churn > 0,
 *   modification frequency = modifications / |H|, churn rate = churn / |H|,
 *   per author: their share of additions/removals/churn and ownership
 *   = author churn / object churn.
 * Derived values are computed on demand and never stored.
 *
 * @typedef {{added: number, removed: number}} LineCounts
 * @typedef {{name: string, email: string, added: number, removed: number, growth: number, churn: number, modifications: number, ownership: number}} AuthorContribution
 * @typedef {{added: number, removed: number, growth: number, churn: number, modifications: number, modificationFrequency: number, churnRate: number, authors: AuthorContribution[]}} ObjectMetrics
 * @typedef {ObjectMetrics & {path: string}} ObjectRow
 * @typedef {{totals: ObjectMetrics, files: ObjectRow[], directories: ObjectRow[], commitCount: number}} Metrics
 */

/** Immediate parent directory of a path ("" = repository root). */
export function parentDir(p) {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

/** @returns {{added: number, removed: number, modifications: number}} */
function emptyCounts() {
  return { added: 0, removed: 0, modifications: 0 };
}

/**
 * Turn accumulated per-author counts into sorted contribution rows.
 * Authors without any churn on the object are omitted (matches the provided
 * sample metrics); ownership is 0 when the object's churn is 0.
 *
 * @param {Map<string, {added: number, removed: number, modifications: number}>} byAuthor
 * @param {number} objectChurn
 * @returns {AuthorContribution[]}
 */
function authorRows(byAuthor, objectChurn) {
  const rows = [];
  for (const [key, counts] of byAuthor) {
    const churn = counts.added + counts.removed;
    if (churn <= 0) continue;
    const { name, email } = splitKey(key);
    rows.push({
      name,
      email,
      added: counts.added,
      removed: counts.removed,
      growth: counts.added - counts.removed,
      churn,
      modifications: counts.modifications,
      ownership: objectChurn > 0 ? churn / objectChurn : 0,
    });
  }
  return rows.sort((a, b) => b.churn - a.churn || a.email.localeCompare(b.email) || a.name.localeCompare(b.name));
}

/** @param {string} key "Name <email>" */
function splitKey(key) {
  const match = key.match(/^(.*?)\s*<([^>]*)>$/);
  if (!match) return { name: key, email: "" };
  return { name: match[1], email: match[2] };
}

/** @returns {{added: number, removed: number, modifications: number, authors: Map<string, ReturnType<typeof emptyCounts>>}} */
function emptyNode() {
  return { added: 0, removed: 0, modifications: 0, authors: new Map() };
}

/** Ensure every ancestor directory of p exists in the dirs map. */
function ensureAncestors(dirs, p) {
  let d = parentDir(p);
  while (!dirs.has(d)) {
    dirs.set(d, emptyNode());
    if (d === "") break;
    d = parentDir(d);
  }
}

/**
 * Compute file, directory and repository metrics over a commit set H.
 * Directory metrics sum over immediate children only (immediate files plus
 * immediate subdirectories); repository metrics are the root's directory
 * metrics. Modification counts count commits, so they are accumulated per
 * commit and never summed across object levels.
 *
 * @param {Array<{hash?: string, authorName: string, authorEmail: string, files: Array<{path: string, added: number, deleted: number, renameFrom?: string}>}>} commits
 * @param {Map<string, {name: string, email: string}>} identityByHash resolved author per commit hash (optional)
 * @returns {Metrics}
 */
export function computeMetrics(commits, identityByHash = new Map()) {
  const commitCount = commits.length;

  /** @type {Map<string, ReturnType<typeof emptyNode>>} */
  const files = new Map();
  /** @type {Map<string, ReturnType<typeof emptyNode>>} */
  const dirs = new Map([["", emptyNode()]]);

  for (const commit of commits) {
    const identity = identityByHash.get(commit.hash ?? "");
    const authorKey = identity ? formatIdentity(identity) : `${commit.authorName} <${commit.authorEmail}>`;

    // Per-commit churn of every ancestor directory, to count modifications
    // (one per commit, however many descendants changed).
    /** @type {Map<string, number>} */
    const commitDirChurn = new Map();

    for (const f of commit.files) {
      // The old side of a rename stays a file object even when the log stream
      // never reports it otherwise (all-zero row, no counts attributed).
      if (f.renameFrom && !files.has(f.renameFrom)) files.set(f.renameFrom, emptyNode());
      const churn = f.added + f.deleted;
      let file = files.get(f.path);
      if (!file) {
        file = emptyNode();
        files.set(f.path, file);
      }
      file.added += f.added;
      file.removed += f.deleted;
      let fileAuthor = file.authors.get(authorKey);
      if (!fileAuthor) {
        fileAuthor = emptyCounts();
        file.authors.set(authorKey, fileAuthor);
      }
      fileAuthor.added += f.added;
      fileAuthor.removed += f.deleted;
      if (churn > 0) {
        file.modifications += 1;
        fileAuthor.modifications += 1;
      }

      let d = parentDir(f.path);
      for (;;) {
        commitDirChurn.set(d, (commitDirChurn.get(d) ?? 0) + churn);
        if (d === "") break;
        d = parentDir(d);
      }
    }

    for (const [d, churn] of commitDirChurn) {
      if (churn <= 0) continue;
      let dir = dirs.get(d);
      if (!dir) {
        dir = emptyNode();
        dirs.set(d, dir);
      }
      dir.modifications += 1;
      let dirAuthor = dir.authors.get(authorKey);
      if (!dirAuthor) {
        dirAuthor = emptyCounts();
        dir.authors.set(authorKey, dirAuthor);
      }
      dirAuthor.modifications += 1;
    }
  }

  // Every ancestor of every measured file is a directory object.
  for (const p of files.keys()) ensureAncestors(dirs, p);

  // Roll line counts up: files into their immediate directory...
  for (const [p, file] of files) {
    const target = dirs.get(parentDir(p));
    target.added += file.added;
    target.removed += file.removed;
    mergeAuthorCounts(target.authors, file.authors);
  }
  // ...then subdirectory counts into their parent, deepest first.
  const dirPaths = [...dirs.keys()]
    .filter((d) => d !== "")
    .sort((a, b) => b.split("/").length - a.split("/").length || a.localeCompare(b));
  for (const d of dirPaths) {
    const counts = dirs.get(d);
    const target = dirs.get(parentDir(d));
    target.added += counts.added;
    target.removed += counts.removed;
    mergeAuthorCounts(target.authors, counts.authors);
  }

  /**
   * Add source author line counts into target. Modification counts are per
   * object per commit and were already accumulated during the commit walk,
   * so they are never rolled up.
   */
  function mergeAuthorCounts(target, source) {
    for (const [key, counts] of source) {
      let entry = target.get(key);
      if (!entry) {
        entry = emptyCounts();
        target.set(key, entry);
      }
      entry.added += counts.added;
      entry.removed += counts.removed;
    }
  }

  /** @returns {ObjectMetrics} */
  function finalize(node) {
    const churn = node.added + node.removed;
    return {
      added: node.added,
      removed: node.removed,
      growth: node.added - node.removed,
      churn,
      modifications: node.modifications,
      modificationFrequency: commitCount > 0 ? node.modifications / commitCount : 0,
      churnRate: commitCount > 0 ? churn / commitCount : 0,
      authors: authorRows(node.authors, churn),
    };
  }

  const root = dirs.get("");
  return {
    totals: finalize(root),
    files: [...files.entries()].map(([path, node]) => ({ path, ...finalize(node) })),
    directories: [...dirs.entries()].map(([path, node]) => ({ path: path === "" ? "/" : path, ...finalize(node) })),
    commitCount,
  };
}
