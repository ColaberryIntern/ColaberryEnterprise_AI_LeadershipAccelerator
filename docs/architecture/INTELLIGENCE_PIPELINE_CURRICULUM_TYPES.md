# Intelligence Pipeline Curriculum Types

Ten new Curriculum Types that behave as **intelligence pipelines**: reusable content
generators that turn external information into **Timeline Cards** carrying a fixed executive
quality standard. They plug into Experience Studio, the Curriculum Composer, the Today
timeline, and the knowledge graph exactly like every existing type — plus a live ingestion
pipeline that continuously materializes cards from external sources.

Session: `CC-20260719-p2w9`. Branch: `workstream/intelligence-pipeline-types` (off `main`).

---

## The ten types

| # | Type | slug | render band | bucket |
|---|---|---|---|---|
| 1 | AI News Flash | `ai_news_flash` | intel | learn |
| 2 | AI Research Digest | `ai_research_digest` | intel | learn |
| 3 | AI Tool of the Day | `ai_tool_of_the_day` | intel | learn |
| 4 | AI Video Stream | `ai_video_stream` | media | learn |
| 5 | AI Quote of the Day | `ai_quote_of_the_day` | intel | reflect |
| 6 | AI Architecture Breakdown | `ai_architecture_breakdown` | intel | learn |
| 7 | Build Breakdown | `build_breakdown` | intel | learn |
| 8 | MCP Server Spotlight | `mcp_server_spotlight` | intel | learn |
| 9 | Claude Code Technique | `claude_code_technique` | intel | practice |
| 10 | Market Intelligence | `market_intelligence` | intel | learn |

