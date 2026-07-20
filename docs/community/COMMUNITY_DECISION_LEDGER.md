# Community — Decision Ledger

Session `CC-20260719-c3v8` · branch `workstream/community-social-experience-v1`
(based on `feature/community-home-integration`).

This ledger records the decisions that govern the Community module, their source,
the code that implements them, and whether the Design-E social-experience
expansion (PR 1) preserves, extends, or conflicts with each. Basecamp
(`https://3.basecamp.com/3945211/projects/47502609`) is source-of-truth #1 but is
**not reachable in this non-interactive session** — no Basecamp MCP is connected.
Items needing Basecamp confirmation are in `BASECAMP_CONFIRMATION_NEEDED.md`.

## D0 — Where the Community module lives (base-branch decision)

- **Decision:** The Community module is **not on `main`**. It ships across the
  `epic4-community-*`, `community-moderation-cohort-authz`, and
  `feature/community-home-integration` branches. `feature/community-home-integration`
  (updated 2026-07-16) is the most complete, most recent superset and is the
  canonical base.
- **Source:** git branch/commit archaeology (this session) + BC ticket refs in the
  commit trail (`10036783688`, `9985689739`, `10077100017`, `10077100033`).
- **Resolution (confirmed with Ali):** Branch PR 1 **from** and target the PR
  **back into** `feature/community-home-integration`. Do **not** branch off `main`
  (would build a duplicate — forbidden) and do **not** force the epic to `main`
  now (would disturb the flagged main↔staging split-brain a human manages).
- **Status:** Active. PR 1 preserves the module and extends it.

## D1 — Community content is cohort-scoped; cross-cohort is protected

- **Source:** REQ-C9, BC `10077100017`. **Code:** `communityService.ts`
  `resolveCohortId`, `requireVisiblePostInCohort` (403 for wrong-cohort, 404 for
  missing/removed), `getMemberProfileById` (404 for cross-cohort — anti-enumeration).
- **PR 1 impact:** **Preserved.** No read/write path was widened. New pagination
  keeps the same `cohort_id + status:'visible'` scope. Profile drawer calls the
  existing `getMemberProfileById`, inheriting its 404-anti-enumeration behavior.

## D2 — Comment depth is one reply level

- **Source:** BUILD_SPEC §7 / `CommunityComment` model. **Code:**
  `createComment` rejects reply-to-a-reply (`ValidationError`).
- **PR 1 impact:** **Preserved.** `PostCard` renders top-level + one reply level only.

## D3 — Pinning is author-controlled

- **Source:** v1 scope note in `togglePin`. **Code:** `togglePin` forbids non-authors.
- **PR 1 impact:** **Preserved.** Pin button shows only for `isAuthor`.

## D4 — Level gating is server-enforced (not CSS-hidden)

- **Source:** REQ-C4, BC `9985689739`. **Code:** `assertLevelUnlocked` (interactions)
  and `toFeedItem` (read → locked teaser with `body:null`, `media_urls:[]`).
- **PR 1 impact:** **Preserved.** `LockedPostBody` renders the teaser; the client
  never receives gated body/media. `viewer_has_liked` is computed only from real
  like rows and does not leak gated state.

## D5 — Likes are the points currency (1 like = 1 point), self-likes allowed once

- **Source:** REQ-C4. **Code:** `toggleLike` (unique constraint caps at one point;
  points/level recomputed on the target author).
- **PR 1 impact:** **Preserved — untouched.** PR 1 did **not** change point values,
  self-like rules, or level thresholds.

## D6 — Presence is a ~45s client ping; WebSockets are P2

- **Source:** approved P0 mockup note in `communityService.ts`. **Code:**
  `derivePresence` (90s online / 10min away), `touchPresence`.
- **PR 1 impact:** **Preserved.** Ping cadence unchanged; contacts rail renders the
  same derived presence.

## D7 — Categories: General / Wins / Support / Introductions

- **Source:** `communityApi.ts::COMMUNITY_CATEGORIES` + `PROGRESS.md` (Design-E entry).
- **PR 1 impact:** **Preserved.** Composer + filter pills use the same four values.
  Design-E display labels ("General Discussion", "Support Needed") and
  system-generated source categories (Build Logs / Showcase / Video Critiques) are
  **deferred** — they need a `source`/display-label change (see BUILD_PLAN slice 4).

## D8 — Leaderboard uses a real ranked endpoint with periods

- **Source:** REQ-C4. **Code:** `communityLeaderboardService.getLeaderboard`, route
  `/community/leaderboard?period=7d|30d|all_time`.
- **PR 1 impact:** **Preserved.** The prompt's worry that the UI faked the
  leaderboard from the first 10 directory members is **not true on this branch** —
  the real endpoint was already wired. No change needed.

## D9 — NEW (this PR): `viewer_has_liked` on posts + cursor pagination

- **Decision:** The post feed now returns a server-authenticated
  `viewer_has_liked` per post, and `listPosts` returns `{ posts, next_cursor }`
  (cursor keyset over `pinned, created_at, id`) instead of an unbounded array.
- **Rationale:** Phase-4 contract fixes. The old feed defaulted every post to
  "not liked" in transient React state (lost on refresh); the old feed loaded the
  entire cohort history in one request.
- **Contract change class:** This is a **coordinated breaking change** to
  `listPosts` (return shape) and `GET /community/posts` (adds `next_cursor`).
  Per root CLAUDE.md, all consumers were updated in the same diff: the route,
  `communityApi.fetchPosts`, `CommunityHomeWidget`, and the service unit tests.
  Response stays backward-readable — `data.posts` is still present.
- **Status:** Active. Verified by 33/33 `communityService` unit tests.

## D10 — NEW (this PR): additive Design-E surface, no new backend systems

- **Decision:** PR 1 adds only frontend surface (Avatar, media grid, composer,
  event strip, profile drawer, contacts rail, 3-column layout) plus the two
  contract fixes above. **No** DM schema, **no** cross-cohort discovery, **no**
  new points/notification/moderation systems.
- **Status:** Active. DMs + People discovery are PR 2 (see BUILD_PLAN), gated behind
  `COMMUNITY_DIRECT_MESSAGES_ENABLED` / `COMMUNITY_PEOPLE_DISCOVERY_ENABLED`.
