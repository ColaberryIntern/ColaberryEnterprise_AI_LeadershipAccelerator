# Component API reference (verified vs `origin/main`, 2026-07-18)

All facts here were read from `origin/main`. The current feature-branch worktree may not
contain this subsystem — verify against `origin/main` if anything looks absent.

Key files:
- Model: `backend/src/models/CurriculumTypeDefinition.ts` (table `curriculum_type_definitions`)
- Routes: `backend/src/routes/admin/componentRoutes.ts` (all `requireAdmin`)
- Controller: `backend/src/controllers/componentController.ts`
- Services: `backend/src/services/components/*` (`componentService`, `componentAiService`,
  `capabilityRegistry`, `recipeRegistry`, `costEstimationService`, `promptTesterService`)
- Blueprint context: `backend/src/services/timeline/blueprintContext.ts`,
  `backend/src/services/timeline/sectionCurriculumContext.ts`
- Registry + seeders: `typeRegistry.ts`, `typeSeeder.ts`, `seedComponentAuthoring.ts`

---

## Two editor surfaces write the same table — don't cross them

- **Experience Studio / Experience Builder** → `/api/admin/components/*`, keyed by **slug**.
  This is the surface this skill uses.
- **Orchestration admin** → `orchestrationRoutes` (mounted `adminRoutes.ts:94`) also reaches
  `curriculum_type_definitions` (older CRUD, keyed by **id**). Prefer the components surface;
  editing the same type from both is a foot-gun.

---

## Endpoint map (`componentRoutes.ts`)

Collection / global:
| Method + path | Purpose |
|---|---|
| `GET /api/admin/capabilities` | The **25** Parts (`capabilityRegistry`) |
| `GET /api/admin/recipes` | The **12** authoring recipes |
| `GET /api/admin/components` | Library list + version/usage counts |
| `POST /api/admin/components` | **Create** (de-dupes slug, `status:'draft'`; NOT an upsert) |
| `POST /api/admin/components/generate` | AI drafts a component from `{description, recipe?, model?}` — nothing saved |
| `POST /api/admin/components/backfill` | Fill empty prompt bundles on the seeded types (`?force=true` overwrites — destructive) |
| `POST /api/admin/components/import` | Import a component package |
| `GET /api/admin/components/analytics` · `POST .../analytics/seed` | Analytics rollup / demo seed |
| `POST /api/admin/components/thumbnails/backfill` | Global thumbnail backfill |
| `GET /api/admin/components/renderers/surfaces` | List the 8 renderer surfaces + states |
| `POST /api/admin/components/renderers/backfill` | **GLOBAL** renderer backfill (there is NO `:slug/renderers/backfill`) |

Per-component (`:slug`):
| Method + path | Purpose |
|---|---|
| `GET /api/admin/components/:slug` | One component + version history |
| `PUT /api/admin/components/:slug` | Patch whitelisted `EDITABLE_FIELDS`; snapshots prior version, bumps `component_version` |
| `GET /api/admin/components/:slug/estimate` | Token/cost estimate |
| `POST /api/admin/components/:slug/preview` | `runtimePreview` — body `{variables?, model?, program_id?, week?}` |
| `POST /api/admin/components/:slug/codesign` | AI critique + ranked one-click patches |
| `POST /api/admin/components/:slug/test` | Run one prompt stage `{kind, variables?, model?}` |
| `POST /api/admin/components/:slug/thumbnail` | `{source:'template'|'custom', url?}` |
| `PUT /api/admin/components/:slug/approval` | `{approved:bool}` → sets `approved/at/by` (gates the Composer) |
| `GET/PUT /api/admin/components/:slug/lifecycle` | Lifecycle state |
| `POST /api/admin/components/:slug/render/:surface` | Render ONE of the 8 surfaces live |
| `GET/PUT /api/admin/components/:slug/dependencies` | Dependency graph |
| `GET /api/admin/components/:slug/compare/:a/:b` | Version diff |
| `GET /api/admin/components/:slug/export` | Export package |
| `GET /api/admin/components/:slug/versions` · `POST .../versions/:version/restore` | Version list / restore-as-new |
| `GET /api/admin/components/:slug/analytics` | Per-component analytics |

