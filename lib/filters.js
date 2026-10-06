/**
 * Commit-set and object filters (BRIEF requirements F06–F09).
 *
 * The metric definitions are parameterised by a commit set H and an object o.
 * Filtering narrows H (the repository is picked by the caller; commits can be
 * restricted by author and by committer-date period) or narrows which objects
 * are displayed (file / directory path). Date bounds are instants: `from` is
 * inclusive, `to` is exclusive.
 *
 * @typedef {{authorEmail?: string | null, from?: string | null, to?: string | null}} CommitFilters
 */

/** Date string -> epoch milliseconds; null for missing/unparseable values. */
export function instantOf(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/**
 * Narrow a list of commits to the selected commit set H.
 * The author filter matches the mailmap-resolved identity (falling back to the
 * raw author email) and ignores case; invalid date values are ignored.
 *
 * @param {Array<{hash?: string, authorName: string, authorEmail: string, committerDate: string, files: unknown[]}>} commits
 * @param {Map<string, {name: string, email: string}>} identityByHash
 * @param {CommitFilters} [filters]
 */
export function selectCommits(commits, identityByHash, { authorEmail, from, to } = {}) {
  const email = authorEmail ? authorEmail.trim().toLowerCase() : null;
  const fromTime = instantOf(from);
  const toTime = instantOf(to);
  if (!email && fromTime === null && toTime === null) return commits;

  return commits.filter((commit) => {
    if (email) {
      const resolved = identityByHash.get(commit.hash ?? "")?.email ?? commit.authorEmail;
      if (resolved.toLowerCase() !== email) return false;
    }
    if (fromTime !== null || toTime !== null) {
      const time = Date.parse(commit.committerDate);
      if (Number.isNaN(time)) return false;
      if (fromTime !== null && time < fromTime) return false;
      if (toTime !== null && time >= toTime) return false;
    }
    return true;
  });
}

/**
 * Object filter: true when `path` is the filter itself or lives inside it
 * (filter "src" matches the directory "src", "src/app.ts" and "src/lib/x.js"
 * but not "src2/file"). An empty filter matches everything; like git, paths
 * are compared case-sensitively.
 */
export function pathMatches(path, filter) {
  const needle = (filter ?? "").trim().replace(/\/+$/, "");
  if (needle === "") return true;
  return path === needle || path.startsWith(`${needle}/`);
}
