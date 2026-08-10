# Student Build Pipeline — GitHub Sync & Document Architecture

**Document ID:** SBP-GH-v1
**Session:** CC-20260809-b7k2 · **Date:** 2026-08-09
**Status:** Proposed — decision required on §3, §6, §9
**Companions:** `BUILD_PIPELINE_AUDIT.md` · `BUILD_PIPELINE_REQUIREMENTS.md` · `BUILD_PIPELINE_RELEASES_AND_STORIES.md`

---

## 1. The defect this closes

The prompts now generated for a student's story open with:

```
## Read this first
  1. ./docs/REQUIREMENTS.md
  2. ./docs/STORIES.md
  3. ./docs/stories/STORY-001.md
  4. ./CLAUDE.md
```

**For a student, none of those paths exist.** Nothing writes them. The prompt asserts a filesystem that the platform never creates, so a student pasting it into Claude Code gets four failed reads and then an agent guessing at the requirements it was told to follow. That is worse than giving it no context at all, because the agent believes it has context.

`docs/BUILD_PIPELINE_REQUIREMENTS.md` FR-021 already says these files must be materialized into the student's workspace repo. The prompts were written as though FR-021 were done. It is not. This document specifies how it gets done.

**Current state of the GitHub layer:** `studentWorkspaceService.ts` provisions a private repo per student under `ColaberryIntern`, adds them as a push collaborator, and syncs *read-only* (file tree + recent commits). It has never been used for a real student — every `github_connections` row in production is test data (`octocat/Hello-World`). Nothing has ever written to a student repo. That makes this greenfield rather than a retrofit, so it can be designed correctly the first time.

---

## 2. Requirements this document introduces

| ID | Requirement | Priority |
|---|---|---|
| FR-025 | GitHub is the system of record for a build's documents; the platform holds a projection, never a second master | must |
| FR-026 | Publishing a plan writes the document set into the student's workspace repo in one commit | must |
| FR-027 | Platform writes are confined to an explicit path allowlist and never touch student-authored code | must |
| FR-028 | A student's edits to a generated document are never silently overwritten | must |
| FR-029 | The portal renders documents read from the repo projection, with an explicit freshness indicator | must |
| FR-030 | Story progress is derived from repo activity, not only from a self-reported checkbox | must |
| FR-031 | A build with no provisioned repo degrades to a documented fallback, never to a broken prompt | must |
| FR-032 | Every prompt path is verified to resolve before the prompt is offered for copying | must |
| FR-033 | Mark-done is disabled until repo evidence satisfies every applicable check | must |
| FR-034 | Every gate has a documented path forward (re-check, mentor override, document-evidence stories) | must |
| FR-035 | The task card exposes one primary action; tool choice happens after the student reads the story | should |
| FR-036 | A full-page workspace exists per story, with a story-seeded AI agent and a repo/checks rail | should |

---

## 3. DECISION — where documents live

Two options were on the table. **Recommendation: Option B**, which matches Ali's stated preference.

### Option A — documents live on the platform, repo gets a copy
Postgres is the master; the repo receives an export.

- Simple to render, no external dependency on page load.
- **Fatal for the actual use case:** the student's Claude Code session works *in the repo*. If the master is elsewhere, their edits either don't count or have to be imported back, and the two copies drift the first time they touch a file.
- Makes the student a reader of their own requirements rather than the architect of them, which inverts the pedagogy.

### Option B — documents live in GitHub, platform holds a projection ✅
The repo is the system of record. The platform keeps a cached projection for display.

- **Zero-friction agent access.** Files are on disk next to the code. No auth, no URL, no copy-paste. The prompt's `./docs/REQUIREMENTS.md` resolves literally.
- **One master.** No drift, because there is only one writable copy.
- **The student's edits are real.** They are the architect; when they sharpen a requirement, that is the requirement. Git gives version history for free.
- **Portfolio value.** At the end they own a repo containing the spec, the plan, and the code that satisfies it — that is the artifact an employer looks at.
- Cost: rendering depends on a projection that can be stale, and every write is a network call that can fail. Both are addressed in §5 and §6.

This mirrors a pattern already used here: `training.colaberry.com`'s knowledge base is a synced projection of the enterprise KB, and the portal/Claude-Code split in `CLAUDE.md` assigns each artifact exactly one owner. Same discipline.

