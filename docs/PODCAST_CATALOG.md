# Podcast Catalog

Weekly-refreshed catalog of Colaberry AI Podcast episodes, stored so the admin console
and the student portal (Experience Studio) can show episodes to students **with real
per-episode thumbnails**.

## Why two sources

| Source | Gives us | Missing |
|---|---|---|
| Training-site index — `https://training.colaberry.com/podcasts` | The **curated** list of episodes to show students, the public `colaberry.ai` episode link, title, a clean short description, display date, duration label. | **No thumbnails.** |
| Buzzsprout RSS feed — `https://feeds.buzzsprout.com/2456315.rss` | Real **per-episode thumbnail** (`itunes:image`), audio URL (`enclosure`), a stable dedup GUID, `pubDate`, duration in seconds. | Not curated (322 episodes, not the student-facing subset). |

We scrape the curated index for **which** episodes to show, then join each entry to the
feed **by normalized title** to attach the thumbnail/audio/GUID. Every curated episode on
the current page resolves a real thumbnail (verified 24/24).

> Scope decision (2026-07-15): store **only the episodes on the training page**, enriched
> with feed data — not the full 322-episode catalog.

## Data flow

```
training.colaberry.com/podcasts ──scrape──┐
                                          ├─ join by normalized title ─→ upsert `podcasts`
feeds.buzzsprout.com/2456315.rss ─scrape──┘        (dedup on website_url)
```

Run weekly (Mon 03:00 America/Chicago) by the `PodcastRefresh` scheduled job, and on demand
via the admin endpoint or the CLI.

## Table: `podcasts`

Sequelize model `backend/src/models/Podcast.ts` (created by `sequelize.sync({ alter: true })`
on boot — no migration file). Dedup/idempotency key: **`website_url` (unique)**.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `title` | STRING(500) | episode title (index, clean) |
| `slug` | STRING(300) | last path segment of the episode URL |
| `website_url` | STRING(1000) **unique** | public `colaberry.ai/resources/podcasts/<slug>` link |
| `audio_url` | STRING(1000) | Buzzsprout `.mp3` enclosure |
| `thumbnail_url` | STRING(1000) | Buzzsprout per-episode artwork (`storage.buzzsprout.com/...jpg`) |
| `description` | TEXT | index description, falls back to feed summary |
| `duration_seconds` | INTEGER | from the feed (fallback: parsed from the card label) |
| `duration_label` | STRING(20) | e.g. `24:42` |
| `published_at` | DATE | feed `pubDate` (fallback: card display date) |
| `buzzsprout_guid` | STRING(120) | e.g. `Buzzsprout-19336943` (secondary key) |
| `featured` | BOOLEAN | true for the featured card on the index |
| `is_active` | BOOLEAN | portal shows only active rows |
| `source` | STRING(120) | `training.colaberry.com` |
| `category` | STRING(80) | coarse subject bucket for admin filtering (`frontier-models`, `agents-automation`, `governance-safety`, `robotics-hardware`, `tools-coding`, `industry-news`) — the "curriculum subject" the personalization picker filters on |
| `tags` | JSONB | topic/vendor keywords (`anthropic`, `agents`, `governance`, …) derived at ingest for personalized matching (see `podcastTagger.ts`) |
| `raw_meta_json` | JSONB | e.g. `{ matched: true }` |
| `last_seen_at` | DATE | last scrape that saw this episode |
| `created_at` / `updated_at` | DATE | |

## API

### Admin (requireAdmin)
- `GET /api/admin/podcasts` → `{ podcasts: Podcast[], count }` — full catalog, `featured` then `published_at DESC`.
- `POST /api/admin/podcasts/refresh` → `{ ok, summary }` — trigger a scrape now. `?dryRun=true` reports without writing.

### Portal / Experience Studio (requireParticipant)
- `GET /api/portal/podcasts` → `{ podcasts: PublicPodcast[], count }` — active rows only, safe fields:

```jsonc
{
  "podcasts": [
    {
      "id": "…",
      "title": "Fable 5 and the Crisis of Hidden AI Safety Throttling",
      "slug": "fable-5-and-the-crisis-of-hidden-ai-safety-throttling-12th-june-2026",
      "website_url": "https://www.colaberry.ai/resources/podcasts/fable-5-…",
      "audio_url": "https://www.buzzsprout.com/2456315/episodes/19336943-….mp3",
      "thumbnail_url": "https://storage.buzzsprout.com/t0jkcls6e5dvivmrqbn3nj46htub?.jpg",
      "description": "How transparency, trust, and model governance…",
      "duration_seconds": 1482,
      "duration_label": "24:42",
      "published_at": "2026-06-12T17:00:00.000Z",
      "featured": true
    }
  ],
  "count": 24
}
```

### Wiring into Experience Studio (the "later" step)
Consume `GET /api/portal/podcasts` from the portal and render each episode with the existing
podcast card in `frontend/src/components/HomeLearningMediaSection.tsx` (it already takes a
`podcastUrl` for an `<audio>` element — pass `audio_url`, and use `thumbnail_url`/`title`/
`website_url` for the card face). No backend change needed; the data layer is ready.

## Refresh job & CLI

- **Weekly job:** `PodcastRefresh` in `backend/src/services/schedulerService.ts`
  (`cron '0 3 * * 1'`, `America/Chicago`) → `refreshPodcasts()`.
- **CLI (initial population / manual):**
  ```bash
  cd backend
  npx ts-node src/scripts/refreshPodcasts.ts            # scrape + upsert
  npx ts-node src/scripts/refreshPodcasts.ts --dry-run  # scrape + report, no writes
  # compiled: node dist/scripts/refreshPodcasts.js
  ```

## Idempotency & failure behavior

- **Idempotent:** upsert keyed on `website_url`; re-running produces the same rows with no
  duplicates. Content fields are written only when they change; `last_seen_at` always updates.
- **Failure-first:** both fetches have a 20s timeout + 3 capped retries. The index fetch is
  **required** — if it fails, the job throws and leaves the table untouched (a failed/empty
  scrape never wipes the catalog). The feed fetch is **optional** — on failure the job degrades
  to index-only (null thumbnails) and records it in the summary.
- Parsing 0 episodes from the index raises a `ContractViolation` (guards against silent
  breakage if the training-site markup changes).

## Code map

| Concern | File |
|---|---|
| Pure parse + title-join + enrich (unit-tested) | `backend/src/services/podcast/podcastFeedParser.ts` |
| Fetch + timeout/retry + idempotent upsert | `backend/src/services/podcast/podcastIngestionService.ts` |
| Model | `backend/src/models/Podcast.ts` (registered in `models/index.ts`) |
| Controller | `backend/src/controllers/podcastController.ts` |
| Admin routes | `backend/src/routes/admin/podcastRoutes.ts` (mounted in `adminRoutes.ts`) |
| Portal route | `backend/src/routes/participantRoutes.ts` (`GET /api/portal/podcasts`) |
| Weekly job | `backend/src/services/schedulerService.ts` (`PodcastRefresh`) |
| CLI | `backend/src/scripts/refreshPodcasts.ts` |
| Tests | `backend/src/services/podcast/__tests__/podcastFeedParser.test.ts` |
