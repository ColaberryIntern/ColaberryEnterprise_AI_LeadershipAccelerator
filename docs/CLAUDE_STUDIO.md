# Claude Studio — the weekly Claude.ai curriculum type

Claude Studio is a first-class curriculum type (`claude_studio`) that teaches students
to **think** with Claude.ai — conversations, Projects, and Artifacts — as the counterpart
to the Claude Code spine (Setup Lab, Prompt Lab, Build Artifact(s) Lab), which teaches
them to **build**.

Every week runs the same four-stage loop:

| Stage | What the student does |
|---|---|
| **Explore in Claude** | Frame the problem, question assumptions, reason conversationally |
| **Organize in a Project** | Persistent instructions, approved sources, reusable context |
| **Create an Artifact** | An interactive or presentable output |
| **Prove and Publish** | Explain the decisions, reflect, attach the evidence |

Each week produces one concrete **career asset** that feeds the portfolio, the case-study
pipeline, and the student's employment profile.

---

## Where everything lives

| Concern | File |
|---|---|
| Content contract (types, stage order, launch config) | `backend/src/data/claudeStudios/types.ts` |
| The 13 weeks of authored content | `backend/src/data/claudeStudios/weeks00to04.ts`, `weeks05to08.ts`, `weeks09to12.ts` |
| Lookups + the adaptation ledger | `backend/src/data/claudeStudios/index.ts` |
| `body_html` renderer + pinned `<style>` | `backend/src/seeds/claudeStudioFormat.ts` |
| Idempotent card seeder + content validation | `backend/src/seeds/seedClaudeStudioCards.ts` |
| Registry metadata (chip, band, XP, flags) | `backend/src/services/timeline/typeRegistry.ts` |
| Authored component (generation prompt, Parts, thumbnail) | `backend/src/seeds/seedComponentAuthoring.ts` |
| Submission, validation, evidence | `backend/src/services/runtime/claudeStudioService.ts` |
| HTTP boundary | `backend/src/controllers/runtimeController.ts`, `backend/src/routes/participantRoutes.ts` |
| Student renderer | `frontend/src/components/timeline/ClaudeStudioRender.tsx` |
| Pure parser + draft storage | `frontend/src/components/timeline/claudeStudioParse.ts` |
| Tile ribbon and band colour | `frontend/src/components/timeline/TimelineCard.tsx` |

---

## The week map

The source curriculum brief and this repo's existing weekly themes are different tracks.
Per the brief's own instruction, **the existing themes were preserved** and each studio's
scenario was adapted to them while retaining the intended career asset. Every deviation is
recorded in the studio's `adaptation` field and returned by `adaptations()`.

| Week | Repo week theme | Claude Studio | Career asset |
|---|---|---|---|
| 0 | Free AI Preview | Claude Working Agreement Studio | Personal Claude Project + AI Working Agreement |
| 1 | Claude Code Foundations + Workspace | Problem Framing Studio | Interactive Business Problem Brief |
| 2 | Agent Skills (build 3 skills) | Research and Evidence Studio | Source-grounded Research Brief |
| 3 | Claude API + Workflow Assistant | Stakeholder and Requirements Studio | Interactive Requirements Explorer |
| 4 | Prompt Engineering + Prompt Library | Data Storytelling Studio | Executive Insight Brief |
| 5 | MCP Foundations + First MCP Server | Decision Intelligence Studio | Scenario and Recommendation Model |
| 6 | Advanced MCP + System Integration | Agent and Workflow Design Studio | AI Employee Charter + Workflow Simulator |
| **7** | Subagents + Multi-Agent Team | **Certification Preparation Studio** | Certification Readiness Coach |
| 8 | Claude Code Workflows + Automation | Executive Communication Studio | Role-Aware Communication Kit |
| 9 | Reliability Engineering + Quality Layer | Evaluation and Quality Studio | AI Output Evaluation Lab |
| 10 | Governance + Governance Engine | Trust, Risk, and Governance Studio | AI Trust and Risk Review |
| 11 | Systems Architecture + Architecture Package | Career Evidence Studio | Recruiter-Ready Project Story |
| 12 | Capstone + Architect Expo | Capstone Defense and Launch Studio | Interactive Capstone Defense Room |

### Documented adaptations

- **Weeks 6 and 7.** The source brief pairs Week 6 with agent design and fixes Week 7 as the
  first certification-prep studio. This repo's Week 6 is Advanced MCP (tool scoping, file-access
  roots, real system integration) — exactly the material an AI employee charter must specify —
  so the charter lands there, and Week 7 (Subagents) carries certification prep. Both the career
  asset and the Week 7 certification gate are honoured.
- **Weeks 9 and 10 are swapped** relative to the brief. This repo's Week 9 is Reliability +
  Quality, whose own purpose is adding evaluation gates "so AI output is measured, not assumed";
  its Week 10 builds the Governance Engine. The evaluation studio and the trust/risk studio each
  moved to the week that already carries them. Both assets are retained.
