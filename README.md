# How to run

**Node version: 18.18 or higher** — everything runs on the university's Node 18.19.1 with no version switches or downloads. Next.js 15 supports Node 18, and the app stores its data with `better-sqlite3`, a native SQLite driver that works on Node 18 (check your version with `node -v`).

1. `npm install` — install dependencies (`EBADENGINE` warnings are harmless; the install completes)
2. `npm run dev` — start the app on http://localhost:3000
3. `./start.sh` — runs `npm install` followed by `npm run dev` in one step

`start.sh` must stay executable: `chmod +x start.sh`.

---

# Repo Analysis Tool (RAT)

A web dashboard that analyses git repositories and reports file, directory, repository, commit set, and author metrics, as specified in [BRIEF.md](./BRIEF.md).

- Ingest a repository as a zip file (containing the .git file or directory) or clone it from a remote URL (deep clone, full history).
- Per-file, per-directory and per-repository added / removed / growth / churn metrics over the whole history (merge commits excluded, renames detected at 50% similarity, binaries not measured).
- Author identities resolved via the repository's .mailmap, with per-repository manual merges on top.
- Supports multiple repositories; all data is stored under `data/` (SQLite database plus cloned repositories) and survives restarts.
- Filter by repository, author, file/directory, and commits (a specified time period or a manual selection) — planned next.

## Reference validation

The lecturer's reference metrics (`repo-references/*.csv`) are not committed. `tests/reference.test.mjs` compares the engine's output against them exactly — every repository, file, directory and author row — and skips gracefully when the data is absent. To run the comparison locally:

1. Put the reference CSVs in `~/Downloads/repo-references` (or point `RAT_REFERENCE_DIR` at them).
2. `node scripts/fetch-reference-repos.mjs` — clones cJSON, redis and git at the exact reference commits into `data/ref-repos/` (gitignored; git.git is a large download).
3. `npm test`.

## Project docs

- [BRIEF.md](./BRIEF.md) — the test brief (source of truth for requirements).
- [PLAN.md](./PLAN.md) — every feature with its marks and difficulty, plus the build order.
- [AGENTS.md](./AGENTS.md) — rules for working in this repository.
