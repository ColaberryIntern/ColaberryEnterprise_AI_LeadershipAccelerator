# CC-20261109-k2w7 — the quality gate for the Maya release ladder

**Date:** 2026-11-12
**Branch:** `workstream/mr4-maya-welcome-audience-and-delivery`
**Covers:** the nine implementation tasks logged in
`CC-20261109-k2w7-mr1-honest-tools.md`, `-mr2-maya-email-capability.md`,
`-mr3-journey-readiness.md`, `-mr4-welcome-audience.md` and `-mr5-release-gate.md`.

## `main` moved twice under the branch, and the second rebase broke

Recorded because the recovery is the useful part.

- **First move:** `62fa624fb` → `031db3b5c`, 7 commits (gov cockpit, agent factory audit). **Zero
  file overlap**, verified by intersecting the two file lists rather than by inspection. Rebased
  cleanly.
- **Second move:** `031db3b5c` → `a6570baf8`, 5 commits (hire profile phases 1 and 2). **Zero
  overlap again.**

The second rebase **failed mid-flight** with `error: could not write index / could not detach
HEAD`, and left a partial checkout: 28 modified files and a dozen untracked ones, all belonging to
`main`'s hire work, with `HEAD` still on my own commit.

**Why that was recoverable with nothing lost:** the tree had been verified clean immediately
before, so every line of my work was already committed. `git reset --hard HEAD` restored the
tracked files from my own commits, and `git clean -fd` removed the stranded untracked ones — which
belong to `main` and return on a successful rebase. `.loop-architect/` is gitignored, so `clean`
without `-x` left the run directory alone, and that was confirmed with `git clean -nd` **before**
running it rather than assumed. The retry replayed all 9 commits.

This is the hazard the "stale branch reverts later work without conflict" rule exists for: had I
pushed without rebasing, the PR would have quietly reverted twelve commits of other people's work
with no merge conflict to warn anybody.

## The gates

| Gate | Command | Result |
|---|---|---|
| Backend typecheck | `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` | **0 errors** |
| …and proven real | planted control error | reported at `mayaToolsService.ts(1049,7)`, then reverted |
| Frontend typecheck | `npx tsc --noEmit` in `frontend/` | **exit 0** |
| Frontend build / tests | — | **no frontend file changed by this branch**, so unchanged by construction rather than merely passing |
| Backend suites (the real CI config) | `npx jest -c jest.ci.config.ts --ci` | **2,684 suites passed, 44,308 tests, 3 failed** |
| Ratchet self-test | `npx jest src/services/content/__tests__/testTypecheckRatchet.test.ts --ci` | **22 passed** |
| Test-file typecheck ratchet | `node scripts/checkTestTypecheck.js` at the 8GB heap | see below |
| My own surface, re-run post-rebase | 61 suites under the CI config | **1,073 passed, 0 failed** |

### The three CI failures are not mine, and that is proven rather than asserted

```
FAIL src/scripts/__tests__/generateReeseToolInventory.test.ts
FAIL src/scripts/__tests__/generateReeseBehaviourInventory.test.ts
FAIL src/routes/__tests__/mountLearnerPortalRoutes.test.ts
```

None appears in this branch's 44-file diff. But "it is not in my diff" is an argument, not
evidence, so the three were run at a **detached checkout of clean `origin/main`** and fail
identically there: `3 failed, 14 passed, 17 total`. The detached checkout was used rather than a
stash, because a `git stash push` with a clean tree stashes nothing and the paired `pop` then
steals another session's stash.

Two of them are byte-identical-render assertions on committed inventory markdown, and the third is
a source-text assertion on a route-mounting module. All three look like another session's
generated file drifting from its generator.

### The test-file typecheck gate needed the explicit heap

`scripts/checkTestTypecheck.js` dies at the default heap after roughly 490 seconds and — this is
the trap — the harness around it has historically reported that crash as **"0 problems"**, which
reads as a pass. It was therefore run with `NODE_OPTIONS=--max-old-space-size=8192`, and the
checker's own self-test (which exercises crash detection and the ratchet in both directions) was
run first.

This gate matters more than usual for this branch: the main `tsc` run uses `tsconfig.json`, which
excludes test files, so **the 13 new test suites in this change are checked only here.** The
ratchet fails a new file outright if it carries any type error — "fix them; do not add a baseline
entry" — so a pass means all 13 are clean, not merely tolerated.

### The ratchet found nine real type errors in my own test files

First run:

```
tsc completed in 59s (exit 2, heap 8192MB): 408 error(s) across 143 file(s)

3 baseline failure(s):
  src/services/__tests__/mayaPhoneConsentGate.test.ts: NEW file with 2 type error(s).
  src/services/__tests__/mayaSmsToolHonesty.test.ts:   NEW file with 2 type error(s).
  src/services/__tests__/mayaVoiceToolHonesty.test.ts: NEW file with 5 type error(s).
```

**This would have failed CI**, and nothing earlier in the run could have caught it: the backend
`tsc --noEmit` uses `tsconfig.json`, which **excludes test files**. Nine type errors sat in three
files whose 59 tests had been passing all along.

Two causes, one root:

- **`TS2493: Tuple type '[]' of length '0' has no element at index '0'`** — every spy was declared
  as `jest.fn(async () => ...)`, a zero-parameter implementation, and the mock factory forwarded
  arguments with `(...(a as []))`. jest then types `mock.calls` as an array of **empty tuples**, so
  every `mock.calls[0][0]` is a compile error.
- **`TS2352: Conversion of type 'undefined' ... may be a mistake`** — the same thing one step
  along: `.map((c) => c[0] as {...})` was casting from `undefined` rather than from a value.

Fixed at the declaration rather than papered over at the use sites: each spy now declares
`...args: unknown[]`, and the forwarding cast is gone. Both changes are runtime-identical, which
the suites confirm — **59 tests still pass**, unchanged.

Second run:

```
tsc completed in 48s (exit 2, heap 8192MB): 399 error(s) across 140 file(s)
test typecheck baseline: matched exactly, in both directions
EXIT=0
```

399 across 140 is the frozen pre-existing baseline; the drop from 408/143 is exactly my nine
across three files. The ratchet matching **in both directions** is the part that matters: it would
also have failed had a baseline entry been silently fixed and left in place.

An explanatory comment now sits above the spy block in each of the three files, naming the trap
and the fact that only this gate can see it.

## Diff scope

**44 files, every one under `backend/src/` or `docs/`.**

Nothing in `scripts/`, `nginx/`, `docker-compose*.yml`, `package.json`, `package-lock.json` or
`.github/`. No new dependency, no new env var, no schema migration. The one new table is created
lazily by `CREATE TABLE IF NOT EXISTS` on first use, following the existing
`maya_welcome_ledger` precedent, so `server.ts` is untouched.

That matters for CLAUDE.md's escalation boundary: none of the Strategic Decisions list is crossed.
No database engine or schema redesign, no new paid dependency, no production infrastructure
change, no AI model class change, and no module rewritten by more than a quarter.

## Playwright

**There is no Playwright coverage for any surface in this change.** `/tests/systemV2` covers none
of the site chat tools, the Maya capability layer, or the journey readiness reader. Every claim in
these logs rests on unit tests plus read-only production reads. Stated here so that the absence is
on the record rather than implied by silence.
