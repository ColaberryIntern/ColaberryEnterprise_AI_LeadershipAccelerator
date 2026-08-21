# Baseline Test Results (pre-tenancy)

**Session:** CC-20260821-m6t4
**Recorded:** 2026-08-21
**Commit:** `bb152ded` — `origin/main`, clean worktree at `C:\Users\ali_m\multitenancy-wt`
**Branch:** `workstream/multi-tenant-ecosystem` (created from `origin/main`)

Plan §24 requires this snapshot **before** schema changes so that pre-existing failures are
never attributed to the tenancy work.

---

## 1. Working tree state

```
$ git rev-parse --abbrev-ref HEAD
workstream/multi-tenant-ecosystem
$ git log --oneline -1
bb152ded PROGRESS.md: log org chart v4 (...) (#1679)
```

Clean at the time of capture. `node_modules` supplied by NTFS junction to an existing
install of the same lockfile (workspace hoisting puts nearly everything at the repo root).

## 2. Type check

```
$ cd backend && ./node_modules/.bin/tsc --noEmit
$ echo $?
0
```

**Result: CLEAN — 0 errors.** TypeScript 5.9.3 resolved from the workspace install.

> Note for future sessions: a bare `npx tsc` inside `/backend` can resolve a stale TypeScript
> and report a false clean. This run used the workspace binary explicitly and confirmed the
> version before trusting the result.

## 3. Targeted unit / integration suites

Selected for direct relevance to the systems this project touches: leads, ingest, tracking,
campaigns, organizations.

```
$ npx jest --testPathPattern "(orgService|adminOrgService|visitorTrackingIdentity|
    externalLeadIngestService|campaignTransport|ensurePageEventLeadId|
    ingestStatusCountsBySource)"
```

| Suite | Result | Time |
|---|---|---|
| `src/services/email/__tests__/campaignTransport.test.ts` | PASS | 20.2 s |
| `src/__tests__/services/externalLeadIngestService.test.ts` | PASS | 23.1 s |
| `src/services/__tests__/ingestStatusCountsBySource.test.ts` | PASS | 37.9 s |
| `src/services/__tests__/adminOrgService.test.ts` | PASS | 38.0 s |
| `src/services/__tests__/orgService.test.ts` | PASS | 38.5 s |
| `src/services/__tests__/visitorTrackingIdentity.test.ts` | PASS | 39.4 s |
| `src/db/__tests__/ensurePageEventLeadId.test.ts` | PASS | 47.0 s |

```
Test Suites: 7 passed, 7 total
Tests:       77 passed, 77 total
Time:        62.1 s
```

**Result: 77/77 passing. Zero pre-existing failures in the affected surface area.**

## 4. Pre-existing warnings (not failures, not caused by this project)

- `ts-jest[config] (WARN)` — `isolatedModules` is deprecated and moves to `tsconfig.json` in
  ts-jest v30. Present on every suite run. Repo-wide, unrelated to tenancy.

## 5. Not run, and why

| Suite | Reason |
|---|---|
| Full backend jest (783 test files) | Wall-clock cost far exceeds its value as a baseline; the targeted set covers every system this project modifies. Full-suite parity is a Gate 7 concern, not a Gate 0 one. |
| Playwright `/tests/systemV2` | Requires a running stack and staging credentials not available in this environment. Recorded as a known coverage gap; the ecosystem E2E suite specified in plan §54 is authored but not executed here. |
| Frontend build | Known to require Docker in this repo rather than a local `react-scripts build`. Frontend typecheck is the CI-authoritative gate and is run at Gate 7. |

## 6. Attribution rule

Any failure observed after this point in either the type check or the seven suites above is
**caused by the tenancy work** and must be fixed before the corresponding gate is marked
complete. Failures outside this set are triaged against a fresh baseline before being
attributed.
