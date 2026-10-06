/**
 * Author identity resolution.
 *
 * Resolution order for each commit's raw author:
 *   1. the repository's .mailmap (parsed from HEAD)
 *   2. manual merges (records the user created for this repository)
 */

/**
 * @param {{name: string, email: string}} author raw author identity
 * @param {Map<string, {name: string, email: string}>} mailmap
 * @param {Map<string, {name: string, email: string}>} manualMerges
 * @returns {{name: string, email: string}}
 */
export function resolveIdentity(author, mailmap, manualMerges) {
  let name = author.name;
  let email = author.email;

  const mapped = mailmap.get(email.toLowerCase());
  if (mapped) {
    name = mapped.name || name;
    email = mapped.email || email;
  }
  const manual = manualMerges.get(email.toLowerCase());
  if (manual) {
    name = manual.name;
    email = manual.email;
  }
  return { name, email };
}

/**
 * Group commits into resolved authors.
 *
 * @param {Array<{authorName: string, authorEmail: string}>} commits
 * @param {Map<string, {name: string, email: string}>} mailmap
 * @param {Map<string, {name: string, email: string}>} manualMerges
 * @returns {Array<{name: string, email: string, commits: number, aliases: string[]}>}
 */
export function resolveAuthors(commits, mailmap, manualMerges) {
  const byEmail = new Map();
  for (const commit of commits) {
    const identity = resolveIdentity({ name: commit.authorName, email: commit.authorEmail }, mailmap, manualMerges);
    const key = identity.email.toLowerCase();
    let entry = byEmail.get(key);
    if (!entry) {
      entry = { name: identity.name, email: identity.email, commits: 0, aliases: new Set() };
      byEmail.set(key, entry);
    }
    entry.commits += 1;
    const raw = `${commit.authorName} <${commit.authorEmail}>`;
    if (raw !== `${entry.name} <${entry.email}>`) entry.aliases.add(raw);
  }
  return [...byEmail.values()]
    .map((e) => ({ name: e.name, email: e.email, commits: e.commits, aliases: [...e.aliases] }))
    .sort((a, b) => b.commits - a.commits || a.email.localeCompare(b.email));
}
