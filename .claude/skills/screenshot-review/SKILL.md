---
name: screenshot-review
description: Capture production screenshots safely and build the per-sprint HTML review doc. Invoke for any sprint that ships user-facing portal UI changes, OR when a context-busting wide image risks killing the session.
user-invocable: true
---

# Screenshot Review — Capture + Review Doc Protocol

## When this skill applies

### Required for any sprint that:
- Changes a route, page, or component visible at `enterprise.colaberry.ai/portal/*`
- Adds a new surface (Cory Home, ExecutionLane, SystemView, Critique, Setup, etc.)
- Modifies UnifiedProjectState or other state surfaced on Cory Home
- Touches navigation, layout, or a verdict-bearing surface

### Not required for:
- Backend-only changes that don't surface to the user
- Internal scripts in `backend/src/scripts/` or `scripts/`

## Part 1 — Safe capture protocol

A prior session died because a single screenshot at 2128×266 pushed the cumulative many-image context past Claude Code's 2000px ceiling, and every reply after that hit the dimension-limit error. The verification workflow is now hardened.

### Hard rules (enforced)
- **Max safe width is 1800px.** Every PNG Claude will be asked to `Read` must be ≤1800px wide. Wider gets downscaled before it lands on disk.
- **Default capture viewport is `SAFE_VIEWPORT` (1440×900 at `deviceScaleFactor=1`).** DSF 2 (retina) is permitted only when the PNG will exclusively be embedded into a review-doc HTML for human inspection — never when Claude will `Read` it.
- **All capture scripts must route through `scripts/captureHelpers.js`.** Direct `page.screenshot(...)` calls in capture scripts are a violation. The helper provides `safeScreenshot`, `safeCrop`, `boundedFullPage`, and `maxWidthGuard`, each of which downscales in place if the captured PNG exceeds the safe width.
- **Three-image read budget per conversation turn.** Claude reads at most three PNGs in any single turn during verification. Subsequent images go through a focused crop, not a re-`Read` of the same surface.
- **`_summary.json` is mandatory.** Every capture batch writes `_summary.json` next to the PNGs via `writeCaptureSummary(...)`. Each entry must include `originalWidth`, `finalWidth`, `downscaled`. Any `finalWidth > 1800` is a process violation.

### The helper API
`scripts/captureHelpers.js` is the single sanctioned capture path:

| Export | Use |
|---|---|
| `MAX_SAFE_WIDTH` (=1800) | Hard cap referenced throughout |
| `SAFE_VIEWPORT` | Default: 1440×900, DSF 1 |
| `RETINA_REVIEW_VIEWPORT` | 1440×900, DSF 2 — review-doc embeds only |
| `createSafeContext(browser, { token, viewport, seededMemory, label })` | Playwright context with auth injected via `addInitScript`, viewport set per `label` |
| `safeScreenshot(page, outPath, { fullPage, clip, label })` | Wraps `page.screenshot`; downscales to ≤1800px after capture |
| `safeCrop(page, selector, outPath, { padding, label })` | Bounding-rect crop with width clamp |
| `boundedFullPage(page, outPath, { label })` | Full-page convenience that asserts DSF 1 |
| `maxWidthGuard(pngPath, { label })` | Standalone downscale check for non-Playwright captures |
| `writeCaptureSummary(outDir, entries)` | Writes `_summary.json` with `max_safe_width`, `safe_viewport`, the per-PNG `final_width` ledger |

Use `label: 'retina-review'` only for explicitly human-reviewed embeds; any other label routes through the safe-width clamp.

### Dependency
Depends on `sharp` (^0.33) at repo-root `devDependencies` for in-place PNG downscaling. Added 2026-05-16.

## Part 2 — Capture script invocation

The capture script lives at `scripts/captureProductionScreenshots.js`. It uses Playwright + a JWT token at `scripts/.ali_jwt.txt` (gitignored — never commit) to authenticate against `enterprise.colaberry.ai` and screenshot every primary surface.

```
node scripts/captureProductionScreenshots.js
```

Output lands in `docs/screenshots/<YYYY-MM-DD>-deploy/` as full-page PNGs. Override base URL with `CAPTURE_BASE` env, output dir with `CAPTURE_OUT`.

### Token refresh (when JWT expires)
1. F12 → Console (type `allow pasting` first to bypass Chrome's anti-XSS warning)
2. `copy(localStorage.getItem('participant_token'))`
3. Paste into `scripts/.ali_jwt.txt` (replace file contents)

## Part 3 — Review HTML structure

For each user-facing change shipped in the sprint:

1. **The live screenshot embedded inline** — wrapped in a dark frame card with URL caption + "open full size" link to the underlying PNG. Use the existing `.screenshot` CSS pattern in `docs/POST_DEPLOY_WALKTHROUGH.html`.
2. **Before/after pairs** when the change is a redesign.
3. **A clear caption** stating what the user is looking at.

### Per-stop pattern
- `① See it` — screenshot card + "Open in new tab" button to live URL
- `② What shipped here` — bullet list
- `③ Possible changes` — pre-flagged issues with checkboxes for operator investigation
- `④ Your verdict + notes` — 👍/⚠/✕ radio + free-form textarea

### Required interactions
- **Inline critique** — every section ends with a real `<textarea>` for operator notes without leaving the doc
- **Compile button** — at bottom, gathers all checkbox + radio + textarea state into a single Markdown prompt to paste back for the next sprint
- **Reset button** — clears state, fresh start

Reference implementation: `docs/POST_DEPLOY_WALKTHROUGH.html` (copy that pattern).

## Naming + location
- Walkthroughs: `docs/<SPRINT>_REVIEW.html` — one per sprint
- Screenshots: `docs/screenshots/<YYYY-MM-DD>-<context>/<NN>-<slug>.png`
- Token (gitignored): `scripts/.ali_jwt.txt`
- Capture script: `scripts/captureProductionScreenshots.js`

Screenshot folders may be committed if the operator decides. Token file may NOT.

## Why this protocol exists
1. **CSS mockups drift from reality.** Stakeholders sign off on wireframes, then prod looks different. Real screenshots eliminate that.
2. **Setup friction blocks review.** Without embedded screenshots, every reviewer needs the dev environment OR a production login. With them, the doc is self-contained.