All are `home_surface: today`, `feed_mode: anchored`, `today_eligible: true`, `category:
"Intelligence"`, `approved: true`, `status: published`. The nine reading types render over a
new `intel` band that resolves to the generic inert `lessonDoc()` iframe (no new frontend
renderer — `intel` is mapped to the `reading` visual in `TimelineCard.tsx`'s `BAND` map). The
video type reuses the existing `media` band (real player + transcript).

---

## Layer 1 — the types as authored components (the 2-file ship)

A Curriculum Type = one row in `curriculum_type_definitions`. Shipping one means committing
**two** files (a DB/API edit is dev-local only). Both are re-asserted on boot when
`TIMELINE_ENGINE_ENABLED=true` (`server.ts`).

- **`backend/src/services/timeline/typeRegistry.ts`** — a `D({...})` entry per type
  (behavior defaults: bucket, render_band, XP, difficulty, competencies, surface axis).
- **`backend/src/seeds/seedComponentAuthoring.ts`** — a `COMPONENT_AUTHORING[slug]` entry per
  type (the authored experience: generation prompt, thumbnail, Parts/capabilities, I/O
  contracts, approval) + the slug in `THUMBNAIL_SLUGS`.
- **`frontend/src/components/timeline/TimelineCard.tsx`** — one `BAND` line mapping `intel`
  to the `reading` visual (required by the `curriculumFormatContract` test).

### The generation prompt (only prompt that drives the runtime)

The runtime forces a fixed **9-key output schema** (`title, summary, body_html, questions[],
reflection, discussion_prompt, github_task, evaluation_criteria[], completion`); `reflection`
and `evaluation_criteria` are output keys the generation prompt emits (the
`reflection_prompt`/`evaluation_prompt` columns exist but are not wired to the student runtime
yet). All ten prompts are built by one shared `intelGenerationPrompt(config)` skeleton in
`seedComponentAuthoring.ts`, specialized per type.

**Dual-mode.** Each prompt reads an optional ITEM (via `{{item_title}}`, `{{item_source}}`,
`{{item_url}}`, `{{item_excerpt}}`, `{{item_date}}` variables):
- **Item present** (materialized by an ingestion pipeline) → summarize that real item.
- **No item** (scheduled on a week by the Composer / previewed in Studio) → produce one
  representative example grounded in the week's WEEK CONTEXT.

### The executive quality standard (`body_html`)

Every card answers, in order: **What happened · Why it matters · Why an AI Systems Architect
should care · Implications (Business / Technical / Enterprise) · Recommended next action ·
Related (skills, technologies, curriculum) · Source (with date + confidence).** Plus a
`reflection` prompt and a cohort `discussion_prompt`. Executive voice, no hype.

---

## Layer 2 — the ingestion pipeline (reference: AI News Flash)

The continuously-generating half, modeled on the Blog/Podcast precedent (a `node-cron` job
fills a library table; here we add LLM summarization + one-card-per-item materialization).

**Files:** `models/AiNewsItem.ts`, `services/intel/rssParser.ts`,
`services/intel/aiNewsIngestionService.ts`, `scripts/refreshAiNews.ts`, the `AiNewsRefresh`
cron in `schedulerService.ts`, `ensureAiNewsSchema()` + boot ingest in `server.ts`, and
`POST /api/admin/intel/ai-news/refresh` (`routes/admin/intelRoutes.ts`).

**Lifecycle:** COLLECT (fetch free RSS feeds — native `fetch` + timeout + retries) →
NORMALIZE (`parseRssFeed`, cheerio xml mode; handles RSS 2.0 + Atom) → DEDUPE (upsert into
`ai_news_items` `ON CONFLICT (guid)`) → SCORE (`rankImportance`) → SUMMARIZE (run the
`ai_news_flash` generation prompt through the instrumented OpenAI path) → GENERATE (persist
the 9-key content on `summary_json`) → PUBLISH (create one standalone, program-wide,
published `timeline_cards` row; record `card_id`).

**Idempotent & replayable** (non-negotiable): dedup by `guid`; summarize only when
`summary_json` is null; one card per item (guarded by `card_id`). Re-running the cron produces
no duplicate items, cards, or LLM spend.

**Fail-first:** every fetch has a hard timeout + capped retries; a feed failure is logged and
skipped (others still ingest — verified live: Anthropic's feed 404'd, the run continued and
parsed 1,986 items from the rest); an LLM failure leaves the item un-carded for retry (no
partial commit); nothing throws into a student request path.

**Cost-gated:** live card materialization runs only when `AI_NEWS_INGEST_ENABLED=true` (the
library ingest always runs; the LLM step is the gated, cost-bearing part). `maxCards` bounds
LLM spend per run. Feeds are overridable via `AI_NEWS_FEEDS="Source|url,..."`. The default
Anthropic feed URL is best-effort (currently 404s) and degrades gracefully.

---

## The other nine pipelines (documented follow-up)

Each reuses the same shape (`intel/*IngestionService`, a library table, an `AiNewsRefresh`-style
cron, the shared materialization). Greenlit sources:

| Type | Source (greenlit) |
|---|---|
| AI Research Digest | arXiv API + Papers-with-Code RSS |
| AI Tool of the Day | curated seed list + LLM profiles |
| AI Video Stream | YouTube Data API (needs a key) |
| AI Quote of the Day | curated seed list + LLM |
| AI Architecture Breakdown | engineering blogs (RSS) + LLM |
| Build Breakdown | GitHub / dev-blog RSS + LLM |
| MCP Server Spotlight | MCP registry + repo READMEs |
| Claude Code Technique | Claude Code docs + community + LLM |
| Market Intelligence | Opportunity Pulse REST API (gov/talent/research) + industry reports |

Making a type a *rotating ambient* Today source (vs. anchored) is a further increment —
`ambientPool.AMBIENT_PROVIDERS` is currently hardcoded to blog/podcast/testimonial.

---

## Knowledge graph & search

**Graph (automatic):** each type becomes a `Component` node (keyed by slug) and each published
global card becomes a `TimelineCard` node with a `USES` edge — generically, via
`ingestService`. No graph code was needed. (Ingest is on-demand via `POST /api/admin/brain/ingest`.)
Richer edges (`RELATES_TO/MENTIONS/…`) + technology/company nodes are net-new and out of scope.

**Search:** the base representation is findable by title via the admin brain search
(`/api/admin/brain/search`, node `label`). Full multi-field student search (by
tag/technology/company/date) does not exist in the platform yet and is net-new.

---

## Verification

- **tsc:** `--noEmit` clean across the changed backend (only the pre-existing
  `@anthropic-ai/sdk` local-install error remains, unrelated).
- **Tests (23 green):** `rssParser.test.ts` (RSS+Atom parse, dedup, guid stability, ranking),
  `intelCurriculumTypes.test.ts` (all 10 registered/authored/approved/dual-mode),
  `seedComponentAuthoring.test.ts` (thumbnail + registry contracts),
  `curriculumFormatContract.test.ts` (Studio demo === Classroom render, every band has a visual).
- **Live DB (isolated Postgres):** 10/10 types authored + approved with real generation prompts
  (~3.6 KB each); 10/10 sample cards published + program-wide + feed-queryable; re-run =
  idempotent (updated, not duplicated); Component + TimelineCard graph nodes + USES edge persisted.
- **Live network:** RSS fetch + parse of 1,986 real items; one bad feed skipped gracefully.
- **Faithful render:** all 10 cards rendered via verbatim `lessonDoc()` in the real drawer
  chrome, light + dark; content island stays readable in dark mode
  (`.tld-lessonframe{background:#fff}`).

## Operating the pipeline
- Manual run (supervised): `POST /api/admin/intel/ai-news/refresh` `{ "force": true, "maxCards": 5 }`
  or `node dist/scripts/refreshAiNews.js --force --max 5`.
- Sample cards (dev/validation): `node dist/seeds/seedIntelSampleCards.js`.
- Enable the scheduled pipeline: set `AI_NEWS_INGEST_ENABLED=true` (cron `AiNewsRefresh`, daily 03:15 CT).
