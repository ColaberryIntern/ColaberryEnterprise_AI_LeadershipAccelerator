# Claude Code prompt — Gov Pursuit Workspace redesign

> Paste this file (or point Claude Code at it) from the root of
> **https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator**.
> Unzip this package into the repo at `docs/gov-pursuit-redesign/` first so the design references below resolve.

---

## 0. Your job

You are redesigning the admin **Gov Qualification workspace** (`/admin/gov-qualification`) and the intern-facing
**gov project portal** in this repo so a pursuit flows step by step: every step answers one question, adds what was
learned to a running brief, and ends in **one primary action** that moves to the next step.

Build it **inside this repo**, extending what already exists. Most of the machinery is already here (requirement
extraction, response slots, AI build spec/plan, a Gantt, intern assignment, the student gov portal, the delivery
authorization engine). This is mostly re-sequencing, re-presenting and filling specific gaps, not a rewrite.

Follow the repo's root `CLAUDE.md` in full (response brief, shipping ladder, governance, determinism rules). Where
this prompt and `CLAUDE.md` disagree on process, `CLAUDE.md` wins; flag the conflict.

Work in the phases in section 6. **One PR per phase**, each green on its own, each behind the existing workspace
route (no new top-level URL). Read before you write: phase 0 is mandatory.

---

## 1. Design references (in this package)

| Path | What it is |
|---|---|
| `designs/screens/*.html` | Standalone, **clickable** renders of each screen. Open in a browser; footer buttons link screen to screen. Built from the design canvas; the visual language is a mockup, not the repo's Bootstrap theme. |
| `designs/screenshots/*.png` | Full-page PNGs of each screen at 1440px, plus key interaction states (`--price-selected`, `--claim-capability`, `--filler-flagged`, `--checklist-tab`). |
| `designs/source/*.dc.html` + `canvas.json` | Design-canvas source (template + `renderVals()` data). Read these for exact copy, data shapes and state logic. |
| `reference/current-ui/*.png` | Screenshots of today's workspace (Saratoga Springs RFP) and the Herriman requirement list (21 candidates) that motivated the redesign. |

Screens, in flow order:

1. `Main` — flow map: the 7 steps, what you learn / do / the primary button, and a "today vs redesign" list.
2. `Step1-Snapshot` — *Is it worth a look?*
3. `Step2-Solicitation` — *What do we submit, under what rules?* (requirements **map**)
4. `Step3-Fit` — *Can we deliver it, and what would it teach us?* (capabilities vs Our Services)
5. `Step4-Decide` — *Should we bid?*
6. `Step5-BuildTheBid` — team & access, product definition, spec/MVP **Gantt**, proposal parts, Draft-with-AI
7. `Step6-Submit` — checklist, export, record submission
8. `Intern-BuildPage` — what an assigned intern sees

**Match the behavior and information architecture of the designs, rendered in the repo's existing admin shell and
components** (`components/admin/shell`: `PageHeader`, `SectionCard`, `StatCard`, `StatusBadge`, `EmptyState`;
Bootstrap utility classes; RemixIcon). Do not import the mockup's fonts or palette. Placeholder text in brackets
(`[approver]`, `[Intern name]`, `[Client A]`, `[x]%`) marks data the real system supplies.

The sample pursuit in the designs is **Herriman City — Enterprise Work Order Management System RFP** (U3P Utah,
$1.00M est., closes Dec 1 2026, questions due Nov 19 3:00 PM MDT to sbrown@herriman.gov). Use it as a test fixture.

---

## 2. What is wrong today (verified in code)

