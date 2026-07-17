# Podcast Personalization + Engagement Tracking — Implementation Spec

**Goal:** give the **Podcast** timeline card the same capability the **Testimonial** card has — an admin "Random · personalized" mode that auto-picks a podcast episode for each student by **match** (student role/industry/goal) or **curriculum subject** (category), and records what each student **listened to** and **completed**.

**Decisions (Ali, 2026-07-15):**
- **Approach:** generalize the existing testimonial picker into ONE **shared media-picker** serving both `testimonial` and `podcast` card types — not a copy-paste clone.
- **Podcast pool:** the **Buzzsprout `podcasts` catalog** (the `training.colaberry.com/podcasts` episodes) — **audio** playback + thumbnail.
- **Timing:** lands **after** both branches merge to `main`.

---

## Prerequisites (why this waits)

The machinery is split across three places today:

| Piece | Lives on | Status |
|---|---|---|
| Timeline card system, `typeRegistry` (podcast type at `typeRegistry.ts:58`), `timeline_card_progress`, `/complete` endpoint | `main` | ✅ available |
| **Personalization engine** — `networkVideoMatch.ts`, `networkVideoService.ts` (`selectTestimonialForEnrollment`), `network_videos` + `network_video_views`, the `getFeed` random-resolution loop, the `TimelineEditorTab` "Random · personalized" toggle, `testimonialSchema` | `workstream/testimonials-type` | ⏳ **not merged** |
| **Podcast catalog** — `podcasts` table + weekly ingest | `workstream/podcast-catalog` | ⏳ **not merged** |

**Unblocks when:** `workstream/testimonials-type` **and** `workstream/podcast-catalog` are both on `main`. Then this spec is a single, small feature branch.

---

## Design — one shared media-picker

Rather than clone `selectTestimonialForEnrollment` into `selectPodcast...`, generalize it. The matcher (`networkVideoMatch.ts`) is already content-agnostic and needs **no change** — it scores `matchScore(itemTags, itemText, userTags) = tagOverlap×3 + textHits×2`.

### 1. Media-source abstraction (backend)
Introduce a tiny per-kind adapter so the picker doesn't care whether it's serving a video or a podcast:

```ts
// backend/src/services/timeline/mediaSources.ts  (new)
export type MediaKind = 'network_video' | 'podcast';
export interface MediaCandidate {
  id: string; title: string; text: string;   // text = title + description (for matchScore)
  tags: string[]; category: string;
  url: string; thumbnailUrl: string | null; durationSeconds: number | null;
  kind: MediaKind;
}
export interface MediaSource {
  kind: MediaKind;
  // unseen-in-category pool + LRU rotation, mirroring networkVideoService steps 2–3
  candidates(enrollmentId: string, category: string): Promise<MediaCandidate[]>;
  alreadyAssigned(enrollmentId: string, cardId: string): Promise<MediaCandidate | null>;
  recordView(enrollmentId: string, item: MediaCandidate, cardId: string, ctx: object): Promise<void>;
}
```
- `network_video` adapter = the existing `networkVideoService` logic, refactored behind this interface (reads `network_videos`, writes `network_video_views`).
- `podcast` adapter = reads the `podcasts` catalog, writes a new `podcast_views` table (below).

### 2. Generalized selector
```ts
// backend/src/services/timeline/selectMediaForCard.ts  (new — replaces selectTestimonialForEnrollment’s call site)
export async function selectMediaForCard(enrollmentId, card, source: MediaSource): Promise<FeedVideo | null>
```
Keeps the exact 5 steps: **stable reuse → unseen-in-category pool → LRU rotation → score+weightedPick(top-5) → UPSERT view**. `buildUserTags(enrollmentId)` (from `UserCurriculumProfile` + `Enrollment` + variables) is unchanged.

### 3. Feed wiring (one branch, mirrors the testimonial line)
`timelineService.getFeed()` currently has:
```ts
if (fc.type === 'testimonial' && meta.mode === 'random' && !fc.video)
  fc.video = await selectMediaForCard(enrollmentId, card, networkVideoSource);
```
Add the sibling, same sequential loop:
```ts
if (fc.type === 'podcast' && meta.mode === 'random' && !fc.video)
  fc.video = await selectMediaForCard(enrollmentId, card, podcastSource);
```

### 4. Catalog match-readiness (on `podcast-catalog` — can be pre-staged NOW, independent of the merge)
Add two additive columns to `backend/src/models/Podcast.ts` and derive them at ingest:
- `category STRING` — the subject bucket the admin filters on (the "curriculum subject"). Small controlled set, e.g. `frontier-models | agents-automation | governance-safety | robotics-hardware | tools-coding | industry-news`. Default `industry-news`.
- `tags JSONB` — topic keywords for `matchScore`, derived from title+description with an AI-topic vocabulary (vendors: `anthropic/claude/openai/gpt/google/gemini/microsoft/nvidia/xai`; topics: `agents/governance/safety/alignment/reasoning/coding/robotics/hardware/multimodal/voice/opensource/enterprise/security/data/analytics/automation`) plus distinctive tokens >3 chars — mirroring `ingestNetworkVideos.js`’s `deriveTags`.

