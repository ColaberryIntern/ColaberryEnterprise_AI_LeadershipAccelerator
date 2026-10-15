# P0 — Read & map (gov pursuit redesign)

**Takeaway.** The redesign is a **re-sequence + re-present + fill-gaps** of the existing gov
qualification workspace into a 7-step flow (one question, one primary action per step), not a
rewrite. Most machinery exists; several pieces I shipped this session (the day-before-deadline
scheduler, the assignment summary, the submission summary) are directly reused or extended. This
maps each design element to the file that changes, flags the conflicts, and records the open
questions to resolve before their phase.

## The 7-step flow → files

| Step (`?tab=`) | Design | Primary files to change |
|---|---|---|
| 1 `snapshot` | Snapshot — "Is it worth a look?" | `AdminGovQualificationPage.tsx` (new step render), move `ProposalSummaryPanel` → Snapshot, `govWorkspace/workspaceSteps.ts` (new keys/labels/questions + legacy map), `recordGovQualificationDecision` (pass-with-reason chips) |
| 2 `solicitation` | Requirements **map** | `backend/.../proposal/proposalExtractor.ts` L200 (stop splitting on every `\n`), **new** `requirementTaxonomy` (RequirementItem) on `models/GovQualification.ts` + `db/ensureGovQualificationSchema.ts`, new AI item builder (govBuildSpec.ts pattern), new `RequirementsMap` component (positioned divs + inline SVG, like `GovBuildGantt`) |
| 3 `fit` | Fit vs Our Services | **new** Fit step; `services/factory/serviceCatalog.ts` (`createServiceOffering`/update + new `growth` status), `models/ServiceOffering.ts` + schema, `govGaps.ts` (eligibility checks), new capability-assessment AI service |
| 4 `decide` | Decide + approval handoff | `BidDecisionDashboard`, `govBidDecision.ts`/`govBidAssessment.ts` (reuse), fix contradictory StatCards ("Needed before submit: N"), approver request/approve/send-back, **remove the qualification drawer** (`AdminGovQualificationPage.tsx` ~L1474–1550) |
| 5 `build` | Build the bid | `GovBuildGantt`/`buildSchedule.ts`/**`govScheduleWindow.ts` (shipped this session — extend for back-planned-from-due + markers + critical path)**, team & access (reuse `GovMaterializePanel`/`govProjectMaterialization.ts`/`govBuildAssignment.ts` + new per-member share grants in `modules/delivery/deliveryRoles.ts`), new Product-definition + questions-to-City draft, Draft-with-AI gaps/filler (`govProposalResponse.ts` + response-slot `gaps[]`), export-blocked-by-filler in `govSubmission.ts` |
| 6 `submit` | Submit | existing `submission/*` routes (source of truth) + reuse my `SubmissionReadinessPanel` as the checklist base |
| 7 `outcome` | Outcome | existing outcome panel |
| — Intern | Intern Build page | `pages/portal/projects/GovProjectPortalPage.tsx`, `routes/govProjectPortalRoutes.ts`, `services/factory/govProjectProjection.ts` (student-safe, admin-only pricing), reuse `requireGovProjectAccess` |

## Shared shell (the "layout" to nail down — P1)

- **Step bar** — update `govWorkspace/StepBar.tsx`: 7 steps, label + one-line question, states `done`/`current`/`frontier`/`locked` ("After approval" dimmed for 5–7 pre-approval). Done-ness follows pursuit order (a later step never `done` while an earlier isn't).
- **StepFooter** — **new** shared component: left status line ("Ready:…/Not yet:…") + next-step line; right `← Back` + optional destructive secondary + **one primary** (disabled with blockers listed when the exit gate isn't met).
- **Pursuit brief** — **new**, replaces scattered right-rail cards (`RightRail.tsx` → `PursuitBrief`): one section per step 1–6 (past = "Known" facts, current = "Adding now" outlined, future = dashed "Unlocks at step N"); keep dossier + amendments as collapsible cards below.
- **Frontier/locked state** — `workspaceSteps.ts deriveStepState`: current = where the pursuit is (frontier = first unfinished), **not** the clicked tab; land on the frontier when no `?tab=`; steps 5–7 locked until approval. Fixes the "Build shows a green check before approval" bug.
- **Per-step next** — extend `govNextStep.ts` to return `{ title, detail, ctaLabel, targetStep, blockers[] }` per step (today it only renders on Go/No-go).

## Reused from this session (not rebuilt)

- **`govScheduleWindow.ts`** (day-before-deadline rescale) → the Step-5 back-planned Gantt extends it.
- **Assignment** (`GovMaterializePanel` + `assignableBuilders` + the "Assignment at a glance" summary) → becomes Step-5 "Team & access".
- **`SubmissionReadinessPanel`** → becomes the Step-6 submission checklist base.

## Conflicts / flags (CLAUDE.md wins)

1. **On-time probability must be deterministic** (CLAUDE.md "LLMs probabilistic, systems deterministic"). The 74% in the design is illustrative — I'll compute it as a **pure function** from the Gantt (critical-path remaining vs working days to ship-by, minus human-blocked items) with documented weights + unit tests, and render "—" when inputs are missing. No model call.
2. **No loosened server gates** — separation of duties, ZIP attestation, coverage/blocking, submission readiness, build-auth-separate-from-approval all unchanged. New share levels add **narrow** per-member grants; they never broaden `requireSection('program')`, and qualification/decision/**pricing stay admin-only (server-enforced projection)**.
3. **Mockup visuals are not imported** — the designs use their own fonts/palette; I render the IA in the repo's admin shell (`PageHeader`/`SectionCard`/`StatCard`/`StatusBadge`/`EmptyState`, Bootstrap utilities, RemixIcon).
4. **Back-compat** — legacy `?tab=` (`requirements→solicitation`, `gono→decide`, `proposal→build`) keep resolving; records without items/capabilities fall back to the established-requirement list.
5. **Schema additions are additive** (RequirementItem, capability decisions, `growth` status, response-slot `gaps[]`, per-member share grants) — keep the model-parity tests green; no destructive migration.

## Open questions (ask before the phase that needs them)

1. **Approver notification channel** (P4) — in-app inbox / email / Slack? *Recommend: existing in-app + a pending-approval flag on the approver's Gov Opportunities list (no new dependency).*
2. **Can a `growth` capability count toward fit as `partial`?** (P3) — *Recommend: no; growth is excluded from "we have it" matching, surfaced separately, so fit stays honest.*
3. **Default proposal share level on assignment** (P5) — *Recommend: Can comment (design default).*
4. **Working-day calendar for the on-time estimate** (P5) — *Recommend: weekdays only, no holiday calendar for v1 (documented assumption).*
5. **Intern profile project public or private until outcome?** (P6) — *Recommend: private until outcome, then eligible for the public portfolio.*

None of these block P0/P1 (the layout). I'll confirm each with Ali at its phase.

## Phase order (one PR each)

P0 (this: package + plan) → **P1 flow shell (the layout)** → P2 extraction+items+map → P3 fit+write-back → P4 decide+approval → P5 build-the-bid → P6 intern portal → P7 submit polish + docs.