| # | Problem | Where |
|---|---|---|
| 1 | The "Next:" guidance banner only renders on the Go/No-go tab. | `AdminGovQualificationPage.tsx` (~L1077–1095), `govNextStep.ts` |
| 2 | The step bar marks the **clicked** tab as current, not where the pursuit is; Build shows a green check before approval because `hasBuild` is true from an AI plan. | `govWorkspace/workspaceSteps.ts` `deriveStepState`, `StepBar.tsx` |
| 3 | The "Qualification drawer" renders under every step and mixes *add a requirement* with *Approve*. | `AdminGovQualificationPage.tsx` (~L1474–1550) |
| 4 | Information arrives in the wrong order: "What they want" first appears at Proposal (step 4); fit and gaps are collapsed cards inside Requirements. | `ProposalSummaryPanel`, Requirements panel |
| 5 | Extracted requirements are broken sentence fragments ("…both asset management and", "with the City to provide the Services."): the extractor splits on **every newline**, so PDF line wraps become separate requirements. 20–30 fragments are listed flat, all ticked by default. | `backend/src/services/factory/proposal/proposalExtractor.ts` L200 `.split(/(?<=[.;:])\s+|\n+/)` |
| 6 | Go/No-go shows "Approval allowed: yes" beside "Blocking requirements: 4". Submission-stage evidence is presented as blocking. | Go/No-go `StatCard`s, `BidDecisionDashboard` |
| 7 | Fit is strong/moderate/none only; a missing capability is a dead end instead of a growth opportunity. | service matches in Requirements step |
| 8 | Build spec/plan are post-approval, undated relative to the proposal deadline, and listed rather than scheduled. | `BuildSpecPanel`, `GovBuildPlanAIPanel`, `GovBuildGantt` |
| 9 | Draft-with-AI has no way to ask the human for facts, offer choices, or mark a temporary filler that blocks export. No countdown of what is left to submit; no on-time estimate. | `govProposalResponse.ts`, response slots, `SubmissionReadinessPanel` |
| 10 | Assigning an intern exists (`GovMaterializePanel`) but is buried; the intern portal shows the build tracks but not the submission checklist or a shared proposal view. | `GovMaterializePanel.tsx`, `portal/projects/GovProjectPortalPage.tsx`, `routes/govProjectPortalRoutes.ts` |

---

## 3. Target flow

Seven steps. Steps 1–4 are qualification (cheap, reversible). **Approval is the hinge**: steps 5–7 are locked
previews ("After approval") until a second admin approves.

| Step (`?tab=`) | Question | You learn | You do | Primary button → next | Exit gate |
|---|---|---|---|---|---|
| 1 `snapshot` | Is it worth a look? | What they want (AI, 1 paragraph), value, close date, buyer, legacy scores, questions deadline, prior pursuits with agency | Pass with a reason (chips) **or** continue | **Worth a look — get the solicitation** | User chooses |
| 2 `solicitation` | What do we submit, under what rules? | Fragments turned into defined **items** in 4 categories, shown as a clickable map | Drop the ZIP (extract + attest in one step). Click items, confirm/edit; check the AI-inferred ones | **Confirm the package — assess fit** | ZIP attested, every item confirmed |
| 3 `fit` | Can we deliver, and what would we learn? | Capabilities the work needs, each AI-assessed against Our Services: *We have it / Partly / New capability* | Confirm matches; for new ones: claim it (writes Our Services), add as growth, or find a partner. Tick eligibility checks | **Fit is workable — decide** (secondary: **Disqualified — no bid**) | Every capability decided; no open hard disqualifier |
| 4 `decide` | Should we bid? | Recommendation with reasons, PWin, expected value vs bid cost, growth value even if we lose | Rate the human-only factors; choose Pursue / Pursue with conditions / No bid; write rationale; pick an approver | **Request approval** | Second admin approves (existing separation-of-duties rule) |
| 5 `build` | What is the product, and is the bid ready? | Product definition → spec → MVP plan (Gantt, done before the proposal), proposal parts, live countdown + on-time probability | Assign intern & set proposal sharing; answer AI questions; pick suggestions or a flagged filler; approve parts | **Package the submission (N left)** | All submission items done, no filler |
| 6 `submit` | Is it out the door? | Ship-by date, remaining items, export | Export, submit on portal, record confirmation | **Record submission** | Submission recorded |
| 7 `outcome` | Did we win? | Award, debrief | Record win/loss | **Close the pursuit** | — |

Legacy `?tab=` values must keep resolving (`LEGACY_TAB_TO_STEP`): map old `requirements` → `solicitation`,
`gono` → `decide`, `proposal` → `build`; keep existing aliases. On load with no `?tab=`, land on the **frontier**
(first unfinished step), not step 1.

### Shared anatomy of every step (see any `designs/screens/Step*.html`)

- **Header**: breadcrumb, opportunity title, buyer/region, "Bidding as <entity>", countdown chip (`N days left · closes <date>`).
- **Step bar**: 7 steps with label + one-line question. States: `done` (check), `current` (where the user is viewing),
  `frontier` emphasis on the first unfinished step, `locked` ("After approval", dimmed) for 5–7 before approval.
  Done-ness must follow pursuit order: a later step can never show done while an earlier one is not.
