# Session CC-20261123-st9r — retire the staging branch and its back-merge workflow

**Date:** 2026-11-23
**Ticket:** STG-1 — https://app.basecamp.com/3945211/buckets/7463955/todos/10537583508

## What changed

Deleted `.github/workflows/sync-main-to-staging.yml`. The `staging` branch it maintained
has been retired; the branch's final state is preserved as the annotated tag
`archive/staging-2026-08-06`.

## Why

Every push to `main` was producing a red X, and the workflow was not the defect — it was
the only thing still talking about a branch that died on 2026-08-06.

Measured against the GitHub API on 2026-11-23:

| Fact | Value |
|---|---|
| `staging` last commit | 2026-08-06 (109 days before retirement) |
| `main` ahead of `staging` | 8,616 commits |
| `staging` ahead of `main` | 73 commits |
| Divergence | 300 files, status `diverged` |
| Mentions in `docker-compose.yml` | 0 |
| Mentions in `docker-compose.production.yml` | 0 |
| Mentions in `scripts/deploy-prod.sh` | 0 |
| Workflows on `main` referencing staging | 1 — only `sync-main-to-staging.yml` itself |
| Comments on tracking PR #1413 | 2,500 (GitHub's hard cap) |

Nothing deployed from `staging` and nothing in CI depended on it. The branch was entirely
self-referential: the only consumer of `staging` was the workflow that existed to update
`staging`.

### The actual failure mode

The job did not fail at the merge. It failed at `Note the new conflict on the existing PR`:

```
GraphQL: Commenting is disabled on issues with more than 2500 comments (addComment)
##[error]Process completed with exit code 1
```

PR #1413 (open since 2026-08-13, base `staging`, `mergeable_state: dirty`) had received one
bot comment per `main` merge until it reached GitHub's 2,500-comment ceiling, at which point
every subsequent run failed on a step whose only job was to report the divergence.

### This was the second symptom of the same root cause

The workflow's own comments record the first one: between 2026-08-07 and 2026-08-11 it opened
**56 duplicate conflict PRs**, because each run cut a fresh branch from `origin/main` and
reopened the same unresolvable merge under a new number. That was patched with an idempotency
guard which collapsed the duplicates into a single tracking PR and commented on it instead —
which is precisely what then exhausted the comment cap.

Patching the comment step would have been the third patch of a symptom whose cause is that
`staging` is abandoned. The cause was removed instead.

## Stranded work, and where it went

Three files existed on `staging` and not on `main`:

- `backend/src/routes/devAuthRoutes.ts` — local-dev one-click login for seeded test accounts.
  Guarded: 404s when `NODE_ENV=production`, only mounted when `nodeEnv !== 'production'`, and
  hard-scoped to `@localdev.test` emails. A developer convenience that never landed, not an
  exposure.
- `backend/src/scripts/runSeedAdmissionsKnowledge.ts` — a one-off seed runner.
- `backend/src/services/inbox/__tests__/coraPersonaRouter.test.ts` — a test for the Cora/Cory
  persona split, which itself shipped to `main` separately.

All three remain readable at `archive/staging-2026-08-06`.

The 73 staging-only commits are July–August PRs that used `staging` as their **base branch**,
from when `staging` was the integration branch and `main` sat downstream. Verified on eight of
them (#506, #816, #964, #1111, #1117, #1219, #1243, #1250) — every one had `base=staging`.

## Verification

Each check below was run with a control, because "the file is absent" and "my query is broken"
produce identical output:

- **Staging-only files absent from `main`:** the three paths returned 404 on `main`, while a
  file known to exist (`backend/src/models/RoomMembership.ts`) returned 200 and an impossible
  path returned 404 — through the same call. The absences are real.
- **The archive tag preserves the work:** `archive/staging-2026-08-06` resolves to
  `6194b69d684c53828eea880fe1d55e9d1e1a7ae7`, the exact `staging` tip. `devAuthRoutes.ts` and
  `runSeedAdmissionsKnowledge.ts` both return 200 at the tag; an impossible path still returns
  404, so the check still discriminates.
- **No remaining references:** after this change, no workflow on `main` mentions `staging`.

**Not yet verified at the time of this commit:** that a real merge to `main` produces no red X.
That cannot be proven until this PR merges and the next push to `main` runs. It is criterion (2)
on STG-1 and stays open until observed on a real merge.

## Follow-on steps (after merge)

1. Close PR #1413 with a pointer to STG-1. **Note:** a comment cannot be posted on it — it is at
   the 2,500 cap, which is the whole bug — so the reason goes in the PR body instead.
2. Delete the `staging` branch. Reversible via `archive/staging-2026-08-06`.
3. Observe one real merge to `main` and confirm no failing check.

## Files touched

- `.github/workflows/sync-main-to-staging.yml` (deleted)
- `docs/sessions/SESSION_CC-20261123-st9r-retire-staging.md` (added)
