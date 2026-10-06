import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);

/**
 * Run a git command in a repository and return stdout.
 * Never prompts for credentials; generous buffer for large logs.
 */
export async function runGit(args, cwd, { timeoutMs = 10 * 60 * 1000 } = {}) {
  const { stdout } = await pexec("git", args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 512 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_OPTIONAL_LOCKS: "0",
    },
  });
  return stdout;
}

/** Undo git's C-style quoting for paths that contain special characters. */
export function unquoteGitPath(p) {
  if (!p.startsWith('"') || !p.endsWith('"')) return p;
  const inner = p.slice(1, -1);
  let out = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "\\" && i + 1 < inner.length) {
      const n = inner[++i];
      if (n === "n") out += "\n";
      else if (n === "t") out += "\t";
      else if (n === "r") out += "\r";
      else if (n === '"') out += '"';
      else if (n === "\\") out += "\\";
      else if (/[0-7]/.test(n)) {
        let oct = n;
        while (oct.length < 3 && i + 1 < inner.length && /[0-7]/.test(inner[i + 1])) oct += inner[++i];
        out += String.fromCharCode(parseInt(oct, 8));
      } else out += n;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * numstat renders renames as "old => new" (possibly brace-compressed
 * like "src/{old.ts => new.ts}"). Metrics are attributed to the new path.
 */
export function expandRenamePath(p) {
  const marker = " => ";
  if (!p.includes(marker)) return p;
  const open = p.indexOf("{");
  const close = open === -1 ? -1 : p.indexOf("}", open + 1);
  if (open !== -1 && close !== -1) {
    const before = p.slice(0, open);
    const inside = p.slice(open + 1, close);
    const after = p.slice(close + 1);
    const arrow = inside.indexOf(marker);
    const newPart = arrow === -1 ? inside : inside.slice(arrow + marker.length);
    if (newPart === "" && after.startsWith("/") && (before === "" || before.endsWith("/"))) {
      // git writes e.g. "src/{lib => }/util.js" when one side of the brace is
      // empty; the shared separator slash must be collapsed when expanding.
      return before + after.slice(1);
    }
    return before + newPart + after;
  }
  const idx = p.lastIndexOf(marker);
  return p.slice(idx + marker.length);
}

/**
 * All non-merge commits reachable from HEAD, newest first, each with the
 * per-file line statistics of its diff against its (single) parent.
 * Binary files are excluded entirely (git reports "-" counts).
 *
 * @param {string} repoPath
 * @returns {Promise<Array<{hash: string, committerDate: string, authorName: string, authorEmail: string, files: Array<{path: string, added: number, deleted: number}>}>>}
 */
export async function parseLog(repoPath) {
  const out = await runGit(
    [
      "-c",
      "core.quotepath=false",
      "log",
      "--no-merges",
      "-M50%",
      "--numstat",
      "--format=\u0001%H\u0001%cI\u0001%an\u0001%ae",
      "HEAD",
    ],
    repoPath
  );

  const commits = [];
  let current = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("\u0001")) {
      const parts = line.split("\u0001");
      current = {
        hash: parts[1],
        committerDate: parts[2],
        authorName: parts[3],
        authorEmail: parts[4],
        files: [],
      };
      commits.push(current);
      continue;
    }
    if (!current || line === "") continue;
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.*)$/);
    if (!match) continue;
    const [, added, deleted, rawPath] = match;
    if (added === "-" || deleted === "-") continue; // binary files are not measured
    current.files.push({
      path: expandRenamePath(unquoteGitPath(rawPath)),
      added: Number(added),
      deleted: Number(deleted),
    });
  }
  return commits;
}

/**
 * Parse .mailmap content into commit-email -> {name, email} mappings.
 * Supports the common forms; unknown lines are ignored.
 */
export function parseMailmap(content) {
  /** @type {Map<string, {name: string, email: string}>} */
  const map = new Map();
  for (let line of content.split("\n")) {
    const hashIdx = line.indexOf("#");
    if (hashIdx !== -1) line = line.slice(0, hashIdx);
    line = line.trim();
    if (!line) continue;

    const two = line.match(/^(.*?)\s*<([^>]+)>\s*(.*?)\s*<([^>]+)>$/);
    if (two) {
      const [, name1, email1, , email2] = two;
      map.set(email2.trim().toLowerCase(), { name: name1.trim(), email: email1.trim() });
      continue;
    }
    const one = line.match(/^(.*?)\s*<([^>]+)>$/);
    if (one) {
      const [, name1, email1] = one;
      if (name1.trim()) map.set(email1.trim().toLowerCase(), { name: name1.trim(), email: email1.trim() });
    }
  }
  return map;
}

/** The repo's .mailmap as committed at HEAD, or an empty map. */
export async function readMailmap(repoPath) {
  let content;
  try {
    content = await runGit(["show", "HEAD:.mailmap"], repoPath, { timeoutMs: 30 * 1000 });
  } catch {
    return new Map();
  }
  return parseMailmap(content);
}