- **Step intro**: "Step N of 7 · about X minutes", the question as H2, one sentence of what to do.
- **Content**: one primary card for the step's job; secondary detail collapsed.
- **Step footer** (new shared component `StepFooter`): left = status line ("Ready: …" / "Not yet: …") + one line on what
  happens next; right = `← Back` link, optional secondary (destructive outline), and **one primary button**. When the
  exit gate is not met the primary is visibly disabled and the left line lists the blockers in plain words.
- **Right rail — Pursuit brief** (replaces scattered right-rail cards): one section per step 1–6. Past steps: "Known"
  with 2–4 one-line facts. Current: "Adding now", outlined. Future: dashed, "Unlocks at step N". Keep the existing
  dossier (contact, key dates) and amendments as collapsible cards below the brief.

Server gates do not change. All step state in the UI is **advisory** and mirrors server gates (as `workspaceSteps.ts`
already documents).

---

## 4. Feature specs

### 4.1 Step 1 — Snapshot
- Move the AI "what they want" summary (today `ProposalSummaryPanel`, proposal step) here. Before a ZIP exists it is
  generated from the posting overview and labelled *AI summary · verify*; after step 2 it regenerates from confirmed items.
- Four fact tiles: est. value, close date + days, legacy priority/fit, questions deadline (fallback: prior pursuits
  with agency from `govRelationship`).
- "Pass on this" records `no_bid` with a reason code chip: `outside_services | too_small | not_enough_time | incumbent | other`
  (+ free text for other). Reuse `recordGovQualificationDecision`.

### 4.2 Step 2 — Requirement items and the requirements map

**Fix extraction first** (`proposalExtractor.ts`): stop treating a single newline as a sentence boundary. Join wrapped
lines (a newline not preceded by sentence punctuation and not followed by a bullet/number/heading is a space), keep
splits on `.;:` + whitespace and on blank lines / list markers. Add tests using the fragments in
`reference/current-ui/07-herriman-requirements-21-candidates.png` (e.g. REQ-008 + REQ-009 must come out as one
sentence; REQ-005 "must include the following elements …:" must keep its list).

**New requirement taxonomy** (deterministic structure, AI-assisted classification):

```ts
type ReqItemCategory = 'submit' | 'rule' | 'scope' | 'after_award';
interface RequirementItem {
  id: string;                      // stable, e.g. ITEM-D2
  category: ReqItemCategory;
  title: string;                   // "Compliance matrix and technical approach"
  definition: string;              // plain-language: exactly what we must produce / obey
  sourceFragments: { reqId: string; text: string; doc: string; section?: string }[]; // what it was built from
  links: string[];                 // ids of related items (rule → deliverable it governs, scope → matrix, etc.)
  inferred: boolean;               // true when the AI filled a gap the extraction cut off → shown dashed + "check"
  checkNote?: string;              // why it needs a human check
  status: 'candidate' | 'confirmed';
  dueAt?: string | null;           // for rules with dates (deadline, questions)
}
```

- Produce items with the existing AI service pattern (`govBuildSpec.ts` / `govBuildPlanAI.ts` style: advisory output,
  grounded only in the extracted text, never invents a citation). Every item must cite ≥1 source fragment or be
  `inferred: true` with a `checkNote`. Merge duplicates and split sentences into one item.
- Store items on the qualification record next to the existing established requirements (see
  `models/GovQualification.ts` + `db/ensureGovQualificationSchema.ts`; keep the model-parity test green). Confirming
  items **establishes** the underlying requirements exactly as today, so existing evaluation/coverage/approval gates keep
  working unchanged. `scope` items map to `solution_build`; `submit` + `rule` items map to submission-stage requirements.
- Combine "Upload the solicitation ZIP" + "Evidence of record" into one row: upload once → extract + attest; show file,
  doc count, fragment count, hash note, Replace / Revoke links.

**Map UI** (`Step2-Solicitation` design, `--price-selected` state):
- Centre node "Our proposal package — 1 PDF · N parts · due <date>". Left column *What we submit*, right column
  *Rules it must follow*, top *What they're buying*, bottom *After award*. Straight connector lines to the hub.
- Category colours + legend with counts. Inferred items dashed with "AI inferred · check"; rules with missing data
  ("time missing · check").
- Clicking a node opens a detail panel below the map: category badge, title, definition, check note, **Connected to**
  chips (clickable, re-select), **Built from** source fragments with doc name. Confirm / Edit buttons.
