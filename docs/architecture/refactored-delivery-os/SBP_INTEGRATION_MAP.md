# SBP Integration Map

**Session:** CC-20260823-r4k9 · **Base:** `d1d46d1e` · **Gate:** 0

Master plan §2.3: *"Reuse/generalize … Do not duplicate them."* This document draws the
line module by module.

Source: `backend/src/services/sbp/` — 35 source modules, 52 test files.
Contracts: `docs/BUILD_PIPELINE_REQUIREMENTS.md` (SBP-REQ-v1),
`docs/BUILD_PIPELINE_GITHUB_SYNC.md` (SBP-GH-v1), `docs/REPO_CONNECT_CONTRACT.md`,
`docs/BUILD_VERIFICATION_CONTRACT.md`, `docs/BUILD_PIPELINE_RELEASES_AND_STORIES.md`.

---

## The finding that shapes the whole integration

**The SBP engine is already generic. The coupling is at the edges.**

`planContract.ts` opens with "Pure types + the JSON schema used for structured model
output. No I/O, no imports from services." `planGate.ts` opens with "PURE, deterministic,
no I/O." Neither imports an enrollment, a program, or a student.

The student-specific parts are the **HTTP routes** (all 5 are `requireParticipant`),
`scheduleForEnrollment.ts`, `studentProgressFile.ts`, and the cohort-shaped tier/schedule
logic. That is a much smaller surface than "generalize SBP" implies.

---

## Tier 1 — Reuse unchanged, no fork, no copy

These are pure or near-pure and already serve delivery semantics.

| Module | Why it transfers as-is |
|---|---|
| `planContract.ts` | Requirement kinds `FUNC · SAFE · REL · NFR · OBS · CONSTRAINT`, priorities `must · should`, Release and Story types. The `CONSTRAINT` kind exists because the pilot mis-typed "must use Mandrill" as a functional must and the gate manufactured layer stories to satisfy it — that lesson is worth more than the type |
| `planGate.ts` | The traceability gate. **Fails closed.** Blocking vs warning split already made on the right line: "would this mislead about what is being built, or write broken data?" This is master plan §7's fail-closed traceability, already built and unit-tested against a real pilot plan fixture |
| `planHash.ts` | Change detection |
| `boundedQueue.ts` | `QueueFullError`, single shared instance, "excess work WAITS, it does not fan out." Directly serves master plan §16 |
| `managedBlock.ts` | Managed-region markers in generated files |
| `fileOwnership.ts` | Who owns which path |

**Rule: no delivery-specific copies of these.** If a delivery need requires a change,
change the shared module and let both callers benefit — that is what the test suite is
for.

---

## Tier 2 — Generalize by parameter, one implementation

Currently take a student/enrollment shape; the logic is not student-specific.

| Module | Coupling today | Generalization |
|---|---|---|
| `decomposeService.ts` / `decomposePrompt.ts` | Prompt framing assumes a learner and a capstone | Accept a `contextProfile` (learner vs delivery vs government). Same decomposition, different framing and different required requirement categories |
| `planStore.ts` | Persists against `projects.id` | Accept a polymorphic owner `(kind, id)` — `student_project` or `delivery_project` |
| `planRepair.ts` | Repairs against student plans | Owner-agnostic once `planStore` is |
| `materializeTasks.ts` | Writes student tasks; **has an idempotency test** | Target table by owner kind. Keep the idempotency test as the contract |
| `renderDocs.ts` / `docsBundle.ts` | Student document set | Document set becomes profile-driven (see `DELIVERY_PROFILE_CONTRACT` at Gate 13) |
| `intakeQuestionsService.ts` / `intakeQuestionsPrompt.ts` | Student intake interview | Master plan §4's five starting points are a superset of today's intake |
| `scopeAgents.ts` | Per-story agent scoping | Feeds Gate 5 `AgentDefinition` |
| `buildStoryPrompt.ts` | Assembles the prompt envelope for one story | Becomes the Gate 8 prompt envelope, with the untrusted-content separation of §11 added |
| `projectNaming.ts` | Naming + override | Naming rules differ per project class |