- **Weeks 1–5, 11, 12** keep their brief-assigned asset with the scenario re-pointed at the
  repo week's actual deliverable (the Architect Workspace, the three Agent Skills, the Workflow
  Assistant, the Prompt Library evaluation data, the first MCP server, the Architecture Package,
  the Architect Expo).
- **Week 0** maps 1:1 and needs no adaptation.

`adaptations()` returns this list programmatically; the tests assert every deviation is
documented and that the week/theme pairs still match `data/weekBlueprints.ts`.

### Certification timing

`certification_active` is `false` for weeks 0–6 and `true` from week 7. Two tests enforce it:
one on the flag, and one scanning every student-facing string in weeks 0–6 for certification
language presented as an active activity. The generation prompt carries the same rule for
studios generated onto non-canonical weeks.

---

## Running the seed

The seed is idempotent and keyed on `(program_id, week, type)` — re-runs update in place and
never duplicate. It validates all 13 weeks **before** the first write, so a content defect
aborts with a named week rather than leaving a half-seeded curriculum.

```bash
# Dry run — prints the plan, writes nothing
CLAUDE_STUDIO_DRY_RUN=1 node dist/seeds/seedClaudeStudioCards.js

# Real run, in-container after deploy
docker exec accelerator-backend node dist/seeds/seedClaudeStudioCards.js

# Locally
cd backend && npx ts-node src/seeds/seedClaudeStudioCards.ts
```

Target a different program with `CLAUDE_STUDIO_PROGRAM_ID`. The component authoring seed
(`node dist/seeds/seedComponentAuthoring.js`) must have run at least once so the
`claude_studio` row exists — it is created by the boot type seeder from `typeRegistry.ts`.

---

## The `body_html` contract

`claudeStudioFormat.ts` renders each studio to self-contained HTML carrying data attributes;
`claudeStudioParse.ts` reads them back to drive native controls. Both sides are asserted by
tests, so a rename fails a build rather than silently degrading the card.

```
root      <div class="cs" data-claude-studio="1" data-chat-url data-projects-url
               data-cert-active data-career-asset data-week-theme>
stage     <section class="cs-stage" data-stage="explore|organize|create|prove"
               data-title data-min>  <p class="cs-inst">  <ol class="cs-steps">
prompt    <div class="cs-prompt" data-prompt="starter|improve|followup"
               data-label data-why>  <pre class="cs-pre">
blocks    <section class="cs-block" data-block="project|artifact|trust|deliverables|reflection|rubric">
checks    <li data-check="1">        free response  <p data-free-response="1">
rubric    <tr data-dimension="Reasoning|Evidence|Communication|Judgment|Responsible AI">
```

The markup ships its own `<style>`, so if the bespoke renderer is unavailable the card still
renders correctly through the generic `lessonDoc` iframe. That fallback is a visible downgrade,
never a blank card.

---

## Completion, evidence, and privacy

**Completion is earned, not clicked.** `POST /api/portal/runtime/cards/:cardId/claude-studio`
requires all four stages acknowledged, every reflection self-check confirmed, a well-formed
Artifact link, and a written reflection. The server re-validates everything the form checks.

**Points cannot be farmed.** Exactly one `PortfolioArtifact` exists per `(enrollment, card)`.
A resubmission revises that record — the attempt counter increments, `first_submitted_at` is
preserved — and completion runs through the idempotent `onCardCompleted` path, so points are
awarded once regardless of how many revisions follow.

**URLs are format-checked, never fetched.** Submitted links must be `https`, carry no embedded
credentials, and not point at loopback or private addresses (a reviewer could not open those).
The stored record is marked `verification: 'unverified_link'` and `review_state:
'pending_review'`, and the UI says so in plain words. Nothing downstream may upgrade that
status without a human review.

**No private Claude data is captured.** We never receive, request, or store conversations,
prompts, or Project sources. What is stored is what the student chose to submit: links they own
plus their own writing. `assertNoConversationDump` rejects a pasted transcript rather than
silently retaining it.

**Claude.ai is never embedded.** Launch controls are plain outbound links opened in a new tab
against the student's own authorized account. Nothing automates authentication or scrapes
private content. The targets are configurable via `CLAUDE_STUDIO_CHAT_URL` and
`CLAUDE_STUDIO_PROJECTS_URL`, and are also carried as card data attributes so an admin can
retarget them without a deploy.

---

## Guided prompt inputs

Authored prompts carry bracketed fill-ins — `[paste the complaint verbatim]`,
`[describe option A]`. The card turns each one into a labelled field in a **Your answers**
panel above the prompts. Typing an answer fills **every** prompt that uses that placeholder,
live, and Copy hands over the finished text.

- Placeholders are deduped by exact text, so one answer feeds several prompts; the label says
  *"used in N prompts"* when it does.
- Long or paste-style fill-ins get a textarea, short ones a single-line input
  (`extractPromptFields` decides, from length and words like *paste*, *describe*, *list*).