**Consequence to accept:** without a provisioned repo there is no system of record. Repo provisioning stops being optional and becomes part of starting a build (§7).

---

## 4. Repo layout

Written by the platform, read by the student's Claude Code session:

```
<student-workspace-repo>/
├─ CLAUDE.md                     project conventions + definition of done
├─ docs/
│  ├─ REQUIREMENTS.md            the full requirements document
│  ├─ STORIES.md                 every story, release, and gating
│  ├─ TRACEABILITY.md            requirement → story matrix
│  └─ stories/
│     ├─ STORY-001.md            narrative, requirement, acceptance, the prompt
│     └─ …
├─ .colaberry/
│  ├─ plan.json                  machine-readable plan (the contract)
│  ├─ manifest.json              what we wrote, when, and a content hash per file
│  └─ progress.json              last-known status per story (platform-written)
└─ …                             everything else is the student's
```

`.colaberry/` is the sync bookkeeping. `manifest.json` is what makes conflict detection possible (§6) and idempotency cheap — unchanged content hash means no commit.

**Every story file carries its own acceptance as checkboxes**, because that is what turns a document into a progress signal (§8):

```markdown
## Acceptance — your stop condition
- [ ] Given a manager fills the form, when they submit, then they receive a magic link by email.
- [ ] Given an invalid email, when they submit, then an error is shown and no enrollment is created.
- [ ] Trust — every provisioning action is written to the audit log with a transaction id.
```

---

## 4.1 DECIDED — one repo per project, provisioning is mandatory

**Ali, 2026-08-09.** Both were open questions in the first draft; both are now locked.

### One repo per project

The current model is **one repo per enrollment**, and it is enforced in the schema:

```
github_connections.enrollment_id  UNIQUE
```

That unique constraint structurally forbids the decision, so it goes. Multi-project is a stated platform capability (first project free, additional paid), and several plans sharing one `docs/` folder would collide on `REQUIREMENTS.md` the moment a student starts a second project.

**Migration is clean.** Production holds 11 `github_connections` rows and **zero** are real platform-provisioned workspace repos — no row matches `ColaberryIntern/student-workspace-%`. They are `octocat/Hello-World` test rows plus one `AI_Pathway`. Nothing to preserve.

| Change | Detail |
|---|---|
| Add `project_id` | FK to `projects`, `UNIQUE (project_id)` |
| Drop `UNIQUE` on `enrollment_id` | keep it as a plain index — still needed to scope access by owner |
| Re-key the service | `provisionWorkspaceRepo`, `syncWorkspaceRepo`, `getWorkspaceRepo` take `projectId`, and verify the project belongs to the caller's enrollment before acting |

**Repo naming.** `workspaceRepoName()` currently returns `student-workspace-<enrollmentId>` — a bare UUID. Since this repo becomes the student's portfolio artifact, it should read like one:

```
<project-slug>-<first 8 of projectId>      e.g.  sponsor-dashboard-248d9d63
```

Readable, unique across the org without a collision check, and stable if the project is renamed. The student may rename or transfer it later; sync follows `repo_owner`/`repo_name` on the connection row, not the derived name, so a rename does not break it as long as we re-read the row.

### Provisioning is mandatory

A project cannot reach the plan-published state without a provisioned repo, because under Option B the repo *is* the system of record — a project without one has nowhere to keep its requirements.

**Where it goes in the wizard:** a fourth step, after the sharpening questions and before "Confirm & build". Asking earlier interrupts the idea; asking later means generation finishes with nowhere to write.

**What it must handle** — mandatory does not mean brittle:

| Case | Behaviour |
|---|---|
| No GitHub account | Link out to signup, keep the intake saved, let them return. Never lose the idea over an account they do not have yet. |
| Username typo'd or does not exist | Validate against the GitHub API **before** provisioning, not by watching the collaborator call fail. The current code checks format only. |
| Provisioning fails (GitHub 5xx, rate limit, token) | Intake is already persisted (FR-001). Retry with backoff; the project sits in `awaiting_repo` and is resumable. Never a dead end. |
| Cohort provisioning at once | 20+ repo creations against one platform token in a short window will hit secondary rate limits. Provisioning goes through the same bounded queue as generation (NFR-001), not a burst. |