---

## Tier 3 — Reuse the contract, new implementation for delivery

Proven behaviour, but the delivery version has materially different requirements.

| Module | What transfers | What differs |
|---|---|---|
| `repoWriter.ts` | The three hard-won properties: **unchanged ⇒ no commit**; **one commit, not one per file**; **allowlisted paths enforced by throwing**. Plus bot authorship so the push webhook skips its own writes | Delivery writes to a *client-owned* repo. The allowlist (`CLAUDE.md`, `docs/**`, `.colaberry/**`) is a student-repo allowlist; a client repo needs a client-agreed one, and getting it wrong overwrites a paying customer's source |
| `workspaceRepo.ts` | The `access_unknown` vs `pull_only` distinction — earned when eleven students' repos refused every commit for nine months and the only trace was a `no_repo` outcome | Delivery adds the ephemeral execution workspace, which is a different lifecycle from "the repo of record" |
| `repoWriteAccess.ts` | Write-access probing | Same |
| `refreshRepoDocuments.ts` | Document refresh | Same |

**`repoWriter.ts`'s allowlist deserves emphasis.** Its header says a bug there "would
silently overwrite their code." For a student that is bad. For a commercial client under
a delivery contract it is a liability event. The delivery path must not inherit the
student allowlist by default.

---

## Tier 4 — Student-only, do not generalize

| Module | Why it stays |
|---|---|
| `scheduleForEnrollment.ts` | Enrollment-shaped by definition |
| `buildSchedule.ts` / `buildTiers.ts` | Cohort week/tier pacing |
| `studentProgressFile.ts` | Student-facing progress file |
| `commandCenterStory.ts`, `commandCenterLocation.ts`, `commandCenterProgressTemplate.ts`, `commandCenterTaskColumns.ts` | The student Command Center surface |
| `buildProgressSnapshot.ts` | Student progress snapshot |
| `zipArchive.ts` | Student download |
| `profileContract.ts` | Student profile |

---

## HTTP surface — the actual coupling

All five SBP routes are participant-gated:

```
POST /api/portal/sbp/intake/questions              requireParticipant
POST /api/portal/sbp/builds                        requireParticipant
GET  /api/portal/sbp/builds/:projectId             requireParticipant
POST /api/portal/sbp/builds/:projectId/publish     requireParticipant
GET  /api/portal/sbp/builds/:projectId/stories/:storyId/prompt   requireParticipant
```

`requireParticipant` resolves a student enrollment. A delivery lead, a client reviewer and
an AI Flotation architect are none of those.

**Resolution:** the delivery routes are a new tree under `/api/refactored/*` guarded by
delivery-project membership (Gate 2), calling the *same* Tier 1/2 services. The SBP routes
are not modified — master plan §24's stop condition "student `Project` behavior regresses"
is best satisfied by not touching them at all.

---

## Backward-compatibility contract

The following must still hold, unchanged, after every gate:

1. All 5 SBP routes behave identically for a participant.
2. `planGate` verdicts on the checked-in pilot fixture
   (`__tests__/fixtures/pilot-dryrun-plan.json`) do not change.
3. `materializeTasks` idempotency test passes unchanged.
4. `repoWriter` writes one commit, content-hash idempotent, allowlist enforced.
5. `boundedQueue` bounds the shared provision queue.
6. The 52 SBP test files pass.

Item 2 is the load-bearing one: `planGate` is the thing most likely to be "improved"
during generalization, and a changed verdict on the pilot fixture is the signal that
student behaviour just moved.

---

## What can later be extracted from the monorepo

`planContract.ts` + `planGate.ts` + `planHash.ts` are pure, dependency-free and
already have their own test suite. They are the cleanest extraction candidate in the
repo — a `@colaberry/delivery-plan` package consumable by SBP, Refactored, and the three
skeleton apps from multi-tenancy Gate 6. Recorded as a Gate 15+ opportunity, not work for
this plan.
