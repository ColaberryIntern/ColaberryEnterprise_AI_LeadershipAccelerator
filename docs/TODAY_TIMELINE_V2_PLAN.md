# Today Timeline v2 — Endless Engagement Feed + Surface Placement Model

**Status:** PLAN (awaiting approval to build)
**Author:** Claude Code — Session `CC-20260719-p4k7`
**Date:** 2026-07-19
**Target branch:** new `workstream/today-timeline-v2` branched off **`main`** (the Timeline Engine lives on `main`, not the current worktree)
**Governance:** New subsystem + additive schema + cross-module. This document *is* the escalation artifact; building begins only on approval.

---

## 1. What this is

Turn the learner-facing **Today** screen into a **never-ending, FB-style scroll of AI content** that keeps free and paid users engaged even when they are not in "learning mode" — while giving every card a clean answer to the question *"where does this card belong?"* so content routes to the right surface automatically.

Two things ship, in this order (per decision: **engagement engine first**):

1. **The engagement engine** — infinite scroll, ambient content rotation, alternation rules, and "you interacted with it → hide it → show a fresh one" dedup.
2. **The structure** — a **Surface** dimension on every card type that declares where a card lives (Today / Class / Project / Community / Group) and whether it flows into Today. This makes adding new content types later (external AI feeds, community posts, etc.) a **drop-in**, not a re-architecture.

Deferred by decision (built later, as their own curriculum types / entities): curated **external AI article feeds**, and the **Community / Groups** entities. This plan makes both trivial to add.

---

## 2. Ground truth — what exists today on `main`

The Timeline Engine is real and ~70% of the way to this vision:

- **`timeline_cards`** — one universal table; every learning object is a row. `type` resolves through the **Curriculum Type Registry** (`typeRegistry.ts`, 36 `CARD_TYPES`) → `curriculum_type_definitions`. Key fields: `type`, `bucket` (learning phase: learn/build/reflect/share/practice/advance/pre_class), `week`, `program_id`, `cohort_id`, `visibility`, `release_date`, `unlock_rules`, `order`, `priority`, `metadata`.
- **`timelineService.getFeed`** — assembles a cohort's published curriculum cards, resolves rotating media per student, returns a **finite** ordered list.
- **Rotating "ambient" media already works** — Blog (`BlogRefresh` cron, Mon 03:30), Podcast (`PodcastRefresh` cron, Mon 03:00), Testimonial (manual ingest). Each uses the identical per-student picker: **stable reuse → unseen pool → least-recently-seen rotation → tag-match + jitter → weighted top-5 pick → UPSERT a `*_views` ledger** (`blog_post_views`, `podcast_views`, `network_video_views`).
- **Per-student state** — `timeline_card_progress` (locked/available/in_progress/completed, watch analytics). Identity key is **`enrollment_id`** everywhere (no `user_id`).

## 3. The gap — exactly the three things asked for

| Requirement | Today | Gap |
|---|---|---|
| A **"where the card fits"** category | Cards have `type` (what) + `bucket` (learning phase). Audience linkage only `cohort_id`/`program_id`. | ❌ **No Surface dimension.** No project/community/group linkage. No "this is a Today card vs a Class card." |
| **Directional aggregation** (Class/Project/Community/Group → Today, never reverse) | `getFeed` lists one cohort's curriculum. | ❌ No aggregation, no one-way valve. |
| **Never-ending timeline** | `getFeed` returns a finite list, no cursor. | ❌ Not infinite scroll. |
| **Ambient rotation + alternation + interact-to-hide** | Per-*media-item* dedup exists inside pickers. | ⚠️ **No card-level hide-on-interaction, no alternation across types, no injection cadence, no bottomless paging.** Testimonials also have no refresh cron. |

---

## 4. Core model — Surface × Type, with a one-way valve

Every card already answers *"what am I?"* via **`type`**. We add a second axis that answers *"where do I belong?"*:

### 4.1 The Surface dimension

Add three properties, declared **at the curriculum-type level** (in the registry, so a new type auto-inherits the behavior), with an optional per-card override:

- **`home_surface`** ∈ `today | class | project | community | group` — the card's canonical home.
- **`feed_mode`** ∈ `anchored | ambient`
  - **anchored** — the card has a real home and a fixed position/gating there (a Week-3 lesson, a project task). It *may* also be mirrored into Today.
  - **ambient** — the card has **no home but Today**; it is rotated, deduped, and alternated for engagement (a blog, a podcast, a testimonial, a future external article).
- **`today_eligible`** (bool) — may this card appear in the aggregated Today feed? (Ambient ⇒ always true. Anchored ⇒ the "flows into Today" switch.)

### 4.2 The one-way valve (the direction rule, in structure)

```
                 ┌─────────────────────────────────────────────┐
   TODAY  ◄──────┤  Class   Project   Community   Group          │   (anchored, today_eligible=true
   (aggregator)  └─────────────────────────────────────────────┘    → mirrored INTO Today)

   TODAY  ◄────────  Blog   Podcast   Testimonial   (future: Article)   (ambient, home=today
                                                                          → Today-ONLY, rotated)

   Class / Project / Community / Group  ◄──  only their OWN cards.
                                            Never ambient. Never each other's.
```

