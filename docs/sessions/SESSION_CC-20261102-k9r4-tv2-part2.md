# CC-20261102-k9r4 - TV-2 part 2: remove the Colaberry TV manage surface

**Date:** 2026-11-17 (Central)
**Workstream:** Marketing ops (BC list 10467338643)
**Ticket:** TV-2 (10511762367), due 2026-12-05

## Why this waited for a session that could run the suite

TV-1 pointed Colaberry TV at the Colaberry Training library, which left a whole manage surface
reachable from nowhere. Part 1 deleted the frontend half on 16 Nov. Part 2 is the backend half,
and the ticket deliberately held it back: the symbols to remove share files with the LIVE path,
and the suites protecting that path are the very files the removal has to edit. Editing them
blind, against the tests that would otherwise catch a mistake in them, is how a deletion ships
green while silently removing coverage.

**This session could run them**, via a clean `git worktree` at `origin/main` outside OneDrive with
the hoisted `node_modules` junctioned in. Jest runs in about two seconds. See the honest limits at
the bottom: it is not a full substitute for CI.

## The trap, and the proof it did not fire

`canManageTv` lives in `colaberryTvHandlers.ts` beside the dead `manageHandlers`, and is still
called by the live GET route to compute `can_manage` - the only thing deciding whether the Manage
button renders for staff. Deleting that file as "dead code" removes the button for everyone, with
nothing failing.

So it was kept, and then **the coverage protecting it was proven live rather than assumed**: with
`canManageTv` planted to fail OPEN (`return true` on both paths), three tests failed across the
two surviving suites, including the fail-closed case. Reverted, all 19 pass again. A kept function
with dead tests around it would have looked identical without that check.

## What went

**Deleted outright**

- `backend/src/routes/admin/colaberryTvAdminRoutes.ts` (the whole `/api/admin/colaberry-tv` router)
- `backend/src/services/colaberryTv/tvOembed.ts` (its only caller was the write path)
- `backend/src/services/colaberryTv/__tests__/tvService.test.ts` (all 10 cases drove writes)

**Trimmed, live path intact**

| File | Kept | Gone |
|---|---|---|
| `routes/colaberryTvRoutes.ts` | `getTvRoute`, the GET mount | 5 manage routes, `portalManage`, `wrap`, 5 exports |
| `routes/colaberryTvHandlers.ts` | **`canManageTv`** | `manageHandlers`, `toManageList`, `ManageVideo`, helpers |
| `services/colaberryTv/tvService.ts` | **`listForViewer`** | `addShort`, `updateShort`, `reorderShorts`, `removeShort`, `listAll`, the audit/title machinery |
| `services/colaberryTv/tvModel.ts` | `TvViewer`, `TvVideo`, `parseYoutubeId`, `displayTitle` | `AUDIENCES`, `TvAudience`, `TvVideoRow`, `audienceSees`, `toViewerList`, `nextPositions`, 4 Zod bodies |
| `routes/adminRoutes.ts` | - | the import and the mount |
| `middlewares/mgmtSectionGate.ts` | - | the `/api/admin/colaberry-tv` PATH_SECTION row |
| `frontend/services/colaberryTvApi.ts` | `getTv` | (already trimmed in part 1; its docstring was stale and is corrected) |

`displayTitle` now takes `{ title: string | null }` instead of `Pick<TvVideoRow, 'title'>`, because
`TvVideoRow` described a table nothing reads and its only caller passes a library asset's
`alt_text`.

## The test count, stated rather than left implicit

The ticket asks for this explicitly, because a deletion that quietly drops coverage should be
visible in review. Measured by running each suite against `origin/main` and again after:

| Suite | Before | After | Removed | Added |
|---|---|---|---|---|
| `colaberryTvAuth.test.ts` | 24 | 13 | 23 | 12 |
| `colaberryTvRoutes.test.ts` | 27 | 6 | 23 | 2 |
| `tvModel.test.ts` | 27 | 19 | 11 | 3 |
| `tvService.test.ts` | 10 | 0 (deleted) | 10 | 0 |
| **TV total** | **88** | **38** | **67** | **17** |

`ensureColaberryTvSchema.test.ts` and `tvLibrarySource.test.ts` are untouched (12 between them),
so the six TV suites go **100 tests to 50**, and six suites to five.