New pure module `backend/src/services/podcast/podcastTagger.ts` (`derivePodcastTags`, `derivePodcastCategory`) + unit test; wired into `enrichEntries` → `recordToRow`. `matchScore` also reads the episode **text** (title+description, already stored), so matching degrades gracefully even before tags are perfect.

> Note: the Buzzsprout episodes are AI-*news*, so "curriculum subject" is topical (frontier-models / agents / governance…), not a 1:1 map to curriculum skill areas. Good enough for match + rotation; refine categories later if desired.

### 5. View / interaction tracking
- **Listened (view ledger)** — new `podcast_views` table, exact shape of `network_video_views`:
  `id, enrollment_id, episode_id → podcasts(id), category, first_seen_at, last_seen_at, seen_count, last_timeline_card_id, context jsonb, UNIQUE(enrollment_id, episode_id)`.
  Written server-side by the `podcast` `MediaSource.recordView` at feed-compose (idempotent UPSERT, `seen_count+1`). This doubles as the "don't repeat" engine (unseen-pool sub-query).
  *(Optional generalization: a single `media_views(enrollment_id, media_kind, media_id, …)` replacing both tables. Cleaner long-term; per-type tables are the lower-risk increment. Recommend the generalized table since we're already generalizing the picker.)*
- **Completed (hard interaction)** — already free via `timeline_card_progress` + `POST /api/portal/classroom/cards/:cardId/complete`. No new code.
- **Open signal** — already free via `POST /api/portal/runtime/cards/:cardId/content`.
- **Optional granular play/pause/scrub events** — only if wanted; borrow the `trackingController` (`POST /api/t/event`) pattern. Not required for "viewed + interacted."

### 6. Admin toggle (frontend — generalize, don't duplicate)
In `frontend/src/pages/admin/orchestration/TimelineEditorTab.tsx`:
- Change the gate `const isTestimonial = draft.type === 'testimonial'` → also treat `podcast`: `const isPersonalizable = ['testimonial','podcast'].includes(draft.type)`.
- Reuse the existing "Paste a link" vs "**Random · personalized**" two-button toggle + category input for both. Rename the metadata key `testimonial_category` → a shared `media_category` (keep back-compat read of the old key).
- Backend: widen `timelineAdminController.ts` `testimonialSchema` (rename to `mediaSourceSchema`) + `buildTestimonialMeta` → `buildMediaMeta` to accept `podcast` and persist `metadata.mode` + `metadata.media_category`.

### 7. Student render (frontend — audio)
The picked episode is audio (`.mp3` from Buzzsprout). Extend the card renderer so a `podcast`/audio media plays with an `<audio controls>` element (poster = `thumbnail_url`, title, presenter) instead of `VideoEmbed`’s iframe. Direct-file audio can auto-`/complete` on `ended`, same as the direct-`<video>` path does today. No new fetch/track calls — the "listened" row is already written server-side when the feed resolved the pick.

---

## Ordered implementation steps (post-merge)

| # | Step | Files | Notes |
|---|---|---|---|
| 0 | (Pre-stageable now) Catalog tags+category | `models/Podcast.ts`, `services/podcast/podcastTagger.ts`(+test), `podcastFeedParser.ts`, `podcastIngestionService.ts`, `docs/PODCAST_CATALOG.md` | additive columns; backfill via re-ingest |
| 1 | Media-source abstraction + refactor testimonial behind it | `services/timeline/mediaSources.ts`, refactor `networkVideoService.ts` | no behavior change for testimonials |
| 2 | Generalized selector | `services/timeline/selectMediaForCard.ts` | reuse `networkVideoMatch.ts` unchanged |
| 3 | `podcast_views` (or generalized `media_views`) | `models/PodcastView.ts` (or `MediaView.ts`) | mirrors `network_video_views` |
| 4 | Podcast `MediaSource` adapter | `services/timeline/mediaSources.ts` | reads `podcasts`, writes the views table |
| 5 | `getFeed` podcast branch | `services/timeline/timelineService.ts` | one `if` |
| 6 | Admin toggle generalization | `TimelineEditorTab.tsx`, `timelineAdminController.ts`, `timelineAdminService.ts` | `isTestimonial → isPersonalizable`; schema rename w/ back-compat |
| 7 | Student audio renderer | `components/timeline/*` (`CardDetailBody`/new `AudioEmbed`) | `<audio>` for podcast media |
| 8 | Tests | `__tests__/*` | picker (stable-reuse, unseen-pool, rotation, weightedPick), tagger, adapter |

**Verification:** unit tests for the picker + tagger; dev run — mark a `podcast` card `mode:'random'`, load `/api/portal/classroom` as two students with different profiles, confirm different matched episodes, a `podcast_views` row per student that increments `seen_count` on refresh (not a new pick), and `/complete` writing `timeline_card_progress`.

---

## Open questions to confirm at implementation time
1. **Generalized `media_views` vs per-type `podcast_views`?** (Recommend generalized, since the picker is being generalized.)
2. **Category vocabulary** — the 6 topical buckets above, or map podcasts to actual curriculum skill areas? (Recommend topical for the news feed.)
3. **Audio auto-complete** — mark the card complete on audio `ended`, or require an explicit "Mark complete"? (Testimonials auto-complete direct files; recommend same.)
