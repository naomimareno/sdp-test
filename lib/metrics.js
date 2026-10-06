/**
 * Metric aggregation engine.
 *
 * All values are derived from commit diffs (added/removed line counts):
 *   growth = added - removed, churn = added + removed.
 * Derived values are computed on demand and never stored.
 *
 * @typedef {{added: number, removed: number}} LineCounts
 * @typedef {{added: number, removed: number, growth: number, churn: number}} ObjectMetrics
 */

/** @returns {ObjectMetrics} */
function finalize({ added, removed }) {
  return { added, removed, growth: added - removed, churn: added + removed };
}

/** Immediate parent directory of a path ("" = repository root). */
export function parentDir(p) {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

/**
 * Compute file, directory and repository metrics over a commit set.
 * Directory metrics sum over immediate children only (immediate files plus
 * immediate subdirectories); repository metrics are the root's directory
 * metrics.
 *
 * @param {Array<{files: Array<{path: string, added: number, deleted: number}>}>} commits
 * @returns {{totals: ObjectMetrics, files: Array<{path: string} & ObjectMetrics>, directories: Array<{path: string} & ObjectMetrics>, commitCount: number}}
 */
export function computeMetrics(commits) {
  /** @type {Map<string, LineCounts>} */
  const files = new Map();
  for (const commit of commits) {
    for (const f of commit.files) {
      const entry = files.get(f.path) ?? { added: 0, removed: 0 };
      entry.added += f.added;
      entry.removed += f.deleted;
      files.set(f.path, entry);
    }
  }

  /** @type {Map<string, LineCounts>} */
  const dirs = new Map([["", { added: 0, removed: 0 }]]);
  for (const p of files.keys()) {
    let d = parentDir(p);
    while (!dirs.has(d)) {
      dirs.set(d, { added: 0, removed: 0 });
      if (d === "") break;
      d = parentDir(d);
    }
  }

  // Roll file metrics into their immediate directory...
  for (const [p, counts] of files) {
    const target = dirs.get(parentDir(p));
    target.added += counts.added;
    target.removed += counts.removed;
  }
  // ...then roll subdirectory metrics into their parent, deepest first.
  const dirPaths = [...dirs.keys()]
    .filter((d) => d !== "")
    .sort((a, b) => b.split("/").length - a.split("/").length || a.localeCompare(b));
  for (const d of dirPaths) {
    const counts = dirs.get(d);
    const target = dirs.get(parentDir(d));
    target.added += counts.added;
    target.removed += counts.removed;
  }

  return {
    totals: finalize(dirs.get("")),
    files: [...files.entries()].map(([path, counts]) => ({ path, ...finalize(counts) })),
    directories: [...dirs.entries()].map(([path, counts]) => ({ path: path === "" ? "/" : path, ...finalize(counts) })),
    commitCount: commits.length,
  };
}