**Consequence for §7's fallback.** With provisioning mandatory, "no repo" stops being a steady state and becomes a transient one — the window between project creation and successful provisioning, or a provisioning failure. The fallback prompt (inline the context, emit no unresolvable paths) still applies for exactly that window, and the UI should say *"finishing your repo setup"* rather than presenting it as a normal mode.

### Requirements introduced

| ID | Requirement | Priority |
|---|---|---|
| FR-037 | One workspace repo per project, keyed `UNIQUE (project_id)`; access is verified through the owning enrollment | must |
| FR-038 | A plan cannot publish without a provisioned repo; the project waits in `awaiting_repo` and is resumable | must |
| FR-039 | The GitHub username is validated against the API before provisioning is attempted | must |
| FR-040 | Repo provisioning runs through the bounded queue so a cohort start cannot exhaust the platform token's rate limit | must |

---

## 5. Sync flows

### 5.1 Platform → repo (write)

**Trigger:** plan published, plan regenerated, story prompt changed.

1. Render the document set from the plan.
2. Read `.colaberry/manifest.json`; compare per-file content hashes.
3. Skip unchanged files entirely — an unchanged publish produces **no commit** (FR-026 idempotency).
4. Write changed files in **one commit** via the GitHub contents/tree API, authored by the platform bot:
   `chore(colaberry): sync build plan — 3 files changed [corr:<id>]`
5. Update `manifest.json` with new hashes and the correlation id.

**Path allowlist (FR-027):** `CLAUDE.md`, `docs/**`, `.colaberry/**`. A write targeting anything else is a bug and must throw, not warn. The student's source tree is untouchable.

### 5.2 Repo → platform (read) — DECIDED: webhook primary, reconciliation polling as safety net

**Ali, 2026-08-09.** Webhook-only is fast but silently misses deliveries; polling-only is wasteful and late. The combination gives fast updates *and* eventual correctness.

|  | Webhook | Polling |
|---|---|---|
| Mechanism | GitHub tells us on change | We repeatedly ask |
| Speed | near-immediate | delayed to next tick |
| API cost | very low | repeated requests |
| Failure mode | delivery can fail while we are down | eventually catches up |
| Role here | **primary** | **reconciliation** |

**Receiver contract:**
1. Verify GitHub's HMAC signature over the **raw body bytes** before parsing. `buildPlanWebhookController.ts` already does exactly this — reuse its `verifyHmacSignature` + `rawBody` pattern rather than writing a second one.
2. Return **202 immediately.** Do no work in the request. A slow receiver is how deliveries start failing.
3. Enqueue the sync as a background job on the bounded queue (NFR-001).
4. Ignore pushes authored by the platform bot (§5.3) — otherwise our own document write triggers a sync loop.

**Subscription:** `push` on the default branch. Registered at provisioning time (§4.1) so every project repo has one from birth.

**State:** the connection row stores `last_synced_sha`. Every sync records the commit SHA, changed files, outcome and timestamp — that record is what makes the reconciler cheap and the dashboard's "last activity" honest.

**Reconciler:** a scheduled job every 15–60 min compares the repo's head SHA against `last_synced_sha` and repairs a mismatch. This matters because **GitHub does not guarantee redelivery of a failed webhook** — without reconciliation, one delivery lost while the backend restarts leaves a build permanently stale, and the student's mark-done gate stuck closed through no fault of theirs.

**Rate limit:** the reconciler uses conditional requests (`ETag` / `If-None-Match`). An authenticated `304 Not Modified` does not count against the primary rate limit, so reconciling a whole cohort every 15 minutes stays nearly free. Without this, polling 100+ repos hourly is exactly the kind of load the audit already flagged.

Per FR-032 and REL-003 the reconciler holds an advisory lock and skips its tick if a prior run is still in flight.

Reads on sync: default branch, recursive tree, recent commits, and the acceptance checkbox state in `docs/stories/*.md`. Persists to the projection (§9).

**Not applicable here:** for a plain website deploy, a GitHub Actions workflow or a host's native Git integration would give this for free. We need a custom receiver because the payload we care about is *build progress* — which commits touch which story, and which acceptance boxes are ticked — not a deployment trigger.

| ID | Requirement | Priority |
|---|---|---|
| FR-041 | Push webhook on the default branch is registered at provisioning; the receiver verifies the signature over raw bytes and returns 202 without doing work | must |
| FR-042 | `last_synced_sha` is persisted per project; every sync records commit, changed files, outcome, timestamp | must |
| FR-043 | A 15–60 min reconciler repairs SHA mismatches using conditional requests, under an advisory lock | must |