- **Today aggregates everything** eligible: all ambient cards (rotated) **UNION** anchored cards whose `today_eligible=true` (mirrored, deduped, ranked).
- **Anchored surfaces are pure** — the Class surface renders only class cards; a Project renders only its project cards. They never pull ambient content and never pull each other's cards. This is enforced in typed code, not convention.
- **Ambient is Today-only** — blog/podcast/testimonial can *only* render in a timeline. Structurally impossible for them to appear inside a Class or Project.

### 4.3 Proposed classification of the 36 existing types

*(Reversible product call — proposed defaults; flagged rows want your eye. Set in `typeRegistry.ts`.)*

| Surface / mode | Types |
|---|---|
| **today · ambient** (rotated, Today-only) | `blog`, `podcast`, `testimonial`, `video` ⚑(if network/rotating), plus future `article` |
| **today · system** (engine-injected gamification) | `milestone`, `achievement`, `daily_streak`, `completion_badge` |
| **today · anchored** (broadcast, one-shot) | `announcement` ⚑ |
| **class · anchored** (curriculum-tied, `today_eligible=true`) | `overview`, `warmup` (Self Study), `knowledge_check`, `survey`, `prompt_lab`, `deep_dive`, `prompt_challenge`, `ai_video_feedback`, `mock_interview`, `anthropic_skills_jar`, `certification_exercise`, `evaluation`, `question`, `reflection`, `study_session`, `presentation`, `internship_activity` |
| **project · anchored** | `implementation_task`, `artifact_submission`, `project_task`, `build_story`, `github_sync` |
| **community · anchored** (surface stubbed for now) | `discussion`, `community_discussion`, `demo` |
| **group · anchored** (live-event/group-chat, surface stubbed) | `live_class`, `event`, `demo_tuesday`, `kes_wednesday`, `marketing_friday` |

⚑ = judgment call to confirm. Community/Group cards keep their classification now; their *home surfaces* are declared but stubbed (they aggregate into Today once those entities exist).

---

## 5. The engagement engine (Phase 1 — the payoff)

A new **Today Feed Composer** service produces a bottomless, paginated, per-user stream.

### 5.1 Cursor pagination (infinite scroll)
`getTodayFeed(enrollmentId, cursor?, limit=10)` → `{ items[], nextCursor }`.
- Anchored eligible cards are **finite** → interleaved by relevance/recency and exhaust.
- Ambient cards are **bottomless** → `nextCursor` is never null; when anchored runs out, the feed becomes pure ambient and keeps going forever.
- **Deterministic:** a per-user **feed seed** + the cursor make every page reproducible. Scrolling up/down or refreshing yields the same items in the same order — no dupes, no reshuffles. (This is also the CLAUDE.md idempotency requirement for a paged endpoint.)

### 5.2 Rotation, alternation & cadence ("how they show up / change out / alternate")
- **Rotation** (reuse existing pickers): each ambient provider serves unseen items first, then least-recently-seen, scored by student-tag match + jitter. The content "changes out" as the pool cycles and as new items are ingested by the weekly crons.
- **Alternation:** no two same-type ambient cards back-to-back; round-robin across providers (blog → podcast → testimonial → …), weighted by pool depth and recent engagement so a thin pool doesn't dominate.
- **Injection cadence:** ambient cards are injected every *N* slots between anchored cards (config per "mode" — heavier anchored when the learner has fresh class work, heavier ambient otherwise). Pure ambient once anchored is exhausted.

### 5.3 Interact-to-hide + card-level dedup (the missing piece)
- Every served ambient instance is logged to a **per-user impression ledger**. When the user **opens / clicks / completes / dismisses** it, it's marked `interacted` → the underlying media item is marked seen in its `*_views` ledger (won't re-serve) **and** that card instance is not re-emitted in later pages. Next slot pulls a *fresh* one.
- Result: the user never sees the same blog/podcast/testimonial twice until the whole pool is exhausted, and an item they engaged with is retired immediately — exactly the "show/hide so they don't get duplicates" behavior requested.

### 5.4 Ambient provider contract (the extension point)
Standardize what blog/podcast/testimonial already do behind one interface so **new ambient types plug in without touching the composer**:

```ts
interface AmbientProvider {
  slug: string;                                   // 'blog' | 'podcast' | 'testimonial' | 'article' | ...
  pickNext(enrollmentId, ctx): AmbientItem | null;   // unseen → LRU → tag-match (exists today)
  recordSeen(enrollmentId, item, cardId): void;      // *_views UPSERT (exists today)
  recordInteraction(enrollmentId, item, action): void; // interact-to-hide (new)
  poolDepth(enrollmentId): number;                   // for alternation weighting
}
```

