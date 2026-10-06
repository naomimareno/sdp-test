# How to run

**Node version: 22.5 or higher recommended** — Next.js 16 needs Node 20.9+, and the app stores its data with the built-in `node:sqlite` module, which is available unflagged from Node 22.5 (check with `node -v`).

On an older Node (like 18), the commands below still work: the project detects the old version and automatically re-runs itself with Node 22 via `npx` (the first fallback may download it once, so it needs network access).

1. `npm install` — install dependencies (`EBADENGINE` warnings on old Node are harmless; the install completes)
2. `npm run dev` — start the app on http://localhost:3000 (falls back to Node 22 automatically if your Node is too old)
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

## Project docs

- [BRIEF.md](./BRIEF.md) — the test brief (source of truth for requirements).
- [PLAN.md](./PLAN.md) — every feature with its marks and difficulty, plus the build order.
- [AGENTS.md](./AGENTS.md) — rules for working in this repository.
