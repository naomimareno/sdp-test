# PLAN — Repo Analysis Tool (RAT)

Source: BRIEF.md. Marks are planning estimates derived from the rubric (Requirements 50 / Architectural & UI Design 25 / Usability 25, total 100) — the brief assigns no per-feature marks. Difficulty is an implementation estimate (easy / medium / hard).

## Features

| ID | Feature | Marks | Difficulty |
|----|---------|-------|------------|
| F01 | Repository upload — zip file (contains .git file or directory) | 4 | medium |
| F02 | Repository upload — remote URL, deeply cloned (full history) | 4 | easy |
| F03 | Multiple repository support | 1 | easy |
| F04 | Author merging via .mailmap | 2 | medium |
| F05 | Manual author merging (when no mailmap is provided) | 1 | easy |
| F06 | Filtering — by repository | 2 | easy |
| F07 | Filtering — by author | 2 | easy |
| F08 | Filtering — by file or directory | 2 | easy |
| F09 | Filtering — commits by specified period of time | 2 | easy |
| F10 | Filtering — manually selected list of commits | 2 | medium |
| F11 | File metrics — added, removed, growth, churn | 6 | easy |
| F12 | Directory metrics — added, removed, growth, churn (immediate children) | 7 | medium |
| F13 | Repository metrics — directory metrics on the root | 3 | easy |
| F14 | Commit set metrics — sums, modifications, modification frequency, churn rate | 6 | medium |
| F15 | Author metrics — author modifications, author churn, ownership | 6 | medium |

Feature marks subtotal: 50 (Requirements criterion).

## Cross-cutting rubric criteria

| ID | Criterion | Marks | Difficulty |
|----|-----------|-------|------------|
| C01 | Architecture — efficient metric computation algorithms | 14 | hard |
| C02 | UI design — visualisation of metrics | 11 | hard |
| C03 | Usability — navigation, error handling, QoL features | 11 | medium |
| C04 | Performance — ~1 000 / ~10 000 / ~100 000 commit repositories | 14 | hard |

Cross-cutting subtotal: 25 (Architectural & UI Design) + 25 (Usability). Grand total: 100.

## Build order

Rule: core first, then EASY features with the MOST marks, hard features last.

### Stage 0 — Core (prerequisite for everything)

1. App skeleton (Next.js App Router, TypeScript), database schema file with sensible constraints, test harness running real tests against a temporary database via `npm test`.
2. Ingestion pipeline: zip extraction (validate .git present) and remote URL deep clone into a bare repo store; data model keyed by repository so multiple repos work from day one — this lands F01, F02, and the F03 foundation (ingestion sits in core because nothing can be tested before a repo can be loaded).
3. History engine: commit walk (non-merge commits reachable from the reference commit, committer date), per-commit diff with rename detection at the 50% threshold, binary file exclusion, deletion recorded as removed lines on its path, change+rename attributed to the new path.
4. Aggregation and identity: immediate-child directory sums (the shared engine behind F12/F13) and the author identity layer (.mailmap parsing + manual merge records, the F04/F05 foundation).

### Stage 1 — EASY features, most marks first

1. F11 File metrics (6 marks, easy) — direct from the diff engine.
2. F13 Repository metrics (3, easy) — root-directory aggregation on the shared engine.
3. F06, F07, F08, F09 Filtering: repository, author, file/directory, commit time period (8 marks total, easy) — minimal table UI so every result is demonstrable.
4. F03 Multi-repo support surface (1, easy) — data model already supports it; expose the repository selector.
5. F05 Manual author merging (1, easy) — merge records already modelled; expose the action.

### Stage 2 — Medium

1. F12 Directory metrics (7, medium) — full directory correctness and browsing.
2. F14 Commit set metrics (6, medium).
3. F15 Author metrics (6, medium).
4. F04 .mailmap merging (2, medium) — parse and apply to identity resolution.
5. F10 Manual commit list selection (2, medium) — commit picker feeding commit set metrics.
6. C03 Navigation, error handling, QoL baseline (11, medium).

### Stage 3 — HARD features last

1. C02 Visualisation of metrics (11, hard) — charts per file/directory/author/commit set.
2. C01 Efficient algorithms for metric computation (14, hard) — incremental/cached aggregation (derived values are always computed, never stored).
3. C04 Performance on large repositories (14, hard) — validate ~1 000, then ~10 000, then ~100 000 commits (e.g. git.git) and optimise until acceptable.

## Verification notes

- Metric correctness is checked against the provided repos (cJSON, Redis, Git) at the provided commit hashes using the provided sample metrics.
- Rubric tiers are cumulative: a tier is only reached if the previous tier is satisfied.
