<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project rules

- One task at a time. Nothing the brief doesn't ask for.
- After every change: npm test and npm run build must pass. Report honestly.
- Real tests against a temporary database, run with npm test.
- Database: schema file, sensible constraints. Derived values are computed, never stored.
- README.md STARTS with "How to run": Node version, npm install, npm run dev, ./start.sh. Keep it working.
- After every working change: commit (feat:/fix:/test:/docs:), push, and check git ls-remote origin matches git log -1. If the push fails, fix it and push again.
- Never commit node_modules, .env or database files.

## SPEC CONSTRAINTS

Every hard rule in BRIEF.md (must-never rules, fixed values, required behaviour). BRIEF.md is the source of truth.

### Fixed values

- Time limit: 2.5 hours. Submission: URL to a public repository.
- Rename detection threshold: exactly 50%.
- Commit set windows: Ht = commits with committer date >= t; Hi,j = commits with i <= committer date < j (start inclusive, end exclusive).
- Zero guards: if |H| = 0 then modification frequency eta = 0 and churn rate rho = 0; if churn lambda(H,o) = 0 then ownership omega = 0.

### Must never happen

- Binary files are never measured (use Git's definition and detection of binary files).
- A pure rename must never change an object's metrics.
- Merge commits are never included: only non-merge commits reachable from the reference commit (typically HEAD).
- Remote repositories are never shallow-cloned; they are deeply cloned (full history).
- A deletion is never ignored: an object that exists in h[p] but not in h is recorded as a change (lines removed) on its path.
- A change made together with a rename is attributed to the object's new path.

### Required behaviour

- Web-app dashboard supporting multiple repositories, filtering by: repository; author; file or directory; commits (a specified period of time, or a manually selected list of commits).
- Metrics are computed for each author (developer), each file, each directory, and the entire repository.
- Ingestion accepts exactly two forms: (1) a zip file of the repo containing the .git file or directory; (2) a remote repository URL that is deeply cloned.
- Author identity: each commit has a single author after merging; merging uses the repo's .mailmap; when no mailmap is provided the user must still be able to merge authors manually.
- Commit model: each commit has previous commit h[p]; the initial commit's h[p] is the empty commit h-empty; the committer date is used; an object is identified by its path.
- Commit sets: H[F] and H[D] include objects from both h and h[p] across all h in H; H[D] includes the root directory.

### Metric definitions (must match exactly)

- File f at commit h: added lines l+(h,f); removed lines l-(h,f); growth delta(h,f) = l+(h,f) - l-(h,f); churn lambda(h,f) = l+(h,f) + l-(h,f).
- Directory d at commit h: added, removed, growth, and churn are summed over immediate children only: immediate files f in d and immediate subdirectories d' in d.
- Repository metrics are directory metrics on the root of the commit tree.
- Commit set H for object o in H[F] union H[D]: added l+(H,o), removed l-(H,o), growth delta(H,o), churn lambda(H,o) are sums over all h in H.
- Modifications: n(H,o) = number of commits in H where lambda(h,o) > 0. Modification frequency eta(H,o) = n(H,o)/|H| (0 if |H| = 0). Churn rate rho(H,o) = lambda(H,o)/|H| (0 if |H| = 0).
- Author a on object o: authorship test 1(a,h) is 1 iff a = h[a]; author modifications n(H,o,a) = sum of 1(a,h) * 1n(h,o); author churn lambda(H,o,a) = sum of lambda(h,o) * 1(a,h); ownership omega(H,o,a) = lambda(H,o,a)/lambda(H,o) when lambda(H,o) != 0, else 0.

### Rubric hard rules

- Requirements are cumulative: a tier can only be reached if the previous tier is satisfied.
- Metric correctness is judged against the provided repos (cJSON, Redis, Git) at specific commit hashes, against provided sample metrics.
