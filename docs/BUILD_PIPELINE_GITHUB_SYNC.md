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

### 5.2 Repo → platform (read)

**Trigger:** webhook on push (preferred), the portal's "Sync" button, and a low-frequency reconciler for repos whose webhook is missing or failing.

Reads: default branch, recursive tree, recent commits, and the acceptance checkbox state in `docs/stories/*.md`. Persists to the projection (§9).

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

## 10. Naming

"Your builds" reads as jargon. The vocabulary should be ordinary:

| Now | Proposed |
|---|---|
| Your builds | **Your projects** |
| Start a new build | **Start a new project** |
| Active builds | **Active projects** |
| Open your build | **Open project** |
| How builds work | **How projects work** |

Keep **release** and **story** — those are real industry terms the students are meant to learn, and the whole point is that they graduate speaking them. It is "build" as a *noun* that reads oddly. Scope: `ProjectsPage.tsx`, `ProjectWizard.tsx`, `ProjectsNextStepHero.tsx`, `BuildToast.tsx`, plus copy in the interior and drawer.

---

## 11. Build sequence

| Step | Work | Why this order |
|---|---|---|
| **1** | Fix release balance + story granularity in the decomposer | Everything downstream renders this data. Do not build a dashboard over a broken plan. |
| **2** | Document renderers (plan → the `docs/**` file set) | Pure functions, no I/O, fully testable. The riskiest content decisions get made in the cheapest place. |
| **3** | Repo write + manifest + path allowlist | Closes the defect. After this, prompts resolve. |
| **4** | Prompt assembly asserts against the manifest (FR-032) | Makes the class of bug unrepeatable. |
| **5** | Conflict detection + the diverged banner | Before students edit anything, not after. |
| **6** | Webhook + projection | Turns the repo into a live progress signal. |
| **7** | Dashboard panels, in §9.1 order | Gantt last — it needs both the plan and the projection to be honest. |
| **8** | Rename to "projects" | Cosmetic, independent, ship any time. |

Steps 1–4 are the ones that make the current pilot correct. 5–7 are the dashboard Ali asked for. 8 is a half-day.

---

## 12. Open decisions

1. **Repo provisioning becomes mandatory to start a project.** Recommended, and implied by Option B — without a repo there is no system of record. Needs Ali's sign-off because it adds a GitHub-username step to the wizard.
2. **One repo per project, or one per student holding many projects?** Current code is one per *enrollment*. Multi-project (a stated platform capability) then means several plans in one repo, which muddies `docs/`. Recommend **one repo per project**, named `student-<enrollment>-<project-slug>`.
3. **Webhook vs polling for the projection.** Webhook is right; polling every N minutes across a cohort is the kind of load the audit already flagged. Needs a public endpoint and a shared secret.
4. **Do we ever run student tests to verify acceptance?** Out of scope here (§8). If the answer is ever yes, it is a sandbox-execution project of its own.
