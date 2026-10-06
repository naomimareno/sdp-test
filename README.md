# How to run

**Node version: 20.9 or higher** (required by Next.js 16 — check with `node -v`).

1. `npm install` — install dependencies
2. `npm run dev` — start the app on http://localhost:3000
3. `./start.sh` — runs `npm install` followed by `npm run dev` in one step

`start.sh` must stay executable: `chmod +x start.sh`.

---

# Repo Analysis Tool (RAT)

A web dashboard that analyses git repositories and reports file, directory, repository, commit set, and author metrics, as specified in [BRIEF.md](./BRIEF.md).

- Ingest a repository as a zip file (containing the .git file or directory) or clone it from a remote URL (deep clone, full history).
- Filter by repository, author, file/directory, and commits (a specified time period or a manual selection).
- Merge author identities via .mailmap, with manual merging when no mailmap is provided.
- Supports multiple repositories, each filterable independently.

## Project docs

- [BRIEF.md](./BRIEF.md) — the test brief (source of truth for requirements).
- [PLAN.md](./PLAN.md) — every feature with its marks and difficulty, plus the build order.
- [AGENTS.md](./AGENTS.md) — rules for working in this repository.
