# LLM Content Generation Strategy — bounded cost, self-cleaning library

**Goal:** keep the Today feed full of fresh AI content without racking up LLM cost
or letting the card library grow forever. Every generator that spends LLM tokens
follows this one pattern.

## The two rules

1. **Grab one per day.** Each generator materializes **at most ~1 fresh card per
   day**. That caps spend at roughly *N LLM calls/day* across all generators (N =
   number of active generators), which is predictable and cheap.
2. **Use it for a month, then discard.** A generated card lives **30 days**, then
   is archived out of the feed (`visibility → 'archived'`; `getFeed` only returns
   `published`). So each generator holds a rolling ~30-card window — the library
   never grows unbounded.

Net effect: a steady daily trickle of new content, a rolling month of history, and
a flat, bounded cost.

## The one convention that makes it generic

Every LLM content generator stamps its cards with:

```
metadata.source = '<type>_pipeline'      // e.g. 'ai_news_flash_pipeline'
```

That single marker lets **one** retention job (`generatedContentRetention.pruneGeneratedContent`)
prune *every* generator's output — it archives any card whose `source` ends in
`_pipeline` and is older than `GENERATED_CONTENT_RETENTION_DAYS` (default 30).
Nothing per-generator to wire up.

Hand-authored **sample** cards use `source = 'intel_sample_seed'` — the evergreen
baseline — and are **never** pruned.

## Where the levers are

| Concern | Lever |
|---|---|
| Cards/day (per generator) | the generator's own per-run cap. AI News: `AI_NEWS_MAX_PER_RUN` (default **1**) |
| Cost gate (on/off) | the generator's enable flag. AI News: `AI_NEWS_INGEST_ENABLED` |
| Retention window | `GENERATED_CONTENT_RETENTION_DAYS` (default **30**) |
| Schedule | the daily `AiNewsRefresh` cron (`schedulerService`, 03:15 CT) runs generate-then-prune |

## Current generators

| Generator | Frequency | Notes |
|---|---|---|
| **AI News Flash** (`ai_news_flash`) | 1 card/day | RSS library already holds ~1,989 items; materializes the top-importance uncarded one per day |
| **Blog** (`blog`) | weekly (`BlogRefresh` cron) | already low-frequency |
| **Announcement** | on-demand + cached | generated when a section opens, cached by `section_fingerprint` |
| Other 9 intel pipelines | designed, not built | when built, follow the two rules + stamp `<type>_pipeline` and they inherit retention for free |

## Adding a new LLM generator — checklist

1. Materialize **≤1 card/day** (a per-run cap read from an env var).
2. Put it behind an **enable flag** (default off) so cost is opt-in.
3. Stamp every card `metadata.source = '<type>_pipeline'`.
4. That's it — the 30-day retention picks it up automatically. No per-generator
   cleanup code.
