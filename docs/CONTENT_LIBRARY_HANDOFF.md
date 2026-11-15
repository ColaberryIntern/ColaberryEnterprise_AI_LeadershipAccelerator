# Content library - handoff

Marketing-ops tab, Basecamp list `10467338643`, group `10506782442` (LIB-1 … LIB-4).
Session `CC-20261102-k9r4`. Built by one `loop-architect` run across thirteen tasks.

**Where it is:** enterprise.colaberry.ai → Marketing → the **Library** card under SET UP.
The picker lives inside the post composer, beside the existing upload control, as
"Choose from library".

**Pull requests:**
[#3999](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3999)
(the thirteen-task build) ·
[#4014](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4014)
(the viewers) ·
[#4019](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4019)
(the build record)

---

## What it holds

One library with two kinds of thing, because the person looking for "the November ad" does
not know or care which it is:

| | |
|---|---|
| a **file** | bytes on the existing uploads volume, `storage_key` set, no `source_url` |
| a **link** | a URL nobody stored, `source_url` set, no `storage_key` |

`kind` says which, and a database CHECK constraint makes every other combination impossible
to write.

## How to test it

1. Open Marketing, then the Library card under SET UP. The grid shows the brand's assets.
2. Paste a YouTube URL into the add-a-link box. Its real thumbnail should appear, pulled
   from the video id.
3. Click that video. It should play inside the app rather than opening YouTube.
4. Drag an image **under 1 MB** onto the grid. It should upload and appear. Over 1 MB, see
   Known limitations.
5. Click an asset and edit its alt text and tags in place. Reload; the edit should persist.
6. Start a new post and press "Choose from library". Pick an asset already in the library.
7. Confirm that picking it did **not** create a second copy in the library.
8. Archive an asset. It should leave the grid while any post already using it keeps working.

## What is verified, and what is not

| Claim | How it was checked |
|---|---|
| The database refuses a malformed row | Probed against real Postgres: a link carrying a `storage_key`, a file with no `storage_key`, and a link with no `source_url` were each refused, with controls proving valid rows still insert |
| The code is actually served to a browser | All four viewer branches found in the JS bundle nginx serves, fetched over the public hostname, with a control string absent from the same chunk |
| The library holds real, playable data | 9 link rows each resolving to an 11-character YouTube id, and 2 `video/mp4` rows with a storage key |
| A person can play a video | Ali confirmed it on 2026-11-15. The only check a machine could not run |
| Picking reuses an asset instead of copying it | Unit tested: the operation writes a `content_item_media` join row and no new `media_assets` row |
| Uploads over 1 MB | **NOT verified, and expected to fail.** See below |
| End-to-end browser automation | **NOT run.** Playwright coverage does not reach these screens |

## Known limitations

- **An upload over 1 MB is refused by nginx at the edge**, with an HTML 413, before the
  application sees the request. The raise in `nginx/nginx.conf` is a regex location matching
  only `^/api/admin/content/[0-9a-f-]{36}/media$`, and the library's upload path does not
  match it. `nginx/` is escalation-tier under `CLAUDE.md`, so this is the DRI's call: one
  location block, the same shape as the two already there. Since Sohail uploading his back
  catalogue is the point of the feature, it will bite on his first real ad. **LIB-3 is
  deliberately left open on this.**
- The composer picker has **no playback affordance**. Clicking a tile selects it, which is
  correct for picking, but there is no way to preview a video from inside the picker.
- **Rights warn, never block.** An asset with expired rights is still selectable and shows a
  warning. A deliberate decision, not an oversight.
- A **tenant-level link with no brand can be added twice**. The de-duplication index
  deliberately mirrors an existing documented trade-off at `ensureContentOsSchema.ts:169-178`:
  duplicate tenant-level assets are a tidiness problem, where de-duplicating across brands
  would be a confidentiality one.

## If something looks wrong

- **The Library card is missing** - a merged frontend change is not live until nginx rebuilds.
  Confirm the deploy ran, not just the merge.
- **An upload fails with a plain HTML error page** rather than an in-app message - that is the
  1 MB edge refusal above, not an application bug.
- **A YouTube thumbnail does not render** - `parseVideoUrl` requires an 11-character video id.
  A shortened or malformed URL yields no id and falls back to a plain link.
- **A video shows "Preview unavailable"** - the signing of the file URL failed, or the asset is
  a PDF. The viewer says what the asset is rather than showing a broken frame.

## Rollback

Production runs in **registry mode**, which pulls CI-built images rather than building on the
box, so there is no rollback to a previous image without setting `DEPLOY_MODE=build`. The
route back is to revert the commit on `main`, let CI publish a new image, and deploy it via
`scripts/deploy-prod.sh` - backend first, then nginx, never two concurrent `compose up`.
