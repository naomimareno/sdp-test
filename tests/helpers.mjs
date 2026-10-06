import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Create a scratch directory inside the project (cleaned up by the tests). */
export function makeScratchDir(prefix = ".tmp-test-") {
  return fs.mkdtempSync(path.join(projectRoot, prefix));
}

/** Run a git command with an isolated environment. */
export function git(cwd, args, env = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
      ...env,
    },
  });
}

export function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-b", "main"]);
  return dir;
}

export function writeFile(repoDir, relPath, content) {
  const target = path.join(repoDir, relPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

export function removeFile(repoDir, relPath) {
  fs.rmSync(path.join(repoDir, relPath));
}

export function commitAs(repoDir, message, { name, email }, date) {
  git(repoDir, ["add", "-A"]);
  const env = {
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email,
    ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
  };
  git(repoDir, ["commit", "--allow-empty", "-m", message], env);
  return git(repoDir, ["rev-parse", "HEAD"]).trim();
}

export const ALICE = { name: "Alice", email: "alice@example.com" };
export const BOB = { name: "Bob", email: "bob@example.com" };
export const CAROL = { name: "Carol", email: "carol@example.com" };
export const DAVE = { name: "Dave", email: "dave@example.com" };

/** Two commits touching one file. */
export function buildSimpleRepo(dir) {
  initRepo(dir);
  writeFile(dir, "hello.txt", "hello\nworld\n");
  commitAs(dir, "first", ALICE);
  writeFile(dir, "hello.txt", "hello\nworld\nagain\n");
  commitAs(dir, "second", BOB);
  return dir;
}

/**
 * 7 non-merge commits + 1 merge commit, covering:
 * add, modify, binary file, rename-with-change, deletion, branching.
 */
export function buildMetricsFixture(dir) {
  initRepo(dir);

  writeFile(dir, "src/app.ts", "line1\nline2\nline3\nline4\nline5\n");
  writeFile(dir, "src/util.ts", "u1\nu2\nu3\n");
  writeFile(dir, "README.md", "# readme\nintro\n");
  commitAs(dir, "c1 initial", ALICE);

  writeFile(dir, "src/app.ts", "line1\nline2 changed\nline3\nline4\nline5\nline6\n");
  writeFile(dir, "assets/logo.bin", Buffer.from([0x00, 0x01, 0x02, 0xff, 0x00, 0x42]));
  commitAs(dir, "c2 modify + binary", BOB);

  removeFile(dir, "src/util.ts");
  writeFile(dir, "src/lib/util.ts", "u1\nu2\nu3\nu4\n");
  commitAs(dir, "c3 rename with change", ALICE);

  removeFile(dir, "README.md");
  commitAs(dir, "c4 delete", ALICE);

  writeFile(dir, "src/lib/new.ts", "n1\nn2\nn3\n");
  commitAs(dir, "c5 add", BOB);

  git(dir, ["checkout", "-b", "side"]);
  writeFile(dir, "src/app.ts", "line1\nline2 changed\nline3\nline4\nline5\nline6\nline7\n");
  commitAs(dir, "c6a side change", CAROL);

  git(dir, ["checkout", "main"]);
  writeFile(dir, "src/lib/new.ts", "n1\nn2\nn3\nn4\n");
  commitAs(dir, "c6b main change", BOB);

  git(dir, ["merge", "--no-ff", "-m", "merge side", "side"], {
    GIT_AUTHOR_NAME: ALICE.name,
    GIT_AUTHOR_EMAIL: ALICE.email,
    GIT_COMMITTER_NAME: ALICE.name,
    GIT_COMMITTER_EMAIL: ALICE.email,
  });
  return dir;
}

/** A commit adding a file, then a pure rename (no content change). */
export function buildRenameFixture(dir) {
  initRepo(dir);
  writeFile(dir, "tools/x.txt", "x1\nx2\nx3\nx4\n");
  commitAs(dir, "c1 add", ALICE);
  fs.mkdirSync(path.join(dir, "vendor"), { recursive: true });
  git(dir, ["mv", "tools/x.txt", "vendor/x.txt"]);
  commitAs(dir, "c2 pure rename", ALICE);
  return dir;
}

/** Three commits with fixed committer dates: 2020-06-15 (Alice), 2021-06-15 (Bob), 2022-06-15 (Carol). */
export function buildDatedFixture(dir) {
  initRepo(dir);
  writeFile(dir, "a.txt", "a1\n");
  commitAs(dir, "c1 2020", ALICE, "2020-06-15T12:00:00Z");
  writeFile(dir, "b.txt", "b1\n");
  commitAs(dir, "c2 2021", BOB, "2021-06-15T12:00:00Z");
  writeFile(dir, "c.txt", "c1\n");
  commitAs(dir, "c3 2022", CAROL, "2022-06-15T12:00:00Z");
  return dir;
}

/** Alice, Carol (merged into Alice via .mailmap), and Dave. */
export function buildMailmapFixture(dir) {
  initRepo(dir);
  writeFile(dir, "a.txt", "a1\n");
  commitAs(dir, "c1", ALICE);
  writeFile(dir, "c.txt", "c1\n");
  commitAs(dir, "c2", CAROL);
  writeFile(dir, ".mailmap", "# fold Carol into Alice\nAlice <alice@example.com> <carol@example.com>\n");
  commitAs(dir, "c3 add mailmap", ALICE);
  writeFile(dir, "d.txt", "d1\n");
  commitAs(dir, "c4", DAVE);
  return dir;
}