- View toggle: **Map | Checklist | Raw fragments** (raw = today's list, for audit). Map must stay usable with up to
  ~30 items (scroll or wrap columns); fall back to Checklist under ~900px wide.
- Implement the map with positioned divs + small inline SVG lines (no new charting dependency), like `GovBuildGantt`
  does for its axis.
- Confirmed `submit` + `rule` items **become the submission checklist** used in steps 5–6 and the intern portal.

### 4.3 Step 3 — Fit against Our Services (`/admin/gov-services`)
- New AI step: derive the **capabilities** the scope needs (5–8, each with a one-line "why"), then assess each against
  the tenant's active service catalog (`services/factory/serviceCatalog.ts`, `models/ServiceOffering.ts`: name,
  description, category, keywords, NAICS/PSC, past performance). Output per capability:
  `status: 'have' | 'partial' | 'new'`, matched service id(s), rationale; for `partial`/`new` also
  `whatItIs`, `whatThisBidGivesUs` (experience, reusable asset, case study even if we lose), `toDeliver` (effort/plan).
- Summary tiles: We have it / Partly / New capabilities / Disqualifiers.
- Rows expand (partial/new). Actions on a new capability:
  - **We already do this — update Our Services**: inline form pre-filled by AI (name, description, keywords) plus
    "Past performance (where have we done it?)" → **Save to Our Services** calls `createServiceOffering` (or `update…`
    when it extends an existing one). Re-run the assessment for that row after save.
  - **Add as a growth capability**: create the service with a new status `growth` (in development; excluded from
    "we have it" matching, included in reporting). Add the status to the model/schema + gov-services page filter.
  - **Find a teaming partner**: records a note on the pursuit (no external integration).
- Eligibility checks (from `govGaps.ts` + mandatory items) as tickable checkboxes.
- Persist capability decisions on the qualification record; they feed Step 4 and the brief.

### 4.4 Step 4 — Decide
- Recommendation card: label (`Bid` / `Bid with conditions` / `No bid`), reasons, and the conditions (e.g. plan for
  the new capabilities). Include **growth value**: which capabilities a bid would add even if lost.
- PWin / expected value / bid cost input (reuse `govBidDecision.ts`, `govBidAssessment.ts`, `BidDecisionDashboard`).
  Auto-set factors are shown pre-rated with their source ("Set from step 3 …"); human-only factors are 0–5 button groups.
  Show "—" until enough factors are rated; never display a fabricated number.
- "Your call" radio + rationale. **Approver** select (admins other than the requirement establisher; master-admin rule
  unchanged). **Request approval** records the decision and notifies the approver (use the existing notification /
  inbox mechanism if present; otherwise a pending-approval flag the approver sees on their Gov Opportunities list).
- Approver sees the same page with the brief and **Approve pursuit / Send back** (with note). Remove the old drawer.
- Fix the contradictory StatCards: show *Needed before submit: N* instead of *Blocking requirements*.

### 4.5 Step 5 — Build the bid
Order on the page: countdown band → Team & access → A Product definition → B Spec & MVP Gantt → C Proposal parts.

**Countdown band** (dark): `Left to submit N of M items`, `Ship by <due − 1 day> · X days`, `On-time probability P%`,
one line on the biggest risk and what answering it would raise P to; chips for *needs your answer*, *blocking export
(filler)* (live count), *questions for the City · send by <questions deadline>*.
- **On-time probability must be deterministic** (CLAUDE.md): compute from the Gantt — remaining scheduled duration on
  the critical path vs. working days to ship-by, minus items blocked on humans, with documented weights. Expose the
  inputs in a tooltip/expand ("why 74%"). If inputs are missing show "—", never a guess.

**Team & access** (`Step5-BuildTheBid` design):
- *Builder (intern)*: select from assignable builders (existing `GovAssignableBuilder`, AI-suggested one first with a
  one-line reason from profile skills/capacity) → **Assign**. This calls the existing materialize flow
  (`materializeGovBuildProject` / `govProjectMaterialization.ts` / `govBuildAssignment.ts`): creates the project on the
  intern's profile (student project), adds them as `associate_builder` `DeliveryProjectMember`, which grants the portal
  Build page via `requireGovProjectAccess`. Show assigned state + Change.
- *Share the proposal with them*: segmented control **Not shared / Can view / Can comment / Can edit** (default Can
  comment). Implement as per-project grants in the delivery authorization model: add minimal permissions in
  `modules/delivery/deliveryRoles.ts` (e.g. `proposal.read`, `proposal.comment`, `proposal.edit`) and a per-member grant
  record; do **not** broaden `requireSection('program')`. Qualification, decision and **pricing stay admin-only** at
  every level (server-enforced projection, not just hidden UI).