**Corrections to the pre-2026-07-18 skill:** `:slug/renderers/backfill` does NOT exist
(backfill is global); preview DOES accept `program_id`/`week` (earlier "variables/model only"
was a stale-branch read).

---

## Model fields (the real column shapes)

**Do not use `xp {...}` or `flags {...}` objects — they do not exist.** The columns are flat.

Identity / display: `id` (UUID), `slug` (STRING100, unique, **immutable after create**),
`label`, `student_label`, `description`, `icon` (default `bi-square`), `badge_class`
(default `bg-secondary`), `category` (STRING60), `tags` (JSONB `[]`), `status`
(STRING20; model default `'ready'`, but **create sets `'draft'`**; values draft|ready|published|deprecated),
`display_order`, `is_system`, `is_active`.

Registry metadata (re-asserted on boot by `typeSeeder` for canonical slugs):
`render_band` (**free `STRING(60)`, nullable — NOT a DB enum**), `bucket_default` (STRING30:
pre_class|learn|practice|build|reflect|share|advance), `difficulty` (STRING20: intro|core|stretch),
`learning_xp` / `builder_xp` / `community_xp` (nullable INTEGER), `estimated_time` (INTEGER, minutes),
`competencies` (JSONB — inconsistent in the wild: `string[]` from the registry, `{domain_id, weight}[]`
from `generateComponent`), `evidence_required` / `github_required` / `ai_evaluation` /
`instructor_review` / `portfolio_eligible` (BOOLEAN, default false), `can_create_variables` /
`can_create_artifacts` (BOOLEAN), `applicable_prompt_pairs` (JSONB `[]`), `certification_mapping` (JSONB `{}`).

The **seven** prompt columns (TEXT, nullable): `design_prompt`, `renderer_prompt`,
`generation_prompt`, `evaluation_prompt`, `reflection_prompt`, `github_prompt`, `improvement_prompt`.

Authoring / contracts: `thumbnail_url` (TEXT), `preview_examples` (JSONB `[]`), `variable_keys`
(JSONB `[]`), `learning_objectives` / `architect_domains` / `capabilities` (JSONB `[]`),
`inputs` (JSONB `[]` — `[{key,type,required}]`), `outputs` (JSONB `[]` — `[{key,type,description}]`),
`artifacts_produced` / `evidence_produced` / `portfolio_assets` / `github_assets` (JSONB `[]`),
`evaluation_type` (STRING20: none|ai|rubric|instructor|peer), `completion_rules`
(JSONB `{}` — `{on:'view'|'submit'|'evaluate'|'approve', min_score?}`), `dependencies` (JSONB `[]`,
slugs), `renderers` (JSONB `{}` — the 8 surfaces), `settings_schema` / `default_prompts` (JSONB `{}`).

Derived / system (never author these): `est_input_tokens`, `est_output_tokens`, `est_cost_usd`
(DOUBLE), `est_runtime_ms`, `component_version` (default 1), `version_locked`,
`approved` / `approved_at` / `approved_by` (set only via `/approval`).

### EDITABLE_FIELDS whitelist (`componentService.ts:18`)
`PUT :slug` and create **silently drop** anything not in this list. It includes: label,
student_label, description, icon, badge_class, all 7 prompts, thumbnail_url, preview_examples,
variable_keys, bucket_default, render_band, difficulty, the 3 XP ints, estimated_time,
competencies, category, tags, status, learning_objectives, architect_domains, capabilities,
inputs, outputs, artifacts_produced, evidence_produced, portfolio_assets, github_assets,
evaluation_type, completion_rules, dependencies, version_locked, renderers, can_create_variables,
can_create_artifacts, the 5 flags, is_active. **NOT editable here:** `slug` (create-time only),
`approved` (via `/approval`), all `est_*` and `component_version` (derived).

