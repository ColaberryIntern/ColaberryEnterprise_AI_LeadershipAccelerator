# Session CC-20261102-k9r4 — Colaberry TV plays the media library

Ali, 2026-11-15: *"Can you make Colaberry TV get populated by Colaberry Training videos that are in
the library. Instead of having to manage them in two places ... Colaberry TV should not change -
Only the Manage button takes you to the admin screen marketing ... Of course only staff that has
access to marketing tab can see the button."*

---

## What the two places actually were

Not what the name suggested. `network_videos` (348 rows, ingested from CCPP SQL Server) feeds the
**testimonial card in the student timeline**, not the TV. The TV reads its own table,
`colaberry_tv_videos`, which `ensureColaberryTvSchema` **seeded with nine hard-coded YouTube ids** —
that is the "1 OF 9" on screen. The second place to manage videos was the `TvManager` modal that the
Manage button opened inside the campus.

## What changed

`backend/src/services/colaberryTv/tvLibrarySource.ts` (new) reads every live `kind = 'link'` asset
of the Colaberry Training brand and maps it to a short. `listForViewer` now returns that instead of
the table. The brand comes from `COLABERRY_TV_BRAND_SLUG` (default `colaberry-training`), resolved
by slug at read time rather than a hardcoded uuid.

`ColaberryTv.tsx` is **untouched**, which is the literal reading of "should not change". The Manage
button already called an `onManage` prop; only what that prop does changed, one level up in
`ColaberryNow.tsx` — it now opens `/admin/marketing/library` in a new tab instead of mounting the
modal. A new tab on purpose: the campus is a modal over the map, so navigating in place would throw
away where someone was.

The permission requirement needed no work. `can_manage` already comes from `canManageTv()`, which
checks the enrollment's management sections include `campaigns` — and `campaigns` *is* the Marketing
tab (`adminNav.ts` comments that this must not become `'marketing'`). Reused, not reinvented.

## The decision Ali made

The library holds 9 YouTube links and 2 uploaded mp4s, all Colaberry Training. The TV builds its
player from `youtube-nocookie.com/embed/<id>` and its thumbnails from `img.youtube.com/vi/<id>`, so
an mp4 has nothing to render. "Every video that is there" and "Colaberry TV should not change"
therefore collide. Asked rather than guessed; Ali chose **YouTube links only**. The mp4s stay in the
library for use in posts and never reach the TV.

## Two traps worth keeping

**The same video can be in the library twice.** The unique index is on `(brand_id, source_url)`, so
one short pasted with different `?si=` tracking parameters is two legitimate rows and one video. The
player follows the playing item **by id** across its 30-second poll, so a duplicate would show the
short twice and could restart playback. Deduplicated by parsed video id, newest wins.

**Renaming `listForViewer` would have been the expensive mistake.** It looked like a private helper.
It has a second production caller (`colaberryNow/happeningService.ts`) and is mocked *by name* in
two route test files. Keeping the signature and changing only the body turned a sprawling rename
into a two-line diff. The `viewer` parameter is now `_viewer` and deliberately ignored: the library
has no audience concept, so every short is on for everyone.

## Not done, deliberately

The write surface — `colaberry_tv_videos`, the portal and admin `manage` routes, `TvManager.tsx` and
their four test files — still exists and is now unreachable from the campus. Removing it is a
follow-up rather than part of this change, because it would mean deleting or rewriting four test
suites in a session that cannot run jest locally. Until then, nothing reads what those routes write.

## Verified, and not

CI is the gate: `tsc --noEmit` on both stacks, and jest. New unit tests cover the mapping, the
non-YouTube drop with a control proving the filter is not vacuous, the de-duplication, the neutral
title fallback, an unresolvable and an ambiguous brand, and a database failure surfacing rather than
blanking the playlist. **Not verified:** nothing is deployed at the time of writing, and no Playwright
coverage reaches the campus TV.