**17 of the removals are replaced by assertions that the removal happened**, which is the part
worth arguing for. A deleted test proves nothing. Instead:

- every removed route must now answer **404**, not 401 or 403 - with and without a valid token, so
  the removal is the route being absent rather than a gate refusing
- `colaberryTvRoutes` must export `getTvRoute` and none of the five manage handlers
- `tvService` must export no write function
- `tvModel` must export none of the retired playlist symbols
- requiring `tvOembed` or the admin router must throw

If any of them is reintroduced without its gate, those fail.

## Deliberately NOT done

**The `colaberry_tv_videos` table stays, and so does `ensureColaberryTvSchema.ts` with its test.**
Dropping the table is a schema change and ESCALATE-tier under CLAUDE.md, and it holds the only
record of the nine hard-coded seeds. It is the rollback if the library turns out to be the wrong
source. The ensure function now has **no caller at all** - that is intended, not an oversight, and
is noted in `tvService.ts` so the next reader does not "clean it up".

## Honest limits of the local run

- **Local `tsc` is not usable here and was not used.** The junctioned root `node_modules` carries
  TypeScript **4.9.5** while `backend/package.json` requires **^5.7.3**, so `tsc --noEmit` fails
  inside `node_modules` typings (zod v4, d3) and says nothing about this change. Typecheck is
  CI's gate, on both stacks.
- Jest therefore compiled these suites with 4.9.5 via ts-jest rather than the backend's 5.7.3. The
  TV code uses no 5.x-only syntax and the suites ran clean, but this is a weaker toolchain than
  CI's and is reported as such.
- **Two suites fail in the worktree and are NOT mine**: `mgmtRbac.test.ts` (2 cases, an extra
  `leads` section) and `mountLearnerPortalRoutes.test.ts` (1). Established by reverting my files to
  `origin/main` and re-running - they fail identically. Neither references Colaberry TV.
  `mountLearnerPortalRoutes` has zero matches for `colaberryTv`. They pass in CI, so they depend on
  environment the worktree does not have (it has no `.env`).

## What CI caught that the local run did not

`identifierPrecedence.test.ts` keeps a tripwire naming every non-test file that constructs a
subject key. `colaberryTvRoutes.ts` was on that list, because the portal manage gate built
`enrollment:<id>` as the audit actor. Removing the gate means the file constructs nothing, and the
list still named it, so the scan and the expectation disagreed.

**The tripwire guards both directions**: a file that STOPS constructing a key fails exactly as
loudly as one that starts. Its own comments record it firing on two earlier sessions whose authors
did not know it existed. This is the third.

The miss was one of SCOPE, not method. The local run covered the TV, middleware and route suites -
not the whole backend - so a tree-scanning test outside those paths was invisible. The entry is
removed with the reason recorded, and the full backend suite was then run locally.

### Reading the local full-suite result honestly

The full local run shows **17 failing suites**, and none of them is this change:

- **14 fail identically on pristine main** in this worktree, established by reverting every file I
  touched to `origin/main` and re-running. They include `adminRoutes.test.ts`, `mgmtRbac.test.ts`
  and `mountLearnerPortalRoutes.test.ts`. `adminRoutes.test.ts` was the one worth checking, since
  this change edits `adminRoutes.ts` - it fails without the change too.
- **3 `careerPrep` suites** fail only in the full parallel run and pass in isolation WITH this
  change applied (8 suites, 94 tests green), taking 7+ seconds each under load. That is
  contention, not a regression.

All of them pass in CI, so they depend on environment the worktree does not have.

## A near-miss worth recording: two shared files had moved

`adminRoutes.ts` and `mgmtSectionGate.ts` are not owned by this change - PR #4178
(capability-confirmation-route) added an import, a mount and a `PATH_SECTION` row to them after
this branch's base commit. The worktree was created at the older `main`, so pushing my copies
would have **silently reverted someone else's merged work**.

Caught by `git status` showing `MM` on exactly those two files after a baseline restore. Both were
re-taken from current `origin/main` and the two removals re-applied on top, then verified: #4178's
lines are still present and the Colaberry TV mount and row are gone.

## Still to verify after deploy

The ticket's acceptance #3, which no test can stand in for: on the live campus, **the TV still
plays the library AND the Manage button still renders for a Marketing-tab user**. Check the button,
not just the playlist - it is the thing most likely to be broken by this cleanup, and `can_manage`
is the single value it depends on.
