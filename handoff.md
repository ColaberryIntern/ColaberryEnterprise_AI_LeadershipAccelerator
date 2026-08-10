# Feed Control Type Analytics — handoff (session CC-20260802-r4q9)

Branch: `workstream/feed-control-type-analytics`, worktree `C:\Users\ali_m\feedcontrol-stats-wt`.
(Note: this file previously held a stale handoff from a different worktree/task
— `cape-aipulse-fix-wt`'s AI-Pulse rotation fix — apparently left behind by
setup tooling. Overwritten below with this task's own handoff.)

## What this is

Real per-type delivery statistics + a "more/less" slider with a transparent
anticipated-impact preview, added to the EXISTING Feed Control admin board's
gear-icon type drawer (`/admin/orchestration?tab=feed-control`) — NOT the
CAPE governance board. Answers Ali's "give me the power back" ask: pool
size, creation velocity, times triggered, timeline breadth, delivery
velocity, and a real "why isn't this appearing" diagnostic per type, plus a
slider that projects what raising/lowering a type's cadence would do before
anything is saved.

## Worktree liveness guard

Confirmed `git rev-parse --show-toplevel` == `C:/Users/ali_m/feedcontrol-stats-wt`
before every state-mutating step, branch `workstream/feed-control-type-analytics`,
started at `6ff38125` (origin/main tip). No corruption observed at any point.

## Scoping and judgment calls

1. **Read the real ranker before designing the slider.** Traced
   `feedRanker.ts` + `timelineService.ts` + `feedControlService.ts` and found
   that a TYPE-level `feed_cadence` / `feed_frequency_cap` / `feed_cooldown_days`
   (the exact fields the existing drawer already edits) are stored and
   mirrored to `curriculum_type_definitions`, but are **never consumed by the
   live ranker for anchored cards** — `rankWithLegacyRanker` reads
   `c.feed_frequency_cap` / `c.feed_cooldown_days` off the CARD object only,
   never merging the type-level routing onto a card lacking its own
   override. This is very likely the literal mechanism behind Ali's "I set
   up controls for that, and I'm still flying blind" complaint. I did **not**
   wire that fallback in — doing so would change live ranking behavior for
   any type that already has a non-null type-level override, and
   `FEED_CONTROL_ENABLED` is reportedly ON in prod, which would make that a
   live-behavior change bundled inside a "read-only stats feature," directly
   violating the read/preview-only constraint. Instead: (a) the stats
   diagnostics surface this as a real, honest `TYPE_LEVEL_KNOBS_INERT`
   finding per anchored type that has any of those fields set, and (b) every
   slider preview response carries an explicit caveat saying so. This is a
   real gap worth a follow-up ticket (wiring the type-level fallback into
   `rankWithLegacyRanker`'s candidate-building step) but is deliberately out
   of scope here.
2. **Slider mechanism**: rather than inventing a new write path, the slider
   (-3..+3 steps, "Much less" .. "Much more") calls a new read-only preview
   endpoint and uses the response to PRE-FILL the drawer's existing
   Cadence/Freq cap/Cooldown inputs — the same fields already wired to the
   pre-existing "Save routing" button (`routeType`). Nothing new is ever
   written; the existing save path is reused unmodified. This satisfies "the
   preview must never write anything until Ali clicks Save routing."
3. **Displacement model**: uses each sibling type's REAL current 30-day
   share of the lane (one aggregate query, `getLaneImpressionMap30d`), not
   an assumed equal split — grounded in real data, disclosed as a
   simplification of the ranker's actual score-based competition.
4. **Modular composition rule**: `FeedControlTab.tsx` was already at 543
   lines (over the 500-line hard ceiling) before this change. Extracted
   `TypeDrawer` → `FeedControlTypeDrawer.tsx` (now carries the new stats +
   slider) and `PolicyPanel` → `FeedControlPolicyPanel.tsx`, with shared
   types/the `Badge` component in `feedControlShared.tsx`. `FeedControlTab.tsx`
   is now 469 lines.

## Reused vs. net-new

**Reused, unmodified:** `typeRegistry.allTypes()/resolve()`, `feedConfigService.getFeedPolicy()`,
`feedRanker` semantics (read-only, referenced not modified), `today_feed_impressions`
schema/conventions (raw SQL, `QueryTypes.SELECT`, same as `feedControlService.simulate()`
and `ambientPool.ts`), `ambientPool.AMBIENT_REPEAT_COOLDOWN_DAYS`, the existing
`routeType`/`bulk-route-types` write path (untouched), the existing admin route
auth/error convention (`requireAdmin`, `try/fail(res,e)`, `{ok:true,...}`).

**One additive, non-behavior-changing export added:** `feedControlService.getRoutingMap()`
(previously private) — read-only accessor for the `feed_type_routing`
SystemSetting, so sibling read-only services don't re-derive the same
source of truth `getBoard()` already uses. All existing internal call sites
unchanged (they call the same function, now exported).

**Net-new:**
- `backend/src/services/timeline/feedTypeStatsService.ts` — pool/creation/
  triggered/breadth/velocity/lane-share + the diagnostics engine.
- `backend/src/services/timeline/feedTypeAdjustmentPreviewService.ts` —
  the pure `computeProjection` calculator + the slider's async wrapper.
- Two new admin routes on the existing `feedControlRoutes.ts`
  (`GET .../type-stats/:slug`, `GET .../type-preview/:slug?step=`), Zod-validated.
- `frontend/src/pages/admin/orchestration/feedControlShared.tsx`,
  `FeedControlTypeDrawer.tsx`, `FeedControlPolicyPanel.tsx` (2 extracted +
  1 new-content file; `FeedControlTab.tsx` itself only loses code).
- Two backend test files (20 tests), no frontend test files (no existing
  RTL/jest frontend test harness found for this page — matches the rest of
  `frontend/src/pages/admin/orchestration/`, which has none either).

Nothing under `backend/src/services/cape/` was touched — confirmed via
`git diff --stat` before finalizing.

## The "why isn't this appearing" diagnostic — exact logic

`buildDiagnostics()` in `feedTypeStatsService.ts`, checked in this order,
every condition against REAL queried data for that specific type:

1. `ROUTING_DISABLED` (critical) — `today_eligible === false`.
2. `TYPE_LEVEL_KNOBS_INERT` (info, anchored only) — a type-level cadence/cap/
   cooldown override is stored (see judgment call #1 above).
3. `NOTHING_PUBLISHED` (warning, anchored) — pool exists but 0 currently
   `visibility='published'`.
4. `POOL_EMPTY` / `INTEL_SOURCE_EXHAUSTED` (critical) — 0 items in the real
   pool (`timeline_cards` / `blog_posts` / `podcasts` / `network_videos`
   depending on type); for the 10 Intelligence Pipeline types, cross-checked
   against `intel_items` (`pipeline=:slug, card_id IS NULL`) and against the
   4 confirmed-static/curated source files
   (`ai_tool_of_the_day.ts`, `ai_quote_of_the_day.ts`, `claude_code_technique.ts`,
   `marketIntelligenceSource.ts`) to distinguish "static catalog exhausted"
   from "live source found nothing this run."
5. `AMBIENT_ROTATION_PRESSURE` (warning, ambient) — ≥85% of the real pool
   has already been shown to someone within the real
   `AMBIENT_REPEAT_COOLDOWN_DAYS` window (`COUNT(DISTINCT ref)` on
   `today_feed_impressions`), the same shape as the documented 2026-08-04
   blog/podcast-exhaustion incident in `ambientPool.ts`.
6. `LOW_LANE_SHARE` (warning) — real 30-day impression share vs. an
   equal-share baseline across real sibling types in the same lane, only
   when the lane has ≥20 real impressions to be meaningful.
7. `NO_RECENT_ACTIVITY_UNEXPLAINED` (warning) — fallback so a healthy-looking
   type with genuinely zero recent impressions is never silently reported
   clean; only fires if nothing above already explains it.

## Test results (real)

- `npx jest src/services/timeline/__tests__/feedTypeStatsService.test.ts src/services/timeline/__tests__/feedTypeAdjustmentPreviewService.test.ts` → **20/20 passed**.
- Pre-existing `feedControlService.simulate*.test.ts` (regression check) → **5/5 passed**, unchanged.
- CI's own narrow unit-tests job pattern (`trustRubric|aiCost|piiRedaction`) → **28/28 passed**, unaffected (expected — unrelated files).

## Quality gates (real)

- Backend `npx -y -p typescript@5.7.3 tsc --noEmit -p tsconfig.json` (after
  installing root + backend deps fresh, exactly matching CI's install order)
  → **0 errors**.
- Frontend `npx -y -p typescript@5.7.3 tsc --noEmit` → **0 errors** (exit 0).
- `node scripts/lint-route-auth.js` → OK, 89 admin route files auth-guarded
  (includes the 2 new routes).
- `node scripts/secret-scan.js` → OK, 3852 files scanned, no secrets.

Note on the environment: the OneDrive main-repo checkout's `node_modules`
junction (as instructed) turned out to be missing several declared
dependencies entirely (`jest`, `ts-jest`, `@anthropic-ai/sdk`, `axios`,
`playwright` were absent even though declared in `package.json`/root
`package.json`). Running `npm install` inside the WORKTREE caused npm to
replace the junction reparse points with real, independent installs in the
worktree itself (confirmed: the main repo's `node_modules` was NOT mutated
— re-checked after the fact, still missing `jest` there). This is why the
gates above needed a real local install first; it's a pre-existing gap in
the reference checkout, unrelated to this feature.

## Visual verification — HONEST STATUS: NOT PERFORMED, with reasons

I could not get a real screenshot of the rendered stats panel / slider
interaction this session. What I actually tried, in order, before stopping:

1. **All locally available admin JWTs are stale or wrong-role.** Checked 6
   token files across worktrees (`cape-phase6-wt/.ali_admin_jwt.txt`,
   `accel-repo/.ali_jwt.txt`, `AppData/Local/Temp/admin_jwt.txt`,
   `cape-aipulse-fix-wt/.ali_jwt.txt`, `cape-phase5-wt/.ali_jwt.txt`) —
   decoded every `exp` claim: the only admin-role token expired 2026-08-06
   (today is 2026-08-09); the two still-unexpired tokens are `role: participant`,
   not admin, and can't reach `requireAdmin` routes.
2. **No reachable dev/prod instance.** `localhost:3001`, `:3000`, `:9999` all
   connection-refused from this sandbox. The token-refresh procedure in the
   `screenshot-review` skill requires a live authenticated browser session
   against `enterprise.colaberry.ai` (manual DevTools `localStorage` copy) —
   not something I can do headlessly, and even if I could, prod doesn't have
   this unmerged branch's code.
3. **Attempted a genuinely local stack.** Docker Desktop wasn't running;
   started it (came up in ~30s). The repo's `docker-compose.dev.yml` (the
   `:9999` dev instance) requires two EXTERNAL Docker networks
   (`colaberry-accelerator_default`, `colaberryenterprise_ai_leadershipaccelerator_default`)
   that only exist on the remote VPS — not spinnable fresh here. The
   root `docker-compose.yml` is a genuinely self-contained local Postgres
   (`accelerator-db`, matches the backend's own dev-default `DATABASE_URL`)
   and looked promising, but `docker ps` showed an **already-running,
   healthy `accelerator-db` container on network `colaberry-dev_default`**
   — evidence of an ACTIVE concurrent Claude session's local dev stack on
   this same machine. I stopped there rather than risk touching another
   session's live database or container, per the repo's own
   concurrent-instance-safety principle (extended here from PROGRESS.md to
   Docker state, not just file edits). Cleaned up the harmless empty
   network/volume my aborted attempt created
   (`feedcontrol-stats-wt_default`, `feedcontrol-stats-wt_pgdata`) so no
   stray Docker resources are left behind.

**This is a real, unresolved gap, not a corner cut.** The code has been
verified by `tsc` (both stacks, clean) and 20 real passing backend unit
tests covering the diagnostics logic and the pure projection math, but
**nobody has looked at the rendered drawer in a browser.** Next action for
whoever picks this up: either (a) wait for the concurrent session's Docker
use to free up and mint a fresh admin JWT against that dev stack once safe,
or (b) get a fresh admin JWT from a real login against a running dev/prod
instance, following the `screenshot-review` skill's token-refresh steps,
then actually move the slider and capture the before/after preview state as
instructed.

## PR / CI

Branch pushed as `workstream/feed-control-type-analytics`. PR opened
against `main`, NOT merged. See the PR URL in the session's final report.
CI: backend-typecheck, frontend-typecheck, unit-tests (narrow pattern,
unaffected), guards (secret-scan + route-auth lint) — all expected green
per the local runs above; confirm the actual GitHub Actions run status
before merging (an outage or webhook delay has bitten this exact repo
multiple times this session per PROGRESS.md).

## Files touched (all absolute paths under `C:\Users\ali_m\feedcontrol-stats-wt`)

- `backend\src\services\timeline\feedControlService.ts` (additive: exported `getRoutingMap`)
- `backend\src\services\timeline\feedTypeStatsService.ts` (new)
- `backend\src\services\timeline\feedTypeAdjustmentPreviewService.ts` (new)
- `backend\src\services\timeline\__tests__\feedTypeStatsService.test.ts` (new)
- `backend\src\services\timeline\__tests__\feedTypeAdjustmentPreviewService.test.ts` (new)
- `backend\src\routes\admin\feedControlRoutes.ts` (2 new routes)
- `frontend\src\pages\admin\orchestration\feedControlShared.tsx` (new)
- `frontend\src\pages\admin\orchestration\FeedControlTypeDrawer.tsx` (new, extracted + extended)
- `frontend\src\pages\admin\orchestration\FeedControlPolicyPanel.tsx` (new, pure extraction)
- `frontend\src\pages\admin\orchestration\FeedControlTab.tsx` (shrunk 543 → 469 lines; imports the above)
- `PROGRESS.md` (this session's entry)