- "Preview what the intern sees" opens the portal page in a view-as mode (reuse `PortalViewAsPage` if suitable).

**A — Product definition** (new, AI-drafted from confirmed scope items + capability assessment): The product (what it
is), Who uses it, MVP, Later. Below: **questions the AI cannot answer from the RFP**, each with *I know* (inline answer)
or **Ask the City (by <questions deadline>)** which appends to a draft clarification-questions email for the single
point of contact (do not send email; produce the draft + a submission item "Questions sent to City").
**Confirm product — generate spec and MVP plan** is the gate into B.

**B — Spec and MVP build schedule (Gantt)**: extend `GovBuildGantt` / `buildSchedule.ts` / `govScheduleWindow.ts`.
- Rows: Define product, Spec, MVP plan (releases + stories), each MVP release (stories count, owner), releases that are
  planned-but-not-built (grey), Proposal drafting (shared), Sign + ship. Each row: name, owner, date range.
- Axis: weeks from today to after the due date. Vertical markers: **Today**, **Questions due**, **Proposal due**.
- The schedule is **back-planned from the proposal due date**: spec + MVP plan must finish before drafting depends on
  them; the MVP build ends before ship-by. Headline badge: "MVP demo-ready <date> · N days before due" (red if negative).
- Critical path highlighted (outline) with a one-line explanation. Rows remain expandable to stories (existing story
  detail). Every story cites a compliance-matrix row.

**C — Proposal parts** = the confirmed `submit` items (not one slot per raw requirement). Each part has a status chip:
`Not started | Drafting | Waits on <dep> | Needs you | Filler | Approved | Done`.

**Draft with AI** (extend `govProposalResponse.ts` + response slots):
- The draft is grounded in items, product definition, plan and Our Services past performance. Where it lacks a fact it
  inserts a typed **gap** token instead of inventing (`[needs you]`).
- Each gap becomes a question card: question text, AI suggestions (chips sourced from Our Services past performance or
  prior pursuits), **Type my own**, **Use a filler for now**.
- Filler = placeholder text visibly marked (red), the part's status becomes `Filler`, and **export/submission is blocked
  server-side while any filler remains** (extend the existing submission readiness gate in `govSubmission.ts`).
- Data: add `gaps: { id, question, suggestions: string[], resolution: 'open'|'answered'|'filler', answer?: string }[]`
  to the response slot.

**Right rail on step 5**: *Submission items* list (all confirmed submit/rule items + generated items such as Product
definition, Spec + MVP plan, Insurance certificate, Signing officer named, Single PDF assembled, Questions sent to City)
with status chips and `X of Y done`, above the Pursuit brief.

### 4.6 Step 6 — Submit
Tiles: Ship by, Closes, Submission items done. Checklist: all items done → package assembled (single PDF per the
format rule) → exported → submitted on buyer portal (manual). Record confirmation # and date. Primary **Record
submission** disabled until export; existing `submission/*` routes stay the source of truth.

### 4.7 Intern Build page (portal) — `Intern-BuildPage` design
Extend `frontend/src/pages/portal/projects/GovProjectPortalPage.tsx` and `routes/govProjectPortalRoutes.ts`
(student-safe projection in `govProjectProjection.ts`):
- Header: project name as it appears on their profile, chips (Gov pursuit · buyer, Assigned by <admin>, On your
  profile), MVP demo-ready date, proposal due + days.
- Access strip: "Build: yours to edit · Proposal: shared by <admin> · you can <level> · Qualification, decision,
  pricing: admin only".
- Tabs: **Build** (their next thing, *My schedule* Gantt filtered to their rows, stories per release with compliance
  citations and existing evidence hand-in) · **Proposal (shared)** (parts with status and comment counts; AI questions
  routed to them, answerable per their share level; hidden entirely when Not shared) · **Submission checklist** (all
  items, theirs marked "yours", price shown only as "Admin only").
- Right rail: submission countdown (count + on-time %), and "On your profile" card: project summary + skill tags from
  the capabilities it exercises; it stays on their profile win or lose.
- Every new endpoint uses `requireParticipant` + `requireGovProjectAccess('<permission>')`; non-members get 404.

---

## 5. Non-negotiables