### 5.3 Ordering

Write-then-read, never interleaved. A platform write triggers our own webhook; ignore pushes authored by the platform bot to avoid a sync loop — the single most likely way this design breaks in production.

---

## 6. Conflict — the student edited a generated document

Non-negotiable: **never silently overwrite** (FR-028). The student sharpening their own requirements is the product working, not an error.

On write, for each file: compare the file's current hash in the repo against the hash the manifest recorded when we last wrote it.

| Situation | Action |
|---|---|
| Repo hash == manifest hash | We own it. Overwrite freely. |
| Repo hash ≠ manifest hash | **Diverged.** Write to `docs/REQUIREMENTS.generated.md`, leave theirs untouched, raise a portal banner: *"Your requirements have diverged from the generated plan — review and merge."* |
| File missing | Treat as first write. |

The portal shows a diff and two actions: **Keep mine** (adopt the student's file as the new baseline — rehash into the manifest) or **Take generated** (overwrite, their version stays in git history).

`.colaberry/**` is platform-owned bookkeeping and is always overwritten; that is stated in a header comment inside each file so it is not a surprise.

---

## 7. No repo yet — the fallback (FR-031)

Repo provisioning becomes part of starting a build. But a prompt must never ship a path that cannot resolve, so:

- **Repo provisioned:** section 1 emits repo-relative paths plus the clone command. The normal case.
- **Repo not provisioned:** section 1 emits *no file paths at all*. Instead it inlines the requirement statement and acceptance in full (they are short), and states plainly: *"Provision your workspace repo in the portal to get the full requirements on disk."*
- **Never** emit a path we have not confirmed we wrote.

FR-032 makes this checkable: prompt assembly takes the manifest as input and asserts every path it references appears there. A prompt referencing an unwritten file fails assembly loudly. That single assertion is what would have caught the defect Ali found.

---

## 8. Progress from the repo (FR-030)

Today progress is a checkbox the student ticks. That is bookkeeping, not evidence — and the 4-state has never advanced once in production (audit F-7).

Derive it instead, from three signals of increasing strength:

| Signal | Meaning | How |
|---|---|---|
| **Commit references a story** | in progress | commit message matches `STORY-\d+`; convention taught in `CLAUDE.md` and requested by the prompt |
| **Acceptance boxes ticked** | student/agent claims done | parse `- [x]` in `docs/stories/STORY-nnn.md` |
| **All acceptance ticked + commits present** | done | both of the above |

Requirement state follows: cited by a story → `PLANNED`; first commit → `BUILT`; all acceptance ticked → `VERIFIED`. That finally makes the 4-state move, driven by evidence rather than self-report.

**Deliberately not automated:** we do not run the student's tests to verify acceptance. That is a sandbox-execution problem with real security surface, and it is out of scope here. The honest framing is "claimed done, with commits backing it," and the dashboard should label it that way rather than implying we verified it.

---

## 9. The projection, and what the dashboard shows

The projection is a read model in Postgres, refreshed by §5.2. It exists so the portal never blocks on GitHub to render a page. It is **derived data** — safe to rebuild from the repo at any time.

Per build it holds: file tree + hashes, commits (sha, message, author, timestamp, matched story), acceptance state per story, divergence flags, and last-synced-at.

### 9.1 Dashboard composition

Everything below is derivable from the plan plus the projection — nothing here needs new data capture:

| Panel | Shows | Source |
|---|---|---|
| **Release timeline (Gantt)** | 5 release bars over the target weeks, dependency arrows from `blocked_by`, today-line, slip shading | `week_start/week_end`, `blocked_by`, commit dates |
| **Story board** | Stories by release and status; blocked ones visibly locked with what they wait on | plan + projection |
| **Requirement coverage** | The 4-state across all requirements, % verified, and which stories move each one | traceability matrix |
| **Commit activity** | Commits per story, last activity, quiet-for-N-days flags | projection |
| **Acceptance progress** | Per story, N of M criteria ticked — the honest "how done is this" number | story files |
| **Risk flags** | Release behind schedule, story blocked > N days, requirement with zero commits, diverged document | computed |
| **Documents** | REQUIREMENTS / STORIES / TRACEABILITY rendered from the projection, with freshness + "open in GitHub" | projection |
| **The prompt** | Per story: copy button, with the paths verified to resolve | plan + manifest |

**Sequencing note.** A Gantt over the current pilot data would render an 8/1/1/1/1 release distribution — it would faithfully display a planning defect. Fix release balance and story granularity (§11) before building the chart, or the first thing the chart proves is that the planner is wrong.

---

## 10. The work surface — Open, Workspace, and a gated Mark Done

Today the task card offers four flat buttons — **Copy Prompt · Open Workspace · Mark Done · Skip** — and the drawer repeats three of them. That asks a student to choose their tool before they have read the task, and it lets them declare a story finished having done nothing at all.

### 10.1 One primary action

The card gets **one** primary button: **Open**. Everything else moves inside.

```
Card:        [ Open ]              (Skip stays, quiet and secondary)
   ↓
Drawer:      the story, its requirement, acceptance
             [ Open workspace ]  [ Copy prompt ]
             Mark done  ← gated, see §10.3
```

**Why:** copying a 3,000-character prompt is not a decision to make from a card title. The drawer is where a student reads the narrative, the requirement it satisfies, and the acceptance criteria — *then* picks how to work: full workspace, or copy and go.

The drawer already renders all of this (story, acceptance, repo provisioning, context notes, prompt preview). This is a button-hierarchy change, not a rebuild.

### 10.2 The workspace page

**Route:** `/portal/projects/:projectId/stories/:storyId` — a real page, not a drawer, at Classroom scale.

| Region | Contents |
|---|---|
| **Main column** | The story in full: narrative, the requirement verbatim, acceptance as a live checklist reflecting the repo, the assembled prompt with copy, and the linked documents (`REQUIREMENTS.md`, this story's file) rendered from the projection |
| **Right rail (wide)** | **AI agent** (`PortalMentorChat`, seeded with this story's context — the requirement, acceptance, and repo state, so it is not a blank assistant); **repo panel** (provision or clone command, recent commits touching this story, last sync + re-check); **checks panel** (§10.3) |

The rail is deliberately wider than the drawer's. The drawer is for triage; the workspace is where a student actually sits while building, with the agent beside the work rather than behind a tab.

Reuse: `PortalMentorChat` + `MentorContext` already exist and are what Classroom uses.

### 10.3 Mark done is earned, not clicked (FR-033)

**A student cannot mark a story done by asserting it.** The button is disabled until the repo shows the work exists.

Checks, all derived from the projection (§8, §9):

| Check | Passes when |
|---|---|
| **Repo** | a workspace repo is provisioned for this project |
| **Commits** | ≥1 commit whose message references this story id |
| **Acceptance** | every `- [ ]` in `docs/stories/STORY-nnn.md` is ticked |
| **CI** *(only if the repo defines checks)* | the latest run on the default branch is green |

The panel shows each check with its state and, when failing, **what to do about it** — never a bare greyed-out button:

```
  ✓ Repo provisioned            ColaberryIntern/student-…-sponsor-dashboard
  ✓ Commits reference STORY-001  2 commits · last 14 min ago
  ✗ Acceptance 2 of 3 ticked     tick the last box in docs/stories/STORY-001.md
  – CI                           no checks defined in this repo

  [ Re-check ]  last checked 3 min ago
```

**This is the point of the whole system.** "Completing tasks advances your requirements toward verified" is already the promise on the Projects page. Right now that promise is a self-report, and in production the 4-state has never advanced once. Gating on repo evidence is what makes a completed story mean something — to the student, to a sponsor looking at the dashboard, and to an employer looking at the repo.

### 10.4 Not getting stuck (FR-034)

A hard gate with no escape hatch is a trap. Three releases:

1. **Re-check** — re-syncs from GitHub on demand. The webhook may be late or absent; the student should never wait on our plumbing.
2. **Request review** — sends the story to a mentor with the failing checks attached. The mentor can pass it. Every override is recorded with who and why.
3. **Not-applicable stories** — a story with no code outcome (a decision, a written artifact) is marked `evidence: document` at generation time and gates on the artifact existing in `docs/`, not on commits.

**Skip** stays unchanged and ungated — skipping is an honest "not doing this now", and a skipped prerequisite still does not clear a downstream gate.

### 10.5 Requirements introduced

| ID | Requirement | Priority |
|---|---|---|
| FR-033 | Mark-done is disabled until repo evidence satisfies every applicable check; the UI names the failing check and the remedy | must |
| FR-034 | Every gate has a documented path forward: on-demand re-check, mentor review with recorded override, and a document-evidence story type | must |
| FR-035 | The task card exposes one primary action (Open); tool choice happens in the drawer after the student has read the story | should |
| FR-036 | A full-page workspace exists per story with a story-seeded AI agent and a repo/checks rail | should |

---

## 11. Naming

"Your builds" reads as jargon. The vocabulary should be ordinary:

| Now | Proposed |
|---|---|
| Your builds | **Your projects** |
| Start a new build | **Start a new project** |
| Active builds | **Active projects** |
| Open your build | **Open project** |
| How builds work | **How projects work** |

Keep **release** and **story** — those are real industry terms the students are meant to learn, and the whole point is that they graduate speaking them. It is "build" as a *noun* that reads oddly. Scope: `ProjectsPage.tsx`, `ProjectWizard.tsx`, `ProjectsNextStepHero.tsx`, `ProjectInterior.tsx` ("Your build" header), `BuildToast.tsx`, plus copy in the drawer.

---

## 12. Build sequence

| Step | Work | Why this order |
|---|---|---|
| **1** | Fix release balance + story granularity in the decomposer | Everything downstream renders this data. Do not build a dashboard over a broken plan. |
| **2** | Document renderers (plan → the `docs/**` file set) | Pure functions, no I/O, fully testable. The riskiest content decisions get made in the cheapest place. |
| **2a** | Re-key repos to projects: `UNIQUE (project_id)`, drop the unique on `enrollment_id`, re-key the service (FR-037) | Schema change that everything downstream assumes. Migration is clean now — do it before any real repo exists, not after. |
| **2b** | Mandatory provisioning as wizard step 4, with username validation + `awaiting_repo` (FR-038..FR-040) | Must precede the first repo write, since there is nothing to write to without it. |
| **3** | Repo write + manifest + path allowlist | Closes the defect. After this, prompts resolve. |
| **4** | Prompt assembly asserts against the manifest (FR-032) | Makes the class of bug unrepeatable. |
| **5** | Button hierarchy: one **Open** on the card, tools in the drawer (FR-035) | Small, independent, immediately better. Needs nothing from GitHub. |
| **6** | Conflict detection + the diverged banner | Before students edit anything, not after. |
| **7** | Webhook + projection | Turns the repo into a live progress signal — the prerequisite for both 8 and 9. |
| **8** | Gated mark-done + checks panel + re-check + mentor override (FR-033, FR-034) | Needs 7. This is what makes "done" mean something. |
| **9** | Workspace page with the story-seeded agent (FR-036) | Needs 3 (documents) and 8 (checks panel) to have anything to show in the rail. |
| **10** | Dashboard panels, in §9.1 order | Gantt last — it needs both the plan and the projection to be honest. |
| **11** | Rename to "projects" | Cosmetic, independent, ship any time. |

Steps 1–4 make the current pilot correct. 5 is a quick win with no dependencies. 6–10 are the workspace and dashboard. 11 is a half-day.

---

## 13. Open decisions

**Decided (Ali, 2026-08-09)** — see §4.1:
1. ~~Repo provisioning mandatory?~~ **Yes.** Mandatory, as a fourth wizard step, with resumable failure handling.
2. ~~One repo per project or per student?~~ **One per project.** Requires dropping the `UNIQUE` on `github_connections.enrollment_id` and adding `UNIQUE (project_id)`; migration is clean because no real workspace repos exist in production.

3. ~~Webhook vs polling for the projection?~~ **Both** — webhook primary, 15–60 min reconciliation polling with conditional requests. See §5.2 (FR-041..FR-043).

Still open:

4. **Do we ever run student tests to verify acceptance?** Out of scope here (§8). If the answer is ever yes, it is a sandbox-execution project of its own.
5. **Who can override a failed mark-done gate?** (§10.4). Recommend mentors and staff, never the student themselves — a self-override is just the ungated button with extra steps. Needs a decision on whether cohort mentors qualify or only Colaberry staff.
6. **Does CI count as a check when the student's repo defines one?** Recommend yes, and treated as advisory-but-visible: a red CI does not block mark-done in v1 (students will have half-configured pipelines and we would trap them), but it shows in the panel and on the dashboard.
