/**
 * Author identity resolution.
 *
 * Resolution order for each commit's raw author "Name <email>":
 *   1. the repository's .mailmap, via Git itself (`git check-mailmap`)
 *   2. manual merge records created in the app (matched by email)
 *
 * Identities are keyed by the full "Name <email>" pair, so two spellings that
 * share an email only merge when a mailmap entry or manual merge says so.
 */

/**
 * Split "Name <email>" into its parts (tolerant fallback: whole string as name).
 *
 * @param {string} identity
 * @returns {{name: string, email: string}}
 */
export function parseIdentity(identity) {
  const match = identity.match(/^(.*?)\s*<([^>]*)>\s*$/);
  if (!match) return { name: identity.trim(), email: "" };
  return { name: match[1].trim(), email: match[2].trim() };
}

/** @returns {string} "Name <email>" */
export function formatIdentity({ name, email }) {
  return `${name} <${email}>`;
}

/**
 * Apply the resolution order to one raw identity.
 *
 * @param {string} raw "Name <email>" as recorded in the commit
 * @param {Map<string, string>} rawToResolved mailmap overrides (raw -> resolved)
 * @param {Map<string, {name: string, email: string}>} manualMerges keyed by lowercased email
 * @returns {{name: string, email: string}}
 */
export function resolveFinalIdentity(raw, rawToResolved, manualMerges) {
  const resolved = rawToResolved.get(raw) ?? raw;
  let { name, email } = parseIdentity(resolved);
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
 * @param {Array<{hash: string, authorName: string, authorEmail: string}>} commits
 * @param {Map<string, string>} rawToResolved mailmap overrides (raw -> resolved)
 * @param {Map<string, {name: string, email: string}>} manualMerges keyed by lowercased email
 * @returns {{authors: Array<{name: string, email: string, commits: number, aliases: string[]}>, identityByHash: Map<string, {name: string, email: string}>}}
 */
export function resolveAuthors(commits, rawToResolved, manualMerges) {
  /** @type {Map<string, {name: string, email: string, commits: number, aliases: Set<string>}>} */
  const byKey = new Map();
  /** @type {Map<string, {name: string, email: string}>} */
  const identityByHash = new Map();

  for (const commit of commits) {
    const raw = `${commit.authorName} <${commit.authorEmail}>`;
    const identity = resolveFinalIdentity(raw, rawToResolved, manualMerges);
    const key = formatIdentity(identity);
    identityByHash.set(commit.hash, identity);

    let entry = byKey.get(key);
    if (!entry) {
      entry = { name: identity.name, email: identity.email, commits: 0, aliases: new Set() };
      byKey.set(key, entry);
    }
    entry.commits += 1;
    if (raw !== key) entry.aliases.add(raw);
  }

  const authors = [...byKey.values()]
    .map((e) => ({ name: e.name, email: e.email, commits: e.commits, aliases: [...e.aliases] }))
    .sort((a, b) => b.commits - a.commits || a.email.localeCompare(b.email) || a.name.localeCompare(b.name));

  return { authors, identityByHash };
}
