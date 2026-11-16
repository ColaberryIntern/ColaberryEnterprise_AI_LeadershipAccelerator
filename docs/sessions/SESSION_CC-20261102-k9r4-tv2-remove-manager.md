# TV-2 (part 1 of 2) — the dead campus playlist editor is gone

**Session:** CC-20261102-k9r4 · 16 November 2026
**Ticket:** [TV-2](https://app.basecamp.com/3945211/buckets/7463955/todos/10511414387) — see the Marketing list

## What this removes

TV-1 pointed Colaberry TV at the Colaberry Training library and sent the Manage button to
`/admin/marketing/library`. That left the in-campus playlist editor mounted nowhere and reachable
from nothing:

| Removed | Why it is dead |
|---|---|
| `frontend/src/components/campus/now/TvManager.tsx` (102 lines) | The modal. Nothing has mounted it since TV-1. |
| `frontend/src/components/campus/__tests__/tvManager.test.tsx` (**8 tests**) | Its suite. Tests of a deleted component. |
| `getManaged`, `addShortLink`, `updateShort`, `reorderShorts`, `removeShort`, `tvError` and the `ManagedShort` / `ManagedList` / `TvAudience` types in `colaberryTvApi.ts` | Searched the whole frontend: **zero callers**. They existed only for the modal. |

**Coverage removed: 8 tests**, all of them exercising the deleted component. Stated explicitly
because the ticket asks for it: a deletion that quietly drops coverage should be visible in review,
not inferred.

## The coupling that would have turned CI red

`TvManager.tsx` is listed in `frontendTypographyBaseline.json` with **2 emoji** against
`house-style-emoji`. The typography lint fails when a baseline file has FEWER violations than
recorded — and a file that no longer exists has zero. It separately asserts that the summed
baseline equals `FRONTEND_TYPOGRAPHY_BASELINE_TOTALS`.

So three edits are one change:

1. delete the file,
2. delete its entry from the JSON,
3. move the emoji total **659 → 657** in `frontendTypographyBaseline.ts`.

Doing any of them alone fails the build, with a message about typography that says nothing about
the deletion that caused it. The entry is DELETED rather than zeroed, which is the convention that
file documents for itself: a file that no longer exists should not stay on the books owing
anything. No copy was rewritten — the ratchet turned because the surface went away.

Verified after the edit: dash 2096, escaped-dash 68, emoji 657, each matching its recorded total.

## Why this is part 1, and what part 2 is

The ticket's scope also covers the backend manage surface: the `/manage` routes in
`colaberryTvRoutes.ts`, `manageHandlers` in `colaberryTvHandlers.ts`, the write functions in
`tvService.ts`, `colaberryTvAdminRoutes.ts`, the now-unused halves of `tvModel.ts`, and
`tvOembed.ts`.

**That half is deliberately not here.** Those symbols live in the same files as the LIVE TV path —
`getTvRoute`, `canManageTv` and `listForViewer` — and the suites that protect that path
(`colaberryTvRoutes.test.ts`, `colaberryTvAuth.test.ts`, `tvService.test.ts`) are the very files
the removal has to edit. This session has no local jest, so those edits could only be made blind,
against the tests that would otherwise catch a mistake in them.

The frontend half has no such entanglement: the deleted component is self-contained, its callers
are provably zero, and the two remaining campus suites mock this client with `requireActual` and
override only `getTv`, so dropping the other exports cannot reach them.

**`canManageTv` must survive part 2.** It lives in `colaberryTvHandlers.ts` and is still called by
the live GET route to compute `can_manage`, which is the only thing deciding whether the Manage
button renders at all. Deleting that file as "dead code" would quietly remove the button for every
staff member, with nothing failing.

## Verification

**Not run locally** — no jest, no tsc in this session. Every file was fetched from `main`; the
baseline edit was applied programmatically with assertions (it refuses unless TvManager holds
exactly 2 emoji and the new sum is exactly 657) rather than hand-edited across a 52KB JSON file.
**CI is the gate.**

Expect the backend suite total to fall by **8 tests** and by one suite. If it falls by more than
that, something else was removed and the change should not merge.