- An **unanswered placeholder is left visible** rather than blanked. A silent gap reads as
  finished and quietly asks Claude to work from nothing; `[describe option A]` is honest about
  what is missing. A note above the prompt says so.
- A one-character bracket (`[1]`, `[a]`) is treated as a footnote marker, not a fill-in.
- **These answers never leave the browser.** They live in the local draft alongside the rest of
  the student's in-progress work, are not part of the submission payload, and never appear in an
  analytics event. The panel says this on the card.
- Instructor preview shows the authored prompt with its placeholders intact and no input panel.

Why it works this way: the first version expected the student to copy the prompt and hand-edit
the brackets inside Claude. That is easy to skip, and the failure is silent — you end up sending
a prompt that still literally says `[describe your role]`.

---

## Analytics

The renderer emits events through the existing `frontend/src/utils/tracker.ts` layer, which
already no-ops under Do Not Track and when the tracker never initialised:

| Event | Fired when | Payload |
|---|---|---|
| `claude_studio_viewed` | The studio is opened (once per mount) | `cert_active`, `stages` |
| `claude_studio_stage_completed` | A stage checkbox is ticked | `stage`, `done`, `total` |
| `claude_studio_prompt_copied` | A prompt is copied | `kind`, `index` |
| `claude_studio_launched` | A Claude.ai launch link is clicked | `target` (`conversation` \| `projects`) |
| `claude_studio_submitted` / `_revised` | A submission succeeds | `attempt`, `has_project_proof` |

Every event carries `card_id` and `variant` (drawer or workspace) and **nothing else**.

**What is deliberately never sent:** prompt text, reflection text, the Artifact or Project-proof
URL, or anything the student wrote or pasted. A studio's premise is that the student's Claude
work stays theirs, and an analytics call is exactly where that promise leaks if nobody says so
out loud. Preview mode (an instructor looking at a studio) emits nothing at all.

Card open, start and completion are additionally tracked server-side by the existing
`TimelineCardProgress` / `onCardCompleted` progression path, as for every other type.

---

## Authoring a studio for a non-canonical week

The 13 canonical weeks are hand-authored. For any other week, drop a Claude Studio card on it
in the Curriculum Composer and the Experience Studio generation prompt produces a conforming
studio: it pins the same `<style>` and the same data attributes, so it renders through the same
bespoke renderer. The prompt carries the certification-timing rule and the responsible-AI rules
(no fabricated stakeholder statements, no simulation presented as a test run or a working agent,
no reproduced exam questions).

---

## Tests

```bash
cd backend && node ../node_modules/jest/bin/jest.js --config jest.config.ts --testPathPattern "claudeStudio"
cd frontend && CI=true ../node_modules/.bin/react-scripts test --watchAll=false --testPathPattern "claudeStudioParse"
```

- `backend/src/data/__tests__/claudeStudios.test.ts` — week coverage, four-stage order, prompts,
  rubric dimensions, trust checkpoints, certification timing, adaptation ledger, week-theme
  alignment with `weekBlueprints.ts`, no stub text.
- `backend/src/seeds/__tests__/claudeStudioFormat.test.ts` — the emitted `body_html` contract,
  escaping, tag balance, no scripts, no iframes, privacy language present.
- `backend/src/services/runtime/__tests__/claudeStudioValidation.test.ts` — URL safety, transcript
  rejection, stage and self-check gates, reflection length.
- `frontend/src/components/timeline/__tests__/claudeStudioParse.test.ts` — the parse contract,
  degradation to null, unsafe-URL refusal, draft storage.

All four suites run without a database and are therefore inside the CI gate.

---

## Known deferred work

- **Thumbnail is an interim banner, not the AI one.** The shipped
  `frontend/public/thumbnails/curriculum-types/claude_studio.jpg` was drawn locally by
  `scripts/curriculum-type-thumbnails/makeInterimBanner.js` — same 900x300 geometry, same
  Colaberry wordmark chip, same JPEG settings as the generated set, so it sits correctly
  beside them on every surface. The proper gpt-image-2 banner needs the production host's
  `OPENAI_API_KEY` and a paid image call. The slug is already registered in
  `prompts.json`, so generating it later overwrites this file in place with no code change:
  ```bash
  ssh root@95.216.199.47 'cd /root/thumb-gen && node generateOnHost.js --only claude_studio'
  scp root@95.216.199.47:/root/thumb-gen/raw/claude_studio.png ./raw/
  node scripts/curriculum-type-thumbnails/compositeAndInstall.js --raw ./raw
  ```
- **Rubric evaluation workflow.** Submissions land as `review_state: 'pending_review'` and are
  visible to instructors through the existing portfolio-artifact review path. A dedicated
  rubric-scoring UI keyed on the five dimensions is not built; the rubric currently informs the
  reviewer rather than being captured as structured scores.
- **Week 11 case-study handoff** prepares the content and formats it for the existing Case Study
  OS pipeline, but the student still submits it through that pipeline's own flow rather than a
  one-click handoff from the studio.
