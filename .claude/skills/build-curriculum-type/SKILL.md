---
name: build-curriculum-type
description: Build or update ONE Curriculum Type end to end — an Experience Studio "AI Component" (a row in curriculum_type_definitions, backend /api/admin/components/*). From a name + one-line intent it derives the render band, Parts, generation prompt (written against the auto-injected week blueprint), thumbnail, and I/O contracts, then create-or-updates by slug (idempotent), previews against a real week, and approves. Invoke when Ali says "build a curriculum type", "set up the {X} card type", "certify the Experience Studio components", or wants to author/fix a curriculum type fast and accurately.
---

# build-curriculum-type — the reusable Curriculum Type builder

A **Curriculum Type** = one **AI Component** row in `curriculum_type_definitions`
(model `backend/src/models/CurriculumTypeDefinition.ts`), authored in the
**Experience Studio** tab of `/admin/orchestration`. Backend = the "Experience
Builder": routes `/api/admin/components/*` (`componentController.ts`), services in
`backend/src/services/components/*`. This skill takes as little as a **name + one
line of intent** and produces a complete, working, approved component.

## What to say to run it

Give me the two required lines; everything else has a sane default I derive.

1. **name** — e.g. "Overview" (becomes `label`; `slug` = slugified name = the idempotency key).
2. **intent** — one line: what the student does and why the type exists.

Optionally override any Tier-2/3 field below. I ask only the handful of decisions
that are genuinely yours (usually: title format, thumbnail, accent color, content shape).

## The KEY runtime facts (author against these — do not fight them)

- **The week blueprint is auto-injected.** `runtimePreview(slug, vars, model, programId, week)`
  calls `getBlueprintContext(programId, week)` (`backend/src/services/timeline/blueprintContext.ts`),
  which loads that week's `CurriculumBlueprint` and **prepends a "WEEK CONTEXT" block**
  (title, purpose, learning_objectives, competencies, architect_domains, student_outcomes,
  success_criteria, difficulty, hours) to the system prompt. So a zero-input type dropped
  on a week self-generates from that week. **Write `generation_prompt` referencing "the
  WEEK CONTEXT above", NOT `{{blueprint.*}}` placeholders.** Only `vars` (e.g. topic/week/
  cohort) flow through `resolvePrompt`'s `{{}}`.
- **The runtime forces a fixed output JSON schema.** Whatever the generation_prompt says,
  the runtime asks the model for: `title, summary, body_html, questions[], reflection,
  discussion_prompt, github_task, evaluation_criteria[], completion`. The generation_prompt's
  job is to STEER what fills those keys (especially `title` and `body_html`).
- **NOT auto-injected:** the per-week Anthropic course link (`curriculum_course_links`) and
  live sessions. Only add references to them if you also wire that binding.
- **New render *behavior* is code, not data.** If a type needs a brand-new `render_band`
  with no existing student renderer (`CardDetailBody.tsx` today only has bespoke renderers
  for `media`/`video` + `skills_jar`; everything else shares a generic content body), that
  is a PR, not a component edit. Flag it as a follow-up.

## Parameters

### Tier 1 — required
`name`, `intent`.

### Tier 2 — shape (override the derivation)
`slug` (default slugify(name)), `student_label`, `render_band`
(overview|media|deepdive|warmup|quiz|survey|promptlab|task|artifact|github|interview|
skills_jar|evaluation|exam|reflection|discussion|community|presentation|demo|announcement),
`bucket_default` (pre_class|learn|practice|build|reflect|share|advance), `difficulty`
(intro|core|stretch), `estimated_time` (min), `xp` {learning,builder,community},
`competencies` [], `capabilities` [] (the "Parts" — fetch live list `GET /api/admin/capabilities`;
e.g. transcript, ai_chat, reflection, discussion, quiz, github, portfolio, mentor_review,
peer_review, video, voice, camera, rubric, artifacts, evaluation, retry, hint_system,
scoring, comments, likes, bookmarks, sharing, evidence), `flags`
{evidence_required, github_required, ai_evaluation, instructor_review, portfolio_eligible,
can_create_variables, can_create_artifacts}.

### Tier 3 — fine (leave blank to auto-generate)
`generation_prompt` (steers title + body_html against WEEK CONTEXT), `design_prompt`,
`evaluation_prompt` (if ai_evaluation), `reflection_prompt` (if a reflection Part),
`github_prompt` (if github_required), `evaluation_type` (none|ai|rubric|instructor|peer),
`completion_rules` {on: view|submit|evaluate|approve, min_score?}, `inputs`
([{key,type,required}] — `[]` for a zero-author-input type), `outputs`, `dependencies` [],
`category`, `tags` [], `icon` (bootstrap `bi-*`), `badge_class` (`bg-*`),
`thumbnail` {source: template|custom, url?, art_direction?}, `preview_context`
{program_id, week}, `approve` (bool).

## Derivation rules (fill every blank before writing)
1. Minimal input → draft via `POST /api/admin/components/generate` (closest `GET /api/admin/recipes`),
   then sanity-check. `render_band` drives the default Part set; keep Parts consistent with
   flags (scored ⇒ quiz+scoring; evidence ⇒ evidence+artifacts, +github if github_required).
2. `generation_prompt` is mandatory. Write it to steer the fixed output keys, grounded in
   WEEK CONTEXT, matched to difficulty and voice. Include evaluation/reflection/github
   prompts only when the matching flag/Part is on.
3. Contracts explicit: never omit a JSONB contract — write `[]`/`{}`.
   `completion_rules.on` default: view (passive) / submit (evidence) / evaluate (scored).

## Execution (idempotent, key on slug)
A. `GET /api/admin/components/:slug` → 404 = create (`POST /api/admin/components`), else UPDATE.
B. Set the full resolved field set (behavior, `capabilities`, all prompts, contracts,
   icon, badge, xp, difficulty, bucket_default, category, tags, competencies).
C. Thumbnail: custom → set `thumbnail_url` (URL or self-contained `data:image/svg+xml;base64,…`);
   template → `POST /api/admin/components/:slug/thumbnail {source:'template'}`.
D. Renderers: `POST /api/admin/components/:slug/renderers/backfill` (or per-surface) → 8/8.
E. Validate: `POST /api/admin/components/:slug/preview {program_id, week}` → read the render.
   Weak? refine via `.../codesign` and re-preview (≤3 passes). Save a good `preview_examples`.
F. `GET /api/admin/components/:slug/estimate` (tokens/cost).
G. `PUT /api/admin/components/:slug/approval {approved:true}` if approve.
H. Verify: `GET /api/admin/components/:slug`; if any code changed, `tsc --noEmit`.

### Running against dev without a server/auth (the proven pattern)
`accelerator-dev-backend` on the VPS runs current main with DB `accelerator_dev1`
(**the env var `DB_NAME=accelerator_prod` LIES — always confirm with
`select current_database()`**). Pipe a Node script to it over stdin — nothing is left
on the box, and it uses the app's own models/connection:

```
ssh root@95.216.199.47 'docker exec -i accelerator-dev-backend node' < script.js
```

In the script: `require('/app/dist/models/CurriculumTypeDefinition')`,
`require('/app/dist/services/components/componentAiService')` (runtimePreview),
`require('/app/dist/services/timeline/blueprintContext')` (getBlueprintContext).
Program "AI Systems Architect Accelerator" = `92b98a72-8681-4f04-8ba1-16a18334cd0b`
(Week 1 = "Claude Code Foundations + Workspace"), good for `preview_context`.

## Output (report back)
slug · created|updated · component_version · render_band/bucket/difficulty/XP · Parts ·
which of the 7 prompt stages set · thumbnail source+URL · renderer surfaces 8/8 ·
preview verdict (title + a line on the body) · cost estimate · approved? ·
a ✅/⚠️ checklist (identity·behavior·parts·prompts·contracts·thumbnail·renderers·preview·approval) ·
anything needing a NEW render_band/code renderer (flag as a separate PR).

## Make it durable
A dev-DB edit is wiped by a reseed. To persist + promote, add the authored fields to
the committed seed `backend/src/seeds/seedComponentAuthoring.ts` (a `{slug: authoredFields}`
map + an idempotent applier) and run it. That seed is the scalable home as you certify
the ~15 week types (`SEQ.week` in `composerAi.ts`).

## Worked example (Overview, done 2026-07-15)
Input: name "Overview", intent "auto-writes what the week covers; zero author input,
pulls the week blueprint." Resolved: render_band `overview`, `bg-info` teal, `bi-binoculars`,
8 min, `inputs:[]`, `capabilities:[]`, fixed vista watermark (data-URI SVG), a 4-part
generation_prompt (welcome · What you'll cover · Why it matters · By the end you'll be able to)
steering `title` = "Overview — {week topic}" and `body_html`. Week-1 preview →
"Overview — Claude Code Foundations + Workspace" + a balanced 4-part body, $0.0003/run.