### Versioning is automatic
Every `updateComponent` snapshots the pre-edit state into `component_versions` and bumps
`component_version` in one transaction. `restore` writes the old snapshot as a **new** version
(never destructive).

---

## The three forced JSON schemas (they differ — know which you're in)

1. **`runtimePreview` / `POST :slug/preview`** (`componentAiService.ts:118`, `max_tokens 1800`):
   `title, summary, body_html (clean self-contained HTML, no scripts), questions (string[]),
   reflection (string), discussion_prompt (string), github_task (string|null),
   evaluation_criteria (string[]), completion (string)`. **9 keys.**
2. **Persisted student content** (`cardContentService.ts`, `max_tokens 3200`): only
   `title, summary, body_html, questions[], reflection`. **5-key subset** — the extra 4 preview
   keys do NOT persist to the card. Preview is therefore a lower-fidelity approximation.
3. **`generateComponent` draft** (`componentAiService.ts:54`, `max_tokens 2200`): component
   *metadata* — label, student_label, description, category, tags, difficulty, render_band,
   bucket_default, the 3 XP ints, learning_objectives, architect_domains, competencies
   (`{domain_id, weight}[]`), capabilities, variable_keys, and all 7 prompts. Nothing saved.

`DEFAULT_MODEL = 'gpt-4o-mini'` (`costEstimationService.ts:24`); all calls use
`response_format: json_object`, temperature 0.6.

---

## The WEEK CONTEXT block (`blueprintContext.ts:49`)

`getBlueprintContext(programId, week)` loads the newest `CurriculumBlueprint` for
`(program_id, week)` and builds this exact prompt prefix (each line emitted only if the field
is present):

```
WEEK CONTEXT — this content is part of Week {week} of the AI Systems Architect Accelerator: "{title}".
Week focus: {purpose}
Topics & competencies covered this week: {competencies}.
Learning objectives: {learning_objectives}.
Architect domains: {architect_domains}.
Student outcomes: {student_outcomes}.
Success criteria: {success_criteria}.
Level: {difficulty}.
Estimated workload: ~{estimated_hours} hours.
Make everything you generate specific to this week's topic and level — do not produce generic content.
```

Returns `null` when there's no blueprint (e.g. Week 0 free preview). Blueprints are **prod DB
rows** in `curriculum_blueprints` (program `92b98a72-...`), seeded/elaborated via
`backend/src/seeds/seedWeekBlueprints.ts` — not repo config files. Edit a blueprint ⇒ regenerate
dependent cards.

**Section roster** (`sectionCurriculumContext.ts`): for `SECTION_ROSTER_TYPES` (a code `Set`,
today `{'overview'}`) the runtime also prepends "THIS WEEK'S ACTIVITIES — the concrete curriculum
the student will work through in Week {n}: …". A new week-summary type must be added to that Set
in code to receive it.

---

## Capabilities (the 25 "Parts") — `GET /api/admin/capabilities`

`ai_chat, artifacts, bookmarks, calendar, camera, comments, discussion, evaluation, evidence,
github, hint_system, likes, mentor_review, notifications, peer_review, portfolio, quiz, reflection,
retry, rubric, scoring, sharing, transcript, video, voice`.

Keep Parts consistent with flags: scored ⇒ `quiz`+`scoring` (+`retry` for a graded eval);
evidence ⇒ `evidence`+`artifacts` (+`github` if `github_required`); passive read ⇒
`bookmarks`/`comments`/`likes`. `inputs` (author textboxes), `capabilities` (Parts palette), and
the Studio generate button are **three independent things** — a zero-input type still keeps its
generate button; set `inputs: []` and `variable_keys: []` and choose `capabilities` explicitly.

## Recipes (the 12 draft templates) — `GET /api/admin/recipes`
`starter, interactive, executive, certification, enterprise, workshop, live_class, bootcamp,
challenge, project, assessment, interview`. Pass the closest one to `generate`.