- **Do not loosen any server gate**: separation of duties on approval, ZIP attestation, coverage/blocking evaluation,
  submission readiness, build authorization being separate from pursuit approval.
- **Determinism**: AI output is advisory and stored; gates read stored, human-confirmed data. Probability/scoring
  formulas are pure functions with unit tests (same style as `govNextStep.ts`, `govJourney.ts`, `workspaceSteps.ts`).
- **No fabricated data** in UI: missing numbers render "—" with the reason.
- **Tenant isolation**: every read/write tenant-scoped like `serviceCatalog.ts`.
- **Accessibility**: real buttons/links, `aria-current="step"` on the current step, `aria-pressed` on toggles,
  keyboard-reachable map nodes, 4.5:1 contrast.
- **Back-compat**: legacy `?tab=` links resolve; existing records without items/capabilities render (fall back to the
  established-requirement list and existing service matches).
- Keep existing tests green; add tests for every new pure module, the extractor fix, new routes (auth + 404 for
  non-members + admin-only pricing), and page tests extending `AdminGovQualificationPage.test.tsx` and
  `GovProjectPortalPage.test.tsx`.

---

## 6. Phases (one PR each)

**P0 — Read and map (no code).** Read: `AdminGovQualificationPage.tsx`, everything in `pages/admin/govWorkspace/`,
`govNextStep.ts`, `govJourney.ts`, `govBidDecision.ts`, `govBidAssessment.ts`, `govGaps.ts`, `govDeadline.ts`,
`services/factoryApi.ts` (gov types), `routes/admin/govQualificationRoutes.ts`, `routes/govProjectPortalRoutes.ts`,
`middlewares/govProjectAccess.ts`, `modules/delivery/deliveryRoles.ts` + `deliveryAuthorization.ts`,
`services/factory/gov*.ts`, `services/factory/proposal/proposalExtractor.ts`, `services/factory/serviceCatalog.ts`,
`models/GovQualification.ts`, `models/ServiceOffering.ts`, `portal/projects/GovProjectPortalPage.tsx`. Then open every
`designs/screens/*.html`. Post a short plan mapping each design element to the file you will change, and any conflicts.

**P1 — Flow shell.** New step keys/labels/questions in `workspaceSteps.ts` (+ legacy map), frontier-based state with
`locked` steps, `StepBar` update, `StepFooter` + per-step next-step derivation (extend `govNextStep.ts` to return
`{ title, detail, ctaLabel, targetStep, blockers[] }` per step), `PursuitBrief` right rail, remove the qualification
drawer (relocate its controls per §4), Snapshot step (§4.1), land on frontier. *Accept*: every step has exactly one
primary action; Build cannot show done before approval; old links work.

**P2 — Extraction fix + requirement items + map** (§4.2). *Accept*: Herriman fixture yields merged full sentences;
items categorised with citations; map + detail + checklist + raw views; confirming establishes requirements and the
existing approval gate still passes/blocks as before.

**P3 — Fit + Our Services write-back** (§4.3). *Accept*: capabilities assessed against the live catalog; claim writes a
service and re-assesses; growth status exists and is filtered on gov-services.

**P4 — Decide + approval handoff** (§4.4). *Accept*: approver request/approve/send-back loop works; self-approval still
403 except master admin (audited); no contradictory stats.

**P5 — Build the bid** (§4.5): countdown + deterministic on-time probability, team & access (assign + share levels with
server-enforced projection), product definition + questions-to-City draft, back-planned Gantt with markers and critical
path, proposal parts from items, Draft-with-AI gaps/suggestions/filler, export blocked by filler. *Accept*: filler
blocks export server-side; probability is reproducible from its inputs; pricing never reaches a non-admin response.

**P6 — Intern portal** (§4.7). *Accept*: assigned intern sees Build/Proposal/Checklist per share level; non-member 404;
project appears on their profile.

**P7 — Submit polish + docs** (§4.6). Update `docs/` with the new flow and a short operator guide.

---

## 7. Open questions — ask before the phase that needs them

1. Approver notification channel: existing in-app inbox, email, or Slack? (P4)
2. Should a "growth" capability ever count toward fit, e.g. as *partial*? (P3)
3. Default proposal share level when an intern is assigned (design assumes **Can comment**). (P5)
4. Working-day calendar for the on-time estimate (US holidays? weekends only?). (P5)
5. Is the intern's profile project public in the portfolio (`PublicPortfolioProfilePage`) or private until the outcome? (P6)
