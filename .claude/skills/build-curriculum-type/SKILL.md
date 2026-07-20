---
name: build-curriculum-type
description: Build or update ONE Curriculum Type end to end — an Experience Studio "AI Component" (a row in curriculum_type_definitions, backend /api/admin/components/*). From a name + one-line intent it derives the render band, Parts, generation prompt (written against the auto-injected week blueprint), thumbnail, and I/O contracts, then create-or-updates by slug (idempotent), previews against a real week, approves, and promotes to prod via two committed seed files. Invoke when Ali says "build a curriculum type", "set up the {X} card type", "certify the Experience Studio components", or wants to author/fix a curriculum type fast and accurately.
---

# build-curriculum-type — the reusable Curriculum Type builder

A **Curriculum Type** = one **AI Component** row in `curriculum_type_definitions`
(model `backend/src/models/CurriculumTypeDefinition.ts`), authored in the
**Experience Studio** tab of `/admin/orchestration`. Backend routes:
`/api/admin/components/*` (`componentController.ts` + `routes/admin/componentRoutes.ts`);
services in `backend/src/services/components/*`. This skill takes as little as a
**name + one line of intent** and produces a complete, working, approved, **promoted**
component. Everything here is verified against `origin/main` (2026-07-18).

> **This skill was hardened from the real Overview / Self Study / Survey / Reflection
> builds (7/15–7/18).** The gotchas below are the exact taxes those builds paid. Read
> "Read this first" before touching anything — it prevents the mistakes that cost the
> most rework.

---

## Read this first — the five things that bit every prior build

1. **The subsystem lives on `main`, not your feature branch.** The current worktree
   (`workstream/*`) almost certainly has the *legacy* 18-column model with **no**
   `render_band` / `generation_prompt` / component routes. Author against **`main`/dev**.
   Confirm before you start: `git ls-tree -r origin/main --name-only | grep componentController`.
   If you're probing the dev backend, use the exec pattern in [Execution](#execution).

2. **Slug is an immutable foreign key, and `label` can lie about it.** `timeline_cards.type`,
   `component_versions.component_slug`, and analytics all key on `slug`. **Never rename a
   slug** — it orphans real student data. Worse: a type's display name can diverge from its
   slug. *"Self Study" is slug `warmup`* (`render_band: 'warmup'` too). Always `GET` the slug
   first and read its real `label`/`student_label` before assuming the type is new.

3. **Shipping a type means committing TWO code files, not one DB write.** A DB edit via
   `/api/admin/components/*` is dev-local and does not reach prod. See
   [Durability & promotion](#durability--promotion). Get this wrong and your work silently
   never ships.

4. **The student sees a ~400px right-side drawer, not a page.** Sandboxed iframe, no JS,
   token-capped. Preview ≠ the student runtime. New visual *behavior* is **code, not data**.
   Full details in **[references/render-surface.md](references/render-surface.md)** — read it
   before you write any `body_html` or design a layout.

5. **Approval is functional, not cosmetic.** `scaffoldPlan` filters the Curriculum Composer
   to `approved: true` slugs (`composerAi.ts:82`). An unapproved type **cannot be scheduled**.

---

## Data vs. Code — the mental model that saves the most time

| You want to change… | It's… | Where |
|---|---|---|
| Title/body wording, Parts, thumbnail, I/O contracts, difficulty, XP | **DATA** (author it) | `curriculum_type_definitions` row → promote to `seedComponentAuthoring.ts` |
| The student chip label/icon, registry metadata (render_band, flags, competencies) for a canonical type | **DATA re-asserted by CODE on boot** | `typeRegistry.ts` (see [durability](#durability--promotion)) |
| A brand-new *visual experience* (a reader, a live survey, an interactive panel) | **CODE** | `frontend/.../CardDetailBody.tsx` (+ siblings) — a PR, not a component edit |
| Whether a week-summary type sees its sibling activities | **CODE** | `SECTION_ROSTER_TYPES` in `sectionCurriculumContext.ts` |

If the type only needs a new generation prompt + Parts + thumbnail over an **existing**
render band, it's pure authoring (fast). If it needs a render band with no existing
renderer, flag the code PR as a separate follow-up — do not fake it in `body_html`.
The render bands that already have a bespoke renderer are listed in
[references/render-surface.md](references/render-surface.md).

---

## The visual quality bar — a DISTINCT format + a REAL thumbnail (every type)

Proven on the 10 intelligence-pipeline types (2026-07-20). Two rules that make types
look intentional instead of interchangeable. Apply them to every type.

**1. Ship a DISTINCT, self-contained styled `body_html` — never a generic `<h3>` list.**
The generic/`intel` render band renders through `lessonDoc()`, which **preserves `<style>`**
(only the reader/deepdive path strips it via `stripUnsafe`). So a type can carry its own
complete look — a news brief, a spec sheet, a pull-quote, a system map — not the same
seven headings every other type uses. If all your types read alike, this is why.
- Author each type's **CSS + structure once** in a shared module and reuse it for BOTH the
  sample content AND the generation prompt. Reference: `backend/src/seeds/intelCardFormats.ts`
  (`{ style, render(data), sample, structure }` per type) → `sampleBodyFor(slug)` feeds
  `seedIntelSampleCards.ts`; the same `style` + `structure` feed the generation prompt.
- The generation prompt says: **"FIRST copy this `<style>` block VERBATIM, then emit the
  markup using ONLY those classes in exactly this structure: …"** (the Announcement type and
  all 10 intelligence types do this — the model reliably reproduces a pinned `<style>`).
- Do **not** repeat the card's plain title as an `<h1>` inside the body — the drawer/workspace
  chrome already shows `title`. Lead with the format's distinctive element.

**2. Give it a REAL image thumbnail via the gpt-image-2 pipeline — the image IS the branded
background (like the videos), not a vector/text placeholder.** Pipeline in
`scripts/curriculum-type-thumbnails/`:
1. Add `{ "slug", "label", "scene" }` to `prompts.json` — a text-free conceptual scene
   metaphor (e.g. reflection → "a figure gazing at their reflection in a mirror"). The
   `style_suffix` supplies the enterprise art direction (navy/teal, coral accent, no text/logos).
2. Generate on the VPS host where `OPENAI_API_KEY` lives (~$0.06/img):
   `ssh root@95.216.199.47 'cd /root/thumb-gen && node generateOnHost.js --only <slug>'`
   (idempotent by output file; capped retries). `scp` the raw PNG back from `/root/thumb-gen/raw/`.
3. `node scripts/curriculum-type-thumbnails/compositeAndInstall.js --raw <dir>` → center-crops
   to 3:1, resizes 900×300, stamps the Colaberry wordmark, writes
   `frontend/public/thumbnails/curriculum-types/<slug>.jpg`.

**Thumbnail gotcha (cost a real bug):** an explicit `COMPONENT_AUTHORING[slug]` entry
**overrides the `...AI_THUMBNAILS` spread**. So an authored type MUST set
`thumbnail_url: thumbnailUrlFor(slug)` on its own entry AND have its slug in `THUMBNAIL_SLUGS`,
or it ships with **no thumbnail** (this is exactly how `community_live_session` shipped blank).
`seedComponentAuthoring.test.ts` catches it locally — but that test is **not in CI**, so run it.

---

## Inputs

**Tier 1 (required):** `name` (→ `label`; `slug` = slugify(name) = idempotency key) and
`intent` (one line: what the student does, why the type exists).

**Tier 2/3 (override the derivation):** the full field list, real column shapes, enums,
and defaults are in **[references/component-api.md](references/component-api.md)**. Do not
trust the old `xp {...}` / `flags {...}` groupings — those were fictions. The real columns
are flat: `learning_xp`, `builder_xp`, `community_xp` (integers) and `evidence_required`,
`github_required`, `ai_evaluation`, `instructor_review`, `portfolio_eligible` (booleans).

Ask Ali only the genuinely-his decisions: title format, thumbnail picture, accent color,
content shape, whether it's scored. Everything else is derived and logged.

---

## How the generation prompt actually works (author against this)

`runtimePreview(slug, variables, model, programId, week)` (`componentAiService.ts:100`):

- **Prepends a "WEEK CONTEXT" block** via `getBlueprintContext(programId, week)` — the week's
  title, focus/purpose, competencies, learning objectives, architect domains, student
  outcomes, success criteria, level, and workload, ending with *"Make everything you generate
  specific to this week's topic and level — do not produce generic content."* Write the
  `generation_prompt` **referencing "the WEEK CONTEXT above"**, never `{{blueprint.*}}`. Only
  `variables` flow through `{{...}}` via `resolvePrompt`.
- **For `SECTION_ROSTER_TYPES`** (today just `overview`), also prepends "THIS WEEK'S
  ACTIVITIES" — the real placed roster — so "what you'll cover" names the actual cards. A new
  week-summary type must be **added to that Set in code** to get this.
- **Forces a fixed output schema** (9 keys): `title, summary, body_html, questions[],
  reflection, discussion_prompt, github_task, evaluation_criteria[], completion`. The prompt's
  job is to STEER what fills those — especially `title` and `body_html`.

**Prompt rules learned the hard way** (see the shipped exemplars in
[references/worked-examples.md](references/worked-examples.md)):
- **Use the week's section TITLE, never the week number.** Overview once "just said Overview
  a bunch of times" because it wasn't grounded in the title.
- Spell out `title` format exactly (e.g. `Overview — {week topic from WEEK CONTEXT}`).
- Set the unused keys explicitly (`questions: []`, `github_task: null`, …) so the model
  doesn't invent them.
- `body_html` = **clean, self-contained, fully-balanced HTML, no scripts, no inline styles**
  (the runtime and the reader enforce this). For bespoke-renderer types (e.g. Self Study), the
  content carries NO `<style>/<nav>/<script>` — the renderer supplies all of that.
- After a **blueprint edit, regenerate** — old outputs are cached and near-identical until you do.

---

## Execution (idempotent, key on slug)

**A. Confirm identity.** `GET /api/admin/components/:slug`. 404 ⇒ new (create). 200 ⇒ read the
existing `label`/`student_label`/`render_band` first (guard against the `warmup`=Self Study trap).

**B. Draft.** Minimal input → `POST /api/admin/components/generate {description, recipe?}`
(closest of the 12 recipes via `GET /api/admin/recipes`). Sanity-check the draft; it is NOT saved.

**C. Create or update.**
- New: `POST /api/admin/components` (create **de-dupes** the slug — it is NOT an upsert, so the
  GET-first check in step A is what makes this idempotent; created rows get `status: 'draft'`).
- Existing: `PUT /api/admin/components/:slug` — patches only whitelisted `EDITABLE_FIELDS`
  (silently drops anything else; `approved` and `slug` are not editable here), auto-snapshots
  the prior version and bumps `component_version`.
- Set the full resolved field set: identity, `render_band`, `bucket_default`, `difficulty`,
  the three XP ints, the five flag booleans, `capabilities` (Parts), the prompt(s),
  `inputs`/`outputs`/`completion_rules`/`evaluation_type`, `estimated_time`, `category`, `tags`,
  `competencies`. Never omit a JSONB contract — write `[]` / `{}`.

**D. Thumbnail.** Prefer a **static asset path** `thumbnail_url: /thumbnails/curriculum-types/<slug>.jpg`
(regen pipeline: `scripts/curriculum-type-thumbnails/`) over an embedded data-URI — an LLM can
copy a short URL verbatim into the prompt-driven thumbnail renderer; it cannot reproduce a
data-URI. There are **three** thumbnail surfaces — see [render-surface.md](references/render-surface.md).
Template fallback: `POST /api/admin/components/:slug/thumbnail {source:'template'}`.

**E. Preview against a REAL week.** `POST /api/admin/components/:slug/preview {variables, model,
program_id, week}`. Program "AI Systems Architect Accelerator" = `92b98a72-8681-4f04-8ba1-16a18334cd0b`
(Week 1 = "Claude Code Foundations + Workspace"). **Read the render in the drawer's shape**, not
as a page. Weak? `POST .../:slug/codesign` for ranked patches, apply, re-preview (≤3 passes).
Note: preview caps at 1800 tokens; the persisted student path (`cardContentService`) uses 3200
and returns only a 5-key subset — so **preview is a lower-fidelity approximation of the real card.**

**F. Estimate + approve.** `GET .../:slug/estimate` (tokens/cost). `PUT .../:slug/approval
{approved:true}` when Ali signs off (remember: this gates the Composer).

**G. Promote** (see next section) — this is the step that actually ships it.

**H. Verify.** `GET /api/admin/components/:slug`; if any code changed, `tsc --noEmit`.

### Preview across ALL perspectives — tile + pop-up + workspace (REQUIRED)
The API `/preview` (step E) is ONE low-fidelity approximation. Every type renders on
**three real surfaces**, and it can look right on one and broken on another — the Skills
Course looked perfect in the drawer but rendered as a **giant unstyled icon in the
workspace**, because the workspace is not a `.tl-de` container so the `timeline.css`
styling never applied. So always review the REAL generated content on all three:

1. **The tile** (classroom feed) — `TimelineCard.tsx`: the `type_thumbnail`/poster, the
   `student_label` chip, the meta line, and the click/open behavior (which button opens the
   drawer vs. an external link).
2. **The pop-up drawer** (~400–560px, inside `.tl-de`) — `CardDetailBody.tsx`: the real
   `lessonDoc(body_html)` for a generic band, or the bespoke renderer (reader/survey/quiz/
   skills). Generic `body_html` **keeps its own `<style>`** (lessonDoc does NOT strip it);
   the reader/deepdive path DOES strip `<style>/<script>` via `stripUnsafe`.
3. **The workspace** — `RuntimeWorkspace.tsx`: the center render for the band (a `fill`
   iframe for `body_html`; a bespoke panel otherwise) plus the AI Mentor + comments +
   readiness bar. **Bespoke panels must be wrapped in `.tl-de`** so their scoped CSS applies,
   and the runtime open endpoint (`runtimeService.ts`) must actually RETURN the fields the
   panel needs (e.g. `course`, `points`) — a field the feed sends but the runtime omits is
   why "the workspace doesn't bring the info over."

**Render it faithfully with no live server:** generate the REAL persisted content on dev
(`generateCardContent(cardId)` via the exec pattern — the 3200-token student path, NOT the
1800-token `/preview`), then build ONE self-contained HTML that shows the card as a tile, a
~430px drawer frame that reconstructs `lessonDoc`/`readerDoc` **verbatim** (base stylesheet +
the card's `body_html` in a sandboxed iframe), and a wide workspace frame — and open it for
Ali. Do this for every type so Ali reviews the whole journey at once, not one screen at a time.

### Running against dev without a server/auth (the proven pattern)
`accelerator-dev-backend` on the VPS runs current main with DB `accelerator_dev1`
(**the env var `DB_NAME=accelerator_prod` LIES — always confirm with `select current_database()`**).
Pipe a Node script over stdin — nothing is left on the box, and it uses the app's own models:

```
ssh root@95.216.199.47 'docker exec -i accelerator-dev-backend node' < script.js
```

In the script, require the compiled dist: `require('/app/dist/models/CurriculumTypeDefinition')`,
`require('/app/dist/services/components/componentAiService')` (runtimePreview),
`require('/app/dist/services/timeline/blueprintContext')` (getBlueprintContext),
`require('/app/dist/seeds/seedComponentAuthoring')`.

---

## Durability & promotion

**A DB edit via the API is dev-local and unpromoted.** Precisely:
- A **container reboot preserves** your `generation_prompt` / `capabilities` / `thumbnail_url` —
  nothing wipes them. **But** the boot `typeSeeder.seedCurriculumTypeDefinitions()` (gated on
  `TIMELINE_ENGINE_ENABLED`) **re-asserts registry metadata** for the 36 canonical slugs —
  `render_band, bucket_default, learning/builder/community_xp, difficulty, competencies`, the
  five flags, `applicable_prompt_pairs` — from `typeRegistry.ts`, silently reverting any API
  edit to **those** columns.
- A **dev-DB reset/reseed** or `POST /api/admin/components/backfill?force=true` erases anything
  not in code.
- **Prod is a separate database.** It only ever receives your config through committed code.

So to actually ship a type, commit **both** (then deploy — boot re-applies to the prod DB):

1. **`backend/src/seeds/seedComponentAuthoring.ts`** — add/patch the slug's entry in
   `COMPONENT_AUTHORING` (a `{slug: authoredFields}` map). This carries the authored experience:
   `generation_prompt`, `renderers`, `thumbnail_url`, `capabilities`, `inputs`/`outputs`,
   `completion_rules`, `evaluation_type`, `category`, icon, `estimated_time`, `approved`,
   `status`. Idempotent, keyed on slug, `renderers` merge key-wise, missing slugs reported (never
   created). Run it: `node dist/seeds/seedComponentAuthoring.js`.
2. **`backend/src/services/timeline/typeRegistry.ts`** — if you changed the student chip
   (`label`/`student_label`/`icon`) or any registry-metadata column for a canonical type, change
   it HERE too, or the boot reseed reverts it and the student-facing chip stays stale (this is
   the exact "chip still said Warm-up" bug).

New (non-canonical) type not in `typeRegistry`? Then only `seedComponentAuthoring.ts` applies —
but the row must already exist, so create it via the API (or add it to the registry) first.

**CI will not save you:** the component/blueprint tests are not in the CI jest allowlist, so green
CI ≠ validated. Validate locally or via the dev-exec pattern. Prod deploys after hours only.

---

## Pre-flight checklist (before authoring)
- [ ] Am I reading `origin/main`, not the feature-branch worktree?
- [ ] Does the slug already exist? What are its real `label`/`student_label`/`render_band`?
- [ ] Is this pure authoring (existing render band) or does it need a **code** renderer / a new `render_band`? (If code — scope a PR, don't fake it in `body_html`.)
- [ ] Which render band, and does its renderer already exist? ([render-surface.md](references/render-surface.md))
- [ ] Scored/evidence? → questions/scoring may be **code-driven** (assessmentService), prompt only frames title/summary.

## Definition of Done
- [ ] Component created/updated by slug; all JSONB contracts explicit (`[]`/`{}`).
- [ ] `generation_prompt` grounded in WEEK CONTEXT, uses the section title (never the number), unused keys set explicitly.
- [ ] Emits a **distinct, self-contained styled `body_html`** (its own `<style>`+structure, not a generic `<h3>` list) — see "The visual quality bar".
- [ ] Previewed against a real week across **ALL perspectives** (tile + pop-up drawer + workspace), each render verdict good — a type can look right in the drawer but broken in the workspace (unstyled panel / missing runtime field). See "Preview across ALL perspectives".
- [ ] **Real image thumbnail** generated via the gpt-image-2 pipeline (not a placeholder), `thumbnail_url` set **explicitly** on the authored entry (the spread-override gotcha) + slug in `THUMBNAIL_SLUGS`, showing on all surfaces.
- [ ] Approved (if Ali signed off) — remember it gates the Composer.
- [ ] **Promoted:** `seedComponentAuthoring.ts` entry committed **and** `typeRegistry.ts` updated if the chip/metadata changed.
- [ ] `tsc --noEmit` clean if any code changed; PROGRESS.md entry with Session ID + verification.

---

## Bulk certification pass (the next wave)

When certifying many types at once (the ~36 registry types, `typeRegistry.ts:50`), don't do them
one conversation at a time. Run a batch loop:

1. **Inventory.** `GET /api/admin/components` → for each type record: `approved`, whether
   `generation_prompt` is set, `render_band`, and whether its render band has a real renderer.
   Sort into: *needs authoring*, *needs a code renderer* (defer to PRs), *already certified*.
2. **Group by render family.** Types sharing a render band + Part set (e.g. the three `event`
   types; `task`/`artifact`/`github` builders) can reuse one prompt skeleton — author the family
   together. Certifying one type drags its render family's renderer along, so validate the family.
3. **Author → preview → codesign in a pipeline**, one pass per type, previewing each against the
   week it naturally sits on. Keep a running ledger (slug · authored? · previewed? · approved? ·
   promoted?) so a crash doesn't lose place.
4. **Promote in one commit per batch** to `seedComponentAuthoring.ts` (+ `typeRegistry.ts` where
   metadata/chip changed), run the seed on dev, verify with an independent DB query (not the
   seed's own output), then ship after hours.
5. **Report** the ledger + the deferred code-renderer PRs.

For a genuinely large fan-out (author + adversarially critique each type in parallel), this is a
good candidate for a Workflow — but only if Ali opts into multi-agent orchestration.

---

## Output (report back)
slug · created|updated · component_version · render_band/bucket/difficulty/XP · Parts ·
which of the 7 prompt stages set · thumbnail source+URL (+ which surfaces show it) ·
preview verdict (title + a line on the body, judged in the drawer's shape) · cost estimate ·
approved? · **promoted?** (seedComponentAuthoring + typeRegistry) ·
a ✅/⚠️ checklist (identity·render-surface·parts·prompts·contracts·thumbnail·preview·approval·promotion) ·
anything needing a NEW render_band or a code renderer (flag as a separate PR).

## References
- **[references/component-api.md](references/component-api.md)** — verified endpoints, model
  fields/contracts, forced schemas, WEEK CONTEXT, capabilities, recipes, the dual editor surface.
- **[references/render-surface.md](references/render-surface.md)** — the drawer constraints,
  bespoke render bands (code), the three thumbnail surfaces, preview vs. student runtime.
- **[references/worked-examples.md](references/worked-examples.md)** — Overview, Self Study,
  Survey, Knowledge Check, Evaluation as shipped copy-paste templates + their generation prompts.
