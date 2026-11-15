# CC-20261102-k9r4 — Library viewers: play the video in the app, and view mp4 and images

- [x] Library assets play and preview in the app
  - Date: 2026-11-13
  - Session: CC-20261102-k9r4
  - What changed: The library grid rendered a still thumbnail that did nothing when clicked.
    Links now play through the app's own player (`components/timeline/VideoEmbed`), mp4 files
    get a native `<video controls>` pointed at a NEW signed, time-limited url on the list
    response, images preview and open full size, and anything else says what it is plus
    "Preview unavailable" where a url is missing. `storage_key` is still never sent to the
    browser.
  - Verification: PR #4014, all 10 CI gates green at `c5e5a842`; `AssetViewer.test.tsx`
    confirmed EXECUTED (22 tests passed) rather than skipped;
    `mediaLibraryService.test.ts` green with the key-set guard widened to allow `url` AND
    asserting a link still carries none. Deployed to production from `22f3efae` (backend
    then nginx, registry mode, both images matching `sha-22f3efae…`); all four viewer test
    ids present in the bundle nginx actually serves
    (`/static/js/4659.148f52ea.chunk.js`), with a never-present control string absent from
    the same chunk. Live data confirmed by query: 9 link rows each yielding an 11-character
    YouTube id, 2 `video/mp4` rows with `storage_key` set, alt text on all 11, and an
    empty-tenant control returning 0.
  - Notes: NOT verified — a person clicking play in a browser. Everything above proves the
    code is served and the rows are playable; it does not prove the frame renders.

## Two traps this run walked into, recorded so the next one does not

**The image build was cancelled twice before it ran.** PR #4014 merged as `5ab03070` at
16:40 CT; PR #4017 merged 50 seconds later and cancelled `5ab03070`'s backend and nginx
builds. The replacement build on `42b6feef` was cancelled the same way two minutes after
that. Only the fourth run, on `22f3efae`, survived. A deploy issued in that window would
have pulled a `sha-` tag that was never published, and in registry mode that is a no-op
that still reports success. **Waiting on a specific run id is the wrong shape** — the id to
wait on changes under you with every merge. Follow the LATEST run and require that its
head equals current `main`.

**Two controls in this run were wrong, in opposite directions.**

1. `grep -rl 'zzzNotHereMarker' … | head -2 && echo FAILED || echo ok` always printed
   FAILED: a pipeline's status is the LAST command's, and `head` exits 0 whether grep
   matched or not. The positive check next to it was sound only because it was gated on
   printed filenames rather than an exit status.
2. Asserting `onWatchBeat` is absent from the shipped bundle is not a test of anything we
   control: it is `VideoEmbed`'s own prop name and is in the chunk because the component
   is. The real assertion is that the library page does not PASS it, which is a source
   check (`AdminMediaLibraryPage.tsx:410` passes `source`, `title`, `poster` only) plus the
   unit test that asserts the prop's absence.

Both are the same mistake: a check whose failure mode is invisible. Aim each one so it can
fail, then believe only what it says.

## PR and ticket
- PR: https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4014
- Basecamp: LIB-3 library screen, todo 10506782489