Adding the **external-AI-feed curriculum type later** = ingest to a pool table + implement `AmbientProvider` + set `home_surface=today, feed_mode=ambient` in the registry. The composer picks it up automatically. That is the whole point of building the structure first.

---

## 6. Data model changes (additive, low-risk)

1. **`curriculum_type_definitions`** (+ registry `CardTypeDef`): add `home_surface` (STRING20, default `class`), `feed_mode` (STRING20, default `anchored`), `today_eligible` (BOOL, default `false`). Seeded idempotently from `typeRegistry.ts` via the existing `typeSeeder` re-assert pattern.
2. **`timeline_cards`** (forward-compatible, generic — avoids adding project/community/group columns one at a time):
   - `home_kind` (STRING20, nullable) + `home_id` (UUID, nullable) — locates the card's home when it isn't cohort/program (e.g. `home_kind='project'`, `home_id=<project_id>`). Class stays located by the existing `program_id`+`week`+`cohort_id`. This is the **stub for Community/Group** — the columns exist; the entities come later.
   - `surface_override` (JSONB, nullable) — per-card exception to the type-level surface defaults.
3. **New `today_feed_impressions`** (`enrollment_id`, `card_ref`, `item_ref`, `served_at`, `interacted_at`, `action`, `hidden`) — powers card-level interact-to-hide + stable pagination. Additive; existing `*_views` ledgers keep handling media-item dedup.
4. **Interaction capture:** add a `dismiss` action + a generic "interacted" signal for ambient cards.

All changes are additive columns/tables with defaults → no migration risk to existing rows. Per the "no global sync" note, each new table gets an `ensure*Schema()` hook and new columns are ALTER-added with defaults.

## 7. Endpoints
- `GET /api/portal/runtime/today?cursor=…&limit=…` → paged feed `{ items, nextCursor }`.
- `POST /api/portal/runtime/today/:cardRef/interact` `{ action: 'open'|'click'|'complete'|'dismiss' }` → interact-to-hide.
- Anchored surface reads (Class/Project) keep their existing endpoints; they gain a typed guard that rejects ambient types.

## 8. Frontend
- Today page → infinite scroll via `IntersectionObserver` fetching `nextCursor` pages; renders mixed anchored+ambient cards through the **existing** per-type renderers (`render_band` system already exists — no new card UI required for existing types).
- Interact-to-hide micro-animation; a graceful "you're caught up on class — here's more from the AI world" transition when the feed shifts to pure-ambient.
- Flag-gated; validate the production frontend build via the nginx Docker image (not the local junction build).

## 9. Idempotency & failure-first (CLAUDE.md non-negotiables)
- **Pagination** deterministic (seed+cursor) → retry-safe, no dupes.
- **Ledger upserts** already idempotent; impression writes keyed `(enrollment_id, card_ref)`.
- **Provider fail-soft** — a provider that throws or has an empty pool is dropped from that page; the feed never blanks out.
- **BREAK/HARDEN list to clear before ship:** pool exhaustion, concurrent paging, refresh mid-scroll, provider timeout, a user with zero anchored cards (pure ambient from slot 0), a brand-new user with empty ledgers.

---

## 10. Phasing

| Phase | Deliverable | Ships the... |
|---|---|---|
| **0 — Structure (thin)** | `home_surface`/`feed_mode`/`today_eligible` on registry + `curriculum_type_definitions`; classify all 36 types; standardize blog/podcast/testimonial behind `AmbientProvider`; add the missing **testimonial refresh cron**. Flag off — no behavior change yet. | foundation |
| **1 — Engagement engine** ⭐ | Today Feed Composer: cursor pagination, ambient rotation, alternation, injection cadence, interact-to-hide, deterministic seed; new endpoints; infinite-scroll Today (flag-gated); full BREAK/HARDEN. | **the payoff** |
| **2 — Directional aggregation** | Mirror anchored Class/Project cards into Today (relevance + dedup vs home); enforce the one-way valve; wire `home_kind='project'`. | the structure's reach |
| **3 — Extensibility hardening** | Update the `build-curriculum-type` skill so a new type declares its surface + (if ambient) an `AmbientProvider`; document the drop-in path. | future-proofing |
| **Future (you build later)** | External-AI-feed curriculum type (as an ambient provider); Community + Groups entities (populate the stubbed surfaces). | deferred by decision |

## 11. Open decisions / assumptions
- **Surface = "Today"** here means the learner **Timeline Engine feed** (`getFeed`), not the `CoryHome`/`unified-state` *project build queue* (a separate "one priority" surface). Assumed; flag if you meant CoryHome.
- **Free vs paid:** assumed ambient content = everyone (the retention hook); anchored Class/Project = enrolled/paid. Confirm.
- **Type classification** (§4.3, ⚑ rows) is a reversible product call — proposed, adjustable.
- No new **paid external dependency** in this scope (external feeds deferred).

---

*Prepared for review. On approval: branch `workstream/today-timeline-v2` off `main`, execute Phase 0 → 1, PROGRESS.md gated per change. This doc is story-build-ready.*
