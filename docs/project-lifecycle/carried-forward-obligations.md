# Carried-forward obligations: Phase 6, Phase 7, and the rest of Phase 3

**Who this is for:** whoever implements Phase 6 or Phase 7 of the unified project lifecycle,
possibly months from now and probably not in this session. It is written to be read cold.

**Why it exists.** Everything below was recorded during Phase 3 in
`.loop-architect/runs/20261001-unified-project-lifecycle/`, which `.gitignore` excludes (lines 18
and 93) as per-run scratch state. That was the right call for dashboards and state ledgers and the
wrong one for these: they are decisions with reasons, and the reasons are the expensive part. A
peer session pointed out that they existed on one machine and in no commit. This file is the
durable copy.

Each item says **what** and **why**, and names the evidence. Where something was measured, the
measurement is here, because "we decided X" without the reason is how X gets re-litigated or
quietly reversed.

---

## Phase 6 constraints, from a production failure

A student finished **20 of 20 stories, platform-verified**, with 14 tested stage services in her
repo, and could not run her own product: `server.ts` mounted only `/health` and `/api/audio`, so
twelve services were unreachable and nothing chained them. Her releases were layered by pipeline
stage, so r0 was six ingestion stories and the walking skeleton never walked. She did what was
asked; the plan failed her.

### 1. Do NOT add an r0 keyword rule

Detecting "does r0 reach user-visible output" from story titles was **tried and measured as
unworkable**: the regex missed `Approval`, `Notification`, `Generation`, `Deliver`, `Upload`,
`Record`, `Schedule`, and flagged plans that were in fact fine ("Deliver curated AI content to
users", "User Account Creation and Secure Login").

The repo already contains its own precedent for why. `planGate.ts` has three release-level r0
rules — `r0_missing` (blocking), `r0_not_ungated` (blocking) and `r0_no_trust_spine`
(**advisory**) — and the third is a keyword regex,
`/audit|idempot|exactly[- ]once|approval gate|dedup|replay|transaction id/i`. It tries to detect
*meaning* by keyword, which is why it is only trusted enough to warn with. A fourth r0 regex would
be the same instrument with the same limit.

So the rules test **existence**, **gating** and **prose** — and none tests reachability of output.
A six-story ingestion-only r0 satisfies all three: it exists, nothing blocks it, and one story
need only contain the word "audit" to clear the advisory.

**The signal has to be declared, not inferred.** That is what `plan_ready`'s per-story
workspace/action reference is for.

### 2. Any new r0 rule ships ADVISORY unless it lands after the structured field exists

`addStoryService.ts` refuses Add-a-Story outright when the **published** plan fails the gate
(`PlanPredatesGate`, 422, keyed on `blockingViolations(gatePlan(published.plan))`). So a new
**blocking** rule retroactively locks every affected student out of adding a story, through no act
of their own. The gate's own stated principle is "write broken data? block; merely untidy? warn".

### 3. `release_review` must not stay `() => []`

`lifecyclePrerequisites.ts` has `release_review: () => []` and `launch_ready: () => []`. The
contract of that map is *unmet prerequisites*, so an empty list means none unmet and **the stage
passes**. These two are not inert; they are open.

The architecture doc specifies what `release_review` owes: *"each release demonstrates a business
workflow in the approved workspaces, including its human decision"*. That is the prerequisite that
would have caught the failure above. It cannot be evaluated until a story carries a
workspace/action reference, which is Phase 6 — which is *why* it is empty, and also why it must not
stay that way.

**A correction this surfaced:** PR #2903 said *"`gatherEvidence` returns the honest 'nothing
assessed yet' value for every field, never one that would let a stage pass."* True of every stage
that reads evidence fields; **not** true of these two, which read nothing.

### 4. `launch_ready` likewise

Same shape, same reason.

---

## Phase 6 must also fix the evidence stubs these depend on

`lifecycleStatus.ts`'s `gatherEvidence` hardcodes four allocation/accountability fields to
permissive values, so the rules that read them cannot fire:

- `unknownAllocationCount: 0`
- `tasksWithoutExecutionClass: []`
- `tasksWithoutAccountableHuman: []`
- `agentTasksAccountableForThemselves: []`

All four need the same missing thing: a loaded `FactoryProject` inside `gatherEvidence`. Fixing one
alone produces a half-wired evidence path and a rule that still cannot fire. Note that
`effortCoverageDisclosed: false` is in the *blocking* direction, so the stub set is mixed — do not
assume a uniform convention.

**Consequence today:** `allocation_unknown` cannot fire, so the "full approval refused" half of
Phase 3's allocation work is enforced at module level only, never through `unmetPrerequisites`.

---

## T6 (blueprint generation orchestration) obligations

**Status after T6, attempt 3 (2026-10-04) — VERIFIED PASS at 11/12.** Four of six discharged, one still open, one
partially met and deferred with its reason. Recorded explicitly because the T6 commit first
claimed "FOUR OBLIGATIONS … EACH DISCHARGED", silently renumbering a committed set of six — the
verifier caught it, and the machinery for recording a deviation had been used carefully three
paragraphs earlier in the same message for `gateAndRepair`, so there was no excuse for not using
it here.

| # | Obligation | Status |
|---|---|---|
| 1 | ID stability on replay | **Discharged.** With its positive control: without the prior map the same replay still reads as total loss. |
| 2 | Revised requirement keeps id, bumps revision | **Discharged on attempt 3.** Attempt 1 made it *worse* and attempt 2’s positional mechanism was replaced — see below. |
| 3 | Auto-rationale must not self-certify | **Discharged.** Two behavioural tests plus a (weaker, evadable) source-text check. |
| 4 | Declaration not from the same model turn | **Discharged.** Refused before any stage runs. |
| 5 | `role_map` write/read round-trip | **STILL OPEN.** Nothing reads or writes `blueprint_role_map`. Needs a persisted manifest, which is Phase 6. |
| 6 | `belowTarget` tri-state | **Discharged.** Read as `!== true` at the only call site. |

**Obligation 2 is worth reading in full, because attempt 1 made the system worse.** Carrying the
id alone fixed the noisy failure (a correct replay reading as "30 lost and 30 invented") and
introduced a silent one: a *corrected* requirement came back at the same id with `revision: 1`,
so `reportHandoffIntegrity` reported `ok: true, 0 lost, 0 invented` for text that had materially
changed. A reviewer would have been told nothing happened. **A loud false positive traded for a
silent false negative is a regression, not a fix.** The replay map now carries the prior *items*,
a wording change goes through `reviseSourceItem` (same id, next revision), and the integrity
report gained two directions: `revised` (legitimate, reported, does not fail) and
`rewrittenWithoutRevision` (text changed with no bump — history rewritten in place, and a
failure).

**CORRECTED AFTER ATTEMPT 3 — the paragraph that stood here described the positional
mechanism attempt 3 replaced, and it understated the module.** Deleting an item does **not**
shift later items onto a predecessor’s locator. Identity is resolved text-first, so
survivors keep their own ids and the deletion reports `lost: 1, revised: 0, ok: false`.
Measured at HEAD. A reader of the old text would have gone to fix a non-bug — which is
exactly what this register exists to prevent, since Phase 6/7 read it as the authority on
what is open.

**What IS open, measured by the attempt-3 verifier rather than asserted:**

- **A fabricated `history` entry still buys a revision.** `history` arrives from whoever
  supplied the understanding, so a generator emitting both can name a deleted item’s text
  and get `ok: true, revised: 1` for a never-before-stated requirement. Narrower than the
  positional version it replaced — the exact prior wording must now be named, and the result
  is flagged `revised` rather than passing silently — but not closed.
  **`blueprintGeneration.DeclarationOrigin` refuses precisely this shape** for the capability
  declaration, on the grounds that a generator emitting both can declare whatever it invents.
  Holding the two fields to different standards is an inconsistency, not a judgement. Closing
  it needs the revision history to arrive from an earlier stage than the replay — the same
  shape as the declaration fix. **Phase 6 owns it.**
- **A non-appending insert collides locators.** A reused prior keeps its original locator while
  a mint takes the current per-dimension position, so inserting *ahead* of an existing item
  yields two items at `#1`, and a later **unchanged** replay then reads 1-lost/1-invented — a
  false positive on the very case obligation 1 exists to prevent. Loud rather than silent, and
  inherited from the plan’s prescribed `(dimension, locator)` key. The real fix is a stable
  per-item id on `UnderstandingItem`, which does not exist.
- **Provenance drift at unchanged text** was dropped silently. Attempt 3 now takes the current
  item’s provenance on a text match: an item moving `ai_inferred` → `client_confirmed` kept
  reporting `ai_inferred`, which understates how well-founded a requirement has become, and
  `FACT_BEARING_PROVENANCES` upstream treats those two very differently. The integrity
  report still does **not** name a provenance change, because identity there is text rather
  than provenance; the fix corrects the handoff the next stage reads, and nothing more.

**§7 corpus cases:** two of three run through the orchestrator (multiple roles held by one
person; a low-information interview yielding an empty handoff rather than an invented one). The
third — a blueprint changed while generation is in flight — needs a store and a revision to
compare against, and the orchestrator is a pure function with neither. The CAS mechanism already
exists at the Phase 2 approval gate (`uq_blueprint_approval_revision`, proven against a real
Postgres); wiring generation to it is Phase 6's, when the orchestrator gains a persisted
manifest. A test asserts the absence rather than faking the race.


### 1. ID stability across a replay

`buildSourceHandoff` mints a fresh UUID per call — its suite asserts this deliberately. Harmless
while nothing imports it, but once T6 orchestrates it, a **replayed** handoff over an unchanged
understanding reads to `reportHandoffIntegrity` as **30 lost and 30 invented**: the integrity check
Phase 3 built would fire on a correct replay. T6 must carry existing ids forward, keyed on
`(dimension, locator)`, and assert that a second run over an unchanged understanding reports
`ok: true` with empty `lost` and `invented`.

### 2. A revised requirement arrives with its revision, not as a new item

`UnderstandingItem.history` is dropped by the handoff, so a corrected requirement arrives as
`revision: 1` with no trace it changed — while `reviseSourceItem` exists precisely to preserve the
id and bump the revision. Once replay is wired, a wording correction must round-trip as *same id,
next revision*, never as a delete plus an insert.

### 3. The auto-rationale must not be self-certifying

`deriveAllocation` emits `rationale: "derived from the … PERFORMER assignment"`, which satisfies
`ALLOCATION_RATIONALE` **by construction**. A T6 fallback that fills allocation gaps from the
derivation would make "all human is a recorded decision" certify itself: every task carrying a
rationale and none carrying a reason. T6 must either refuse to auto-fill, or mark a derived
rationale as derived and have the approval gate require a human-authored one.

### 4. The capability declaration must not come from the same model turn as the roster

`CAPABILITY_UNDECLARED` and `CAPABILITY_LABEL_UNDECLARED` both check an agent roster against the
blueprint's own declaration. A generator emitting **both** can declare whatever it invents, so the
check has force only if the declaration is authored at an earlier stage by a different actor. T6
must pass the declaration *through* from the approved blueprint rather than accept it alongside the
roster, and assert that a roster-supplied declaration is refused.

Related, and measured: `AGENT_PER_STORY` was evaded with a 12-agent 1:1 roster labelled
`slice-0..slice-11`, because `capability` was free text checked against nothing. Requiring declared
labels raised the price to twelve declaration entries a reviewer can count. **It is still evadable
if all twelve are declared** — a test asserts that, so the rule is not read as stronger than it is.
Item 4 is what actually closes it.

### 5. `role_map` write/read round-trip

Moved here from T3, where it could not be met: nothing reads or writes `blueprint_role_map` yet, so
a round-trip criterion cannot be satisfied by the task that creates the table. The table is
correctly sequenced early — the DDL is **not dark**, it runs at boot regardless of any flag, so
landing it a phase before its writer is what lets Phase 8 verify it against the real release.

### 6. `belowTarget` is a tri-state and the falsy read is a trap

`null` means unmeasurable; `false` means the target was met. A caller writing
`if (!measure.belowTarget)` gets "target met" from missing data. The only current call site
(`checkTargetDisclosure`) correctly guards `!== true`, and a test pins that. T6 is the next caller.

---

## DECIDED 2026-10-03: who approves a staff-initiated student build

**Answered: the initiating staff member approves, and the control is the hash-bound review hold
rather than a second identity.** The decision and its reasoning are in `architecture.md` §5.1a.
Ali settled the premise — the initiating staff member and the programme owner are the same person
— which rules out separation of duty for this path entirely: a second approver is the same human
clicking twice.

**And the asymmetry described below does not exist.** I wrote that row 5 honoured no hold while
row 6 did. Both always hold: `holdForReview: true` is hardcoded in `startInternProjectBuild` and
at both flotation admin doors. What defaults off is `buildFromUnderstanding`, for the **public**
door, deliberately — a student's own build should publish the moment it is good. The repo had
already converged on "staff-initiated holds, self-serve publishes"; I read my own table instead of
the code, and reported the non-existent asymmetry to a peer session and in a commit message.
Corrected in the matrix too.

The three options are kept below, because they are the record of why the answer is what it is.

`architecture.md` §5.1 draws the line as **"the owner approves what gets built; the student
receives what was approved"**. That cleanly covers two of the three shapes:

- **Portal self-serve** (rows 2, 3, 4) — the student initiates, the owner approves. Clear.
- **Client delivery** (rows 6, 8, 11) — staff initiate for a paying client. Clear.
- **Staff-initiated STUDENT build** (row 5 internship, and row 6 where flotation intake targets a
  student project) — staff initiate, a student receives, and nobody in the current line is
  obviously the approver. This is the gap.

One concrete asymmetry already in the matrix, which the decision should probably resolve rather
than inherit: **row 5 (internship) honours no review hold at all**, while **row 6 (flotation
intake) honours `holdForReview`**. Two staff-initiated paths, two different answers to "may this
reach the student unreviewed", and no recorded reason for the difference.

What each answer would imply for Phase 6:

- *Staff are the owner for this path* — row 5 needs a hold like row 6 has, and the approving
  identity is the initiating staff member. Cheapest, but it means the person who asked for the
  build also approves it, which is the self-approval shape `govQualification`s
  `SelfApprovalError` exists to refuse elsewhere.
- *The programme owner approves, not the initiating staff member* — row 5 and row 6 both route
  through the same hold, and separation of duty is preserved. More correct, and it adds a human
  step to a path that currently has none.
- *A staff-initiated student build is a different lifecycle* — honest if the stages genuinely
  differ, but it means a second set of stage definitions, and `PROJECT_APPROVAL_GATE`'s removal
  already established that students get no say in the build, so the student is not the approver
  under any option.

Whatever is chosen, it must be stated in `architecture.md` §5.1 rather than only implemented,
because the current wording reads as though it already covers every case.

## Phase 4 open items (P4-T1)

**P4-T1 is CLOSED at Ali’s decision after eight gradings.** The behaviour is unfalsified across
three independent generators and 310,736 calls; the residuals below are recorded rather than
chased further, because the module is imported by nothing until P4-T3 and every item has zero
blast radius.

- **Amendment 3’s count check is under-broad.** It matches roughly the one historical phrasing;
  "we have 40 positions", "the table has 39 positions in it today" and similar all pass.
  Broadening the pattern is cheap and was deliberately not done in the closing commit, which
  added no prose.
- **The position table is hand-written.** Keyspace and leaf value space are derived from source;
  the positions are not. A position nobody listed is a gap no control can see.
- **Two further levels of the same class are unsolved:** *which mechanism* delivers a property,
  and the control’s author-chosen *definition of reach* — now "the body ran", much stronger
  than the code-absence version it replaced but still a definition I chose.
- **Minor wording residue:** the covered-element sentence distributes `id`/`title`/`kind` across
  all three project arrays while the code reads `.title`/`.kind` on tasks only and `.id` on all
  three; and one word-spelled apparatus count ("three positions") remains, accurate today.
- **`unboundProposedSurfaces` has no consumer.** Owner **REASSIGNED** — see the full entry
  below. This bullet said "Owner **P4-T3**, the natural reader" until a verifier found that
  the reassignment had landed in the detailed entry and not here, so the register named both
  a finished task and its replacement as owner, 55 lines apart.
- **CLOSED — combined public export surface.** Was 15 and 20 against the per-module ceiling of
  12; now 10 / 10 / 5 across three modules. P4-T5 closed it. This bullet asserted the breach
  in the PRESENT TENSE until a verifier found it 31 lines above the entry recording the fix.
  Both of these bullets were written as a quick index of the detailed entries below and then
  not maintained when those entries changed, which is the specific way a register rots: the
  summary is what people read.
- **`SURFACE_ACCEPTANCE_SELF_SUPPLIED` is a marker, not an enforcement** — `origin` is
  generator-supplied and names no artifact a reviewer can check it against. Owner **Phase 6**.
- **The §4.1 cosmetic rule quantifies over "every gate", and the gate set is NOT derivable
  today.** The section shipped a verb-prefix regex presented as a derivation; a verifier
  showed it omits `checkApprovalEligibility` and `assessDesignLoop` from the very file it
  greps, plus ten more verdict-returning exports. The rule is therefore not mechanically
  checkable, which §4.1 now states. Closing this means the classification lives in code with
  a test that FAILS when a refusal-code-bearing export is added without being classified —
  the naming convention cannot carry it. **Owner: whoever implements the comparison** (§4.1
  step 3), since the set is that implementation’s input.

- **STANDING RULE for the rest of this build (adopted 2026-10-05):** a claim quantified over an
  input space ships with **a seeded generator over that space and the command that enumerated
  it**, or it is rewritten as a scoped list. P4-T1 published such a claim four times and was
  falsified **five** times — one field, then the container, then the elements, then the
  stringification inside the refusal message, then the same stringification and element
  defects one argument over, in `project`. Each fix was right; each sentence was broader
  than its fix.
  **Amended twice on 2026-10-05, because the rule itself recurred at two further levels.**
  This is the durable copy and the one later phases read cold, so it states what is
  actually true rather than what an earlier draft intended:

  - The **keyspace** and the **leaf value space** must be derived from the code under test.
  - The **position table remains hand-written** — a recorded residual limit, not
    something derived away. A position nobody listed is a gap no control can see.
  - The positive control must be **per claimed position**, never aggregate or per guarded
    body. An average is satisfied by one reachable position out of thirty.
  - Where reaching a position needs the value to BE a valid structure, seed a **valid
    exemplar** per position; the exemplars deliver reach, and the derived leaf literals
    only broaden the hostile corpus. Mutation-measured: removing the literals leaves the
    reach table byte-identical.
  - **Amendment 3:** no number describing the test apparatus may appear in prose unless a
    test asserts it. Two tests enforce it.

  An earlier version of this entry said the position set must be derived and that every
  *guarded body* needs a control. Both were overstatements of what was built; the
  correction is above. Full history and measured figures in `plan-phase4.md`.
- **CLOSED by P4-T5: the combined public export surface of `workspaceMapping` +
  `workspaceBindingChecks`** once exceeded CLAUDE.md’s per-module ceiling of 12 (15 and 20).
  Now 10 / 10 / 5 across three modules — see the CLOSED section further down. This entry was
  still phrased as open after the fix landed, which a verifier caught: a register stating the
  same item as both open and closed is worse than one that omits it. The original text follows. The split that brought both files under
  the 500-line ceiling forced **ten** internal helpers to become exported — the count was
  stated as nine in three places until a verifier caught that this commit had added `label` as
  the twentieth export. None is accidental and all ten are consumed, but the ceiling is
  breached. Collapsing it needs a third module holding
  the shared predicates. **Owner: P4-T5**, which already must touch these files.
- **`SURFACE_ACCEPTANCE_SELF_SUPPLIED` is a marker, not an enforcement.** It mirrors
  `DeclarationOrigin` and fails closed on an absent or unrecognised origin, which is the right
  direction — but `origin` is itself generator-supplied, and where
  `DeclarationOrigin`'s `approved_blueprint` names a real upstream artifact a value can be
  passed through from, `'owner_recorded'` names nothing in this repo for a reviewer to check it
  against. The waiver costs three string literals instead of two. **Owner: Phase 6**, which
  persists the manifest an acceptance could be attested against.

- **`unboundProposedSurfaces` is a producer with no consumer.** It reports which free-text
  `proposed_surfaces` from the understanding no declared workspace covers. Nothing in the repo
  calls it and the Phase 4 plan schedules no caller. It ships because the gap it reports is real
  and because auto-binding on a string match would manufacture traceability rather than establish
  it — but a producer nobody reads is a named failure mode here, so it is recorded rather than
  left to look wired. **Owner: REASSIGNED to whoever composes the generation pipeline.** It was
  P4-T3, "which carries `task_surfaces` into the design brief and is the natural reader" — and
  **P4-T3 shipped without closing it.** Measured: zero callers. An owner who has already
  finished is the same as no owner, which is precisely what this register exists to prevent.
- **A workspace binding proves interaction, not a chained workflow.** `SURFACE_NO_HUMAN_PATH` and
  the per-task rules together prove a human interacts somewhere; an ingestion task bound to an
  "Imports" admin screen satisfies all of them. Stronger than the measured-unworkable
  `r0_no_trust_spine` regex, weaker than "proves a workflow". **Owner: Phase 6**, whose
  release-level view can test whether r0 reaches user-visible output.

---

## Phase 7 (hardening) gaps

Each is a place a gate is thinner than it reads. None collapses a blocking set, which is why they
were recorded rather than patched mid-phase.

- **`rationale: '.'` passes.** Only `trim() === ''` is refused, so a single punctuation mark
  satisfies `ALLOCATION_RATIONALE`. A minimum-substance rule belongs with the hardening work, not
  as a length guess bolted on.
- **An `accountable_role_id` absent from `project.roles` passes**, as long as some assignment with
  a human executor carries that id. There is **no role-reference rule anywhere in
  `factoryValidate`** — its codes cover work, source, performer, oversight, duplicates, effort,
  stages and flow, but never "does this role exist". Worth a `ROLE_REFERENCE` rule, and worth
  knowing it is missing before anything leans on role ids.
- **`exclusionReason` reports only the first reason.** A task that is both `UNKNOWN`-basis and
  negative reports only the basis. Arithmetic and coverage are identical either way, so this costs
  an extra review round rather than correctness.
- **`PERFORMER` fires only on zero performers** in `factoryValidate`: it builds a count map and
  then tests `if (!performersByTask.get(t.id))`, so two performers on one task pass silently. Phase
  3 enforced "exactly one" in the blueprint layer rather than tightening the shared validator,
  because tightening it would newly reject already-stored factory projects — an unplanned data
  migration across the 11 non-test modules that depend on that contract.
- **A stable per-item id on `UnderstandingItem` does not exist, and two T6 limits both trace to
  its absence.** Replay identity is resolved by exact TEXT per dimension, with the locator
  (`${dimension}#${ordinal}`) carried from whichever item claimed it. So a **non-appending
  insert collides locators** — insert ahead of an existing item and two items sit at `#1`,
  after which a later *unchanged* replay reads 1-lost/1-invented. Loud rather than silent, and a
  false positive on the very case T6 obligation 1 exists to prevent. Adding the id is a change
  to the understanding contract, not to this module, which is why it is here and not in Phase 3.
- **`history` is trusted where the sibling field is not** — see the T6 section above. A
  fabricated `history` entry buys a revision (`ok: true, revised: 1`) for a never-before-stated
  requirement, while `blueprintGeneration.DeclarationOrigin` refuses precisely this shape for
  the capability declaration. **Phase 6 owns the fix** (the revision history has to arrive from
  an earlier stage than the replay); it is listed here so a hardening pass does not read the
  text-first resolution as closed.
- **The §7 corpus case "source exceeding model input limits" is closed for the blueprint path
  only.** The live student SBP path keeps its truncate-and-label behaviour, because
  `decomposePrompt.delimited()` **is** the SAFE-002 injection defense and that path is unflagged
  (`grep -c FLAGS` is 0 in both `decomposeService.ts` and `sbpOrchestrator.ts`), so a change there
  ships to students on the next deploy with nothing to hold it.

---

## Two traps worth knowing before editing anything here

- **`strict: true` structured outputs require `required`/`properties` parity at every object
  level.** `FACTORY_DECOMPOSITION_JSON_SCHEMA` is submitted that way from two sites, and
  `toStrictSchema` only rewrites `oneOf`→`anyOf` — it does **not** repair parity. Adding a property
  without adding it to `required` makes the whole schema unsubmittable, so **nothing** generates,
  on both the decompose and repair paths. Both suites mock the client, so no test catches it; a
  structural parity assertion now does.
- **`factoryContract.test.ts` pins the decomposition schema as an exact set** — `required`, the
  exact `Object.keys(properties)`, and `additionalProperties: false`. Update it to the new exact set
  when you add a key; do not relax it to a subset check, because the exactness is the whole value.

---

## Phase 4 open items (P4-T4), and three corrections from the P4-T2 verification

### Obligations

- **`ProcessRecord.exceptions` has no documented meaning and no reader.** `string[]` on
  `factoryContract.ts`, no doc comment, and the only `.exceptions` reference under
  `services/lifecycle/` is `designAlternatives.ts` deciding NOT to read it. Every sibling
  field on that record holds prose. **Whoever gives the field a meaning owns joining it to**
  `exceptionTaskIds()`; until then `is_rework` is the only exception source, by design.
- **The reference corpus has zero rework edges, and Fixture B is supposed to have one.**
  All eight transitions in `referenceFixtures.ts` + `manualOnly.ts` are `is_rework: false`,
  and every `ProcessRecord` has `exceptions: []`. `reference-fixtures.md` asserts for
  Fixture B that "the appeals path is a real exception/rework edge in the transition graph,
  not an orphan task" — **that coverage claim is not met by the code fixture.** Not fixed
  here: the fixture is shared with Phase 3’s suites, so changing it is a Phase 7 corpus
  change, not a side effect of a Phase 4 task. P4-T4 supplies its own rework input instead.
- **`deliveryDesignLoop.ts` exported 20 public symbols when measured on 2026-10-06, against
  a hard ceiling of 12.** P4-T4
  avoided widening it by adding nothing to it, which is not the same as fixing it. The split
  is the obligation of the next task that needs to ADD a symbol there.
- **`controlSurfaceExists()` still has no production call site.** Found by the P4-T2
  verifier, and it is a precise point: `designBrief.DesignFacts.controlSurfaceExists` is a
  **passed boolean of the same name**, and the claim is genuinely gated on it in both
  directions — but nothing calls the function, and nothing supplies the field, because no
  design-stage orchestrator exists yet. **The phase that builds that orchestrator closes the
  wire**, and **the compile-time half is part of that obligation**: the composition belongs in
  a module the typecheck gate compiles, because `backend/tsconfig.json` excludes
  `**/__tests__/**` and a test cannot carry a compile-time guarantee here.

  A composition test pins that the function’s output is ACCEPTED by the field **today**, at
  runtime, in both branches. It does **not** stop the two halves drifting, and an earlier
  version of this entry said it did: a widened `enforcedBy`, or an added element field, would
  leave it green. That is the same drift §15 of the design doc names as the risk, so claiming
  the test closes it was the overclaim one notch quieter.

### Corrections made to earlier Phase 4 records

- The P4-T3 session entry claimed "this is where `controlSurfaceExists()` stops being a
  producer with no consumer". **True of the boolean field, not of the function**, and the
  entry has been corrected rather than left to read as if the wire were closed.
- `workspace-and-control-design.md` §8 said the only tree reference to the three agent
  execution limits outside their definitions is a doc comment. **That is exact for the three
  CHECK FUNCTIONS and false for the three COLUMNS**, which are read in the resource monitor,
  the Reese agent detail service and the frontend. Scoped.
- §12 said "a test asserts this table equals the emittable set in both directions". The test
  asserted `CONTROL_CODES` against the emittable set; **nothing asserted the markdown table
  against `CONTROL_CODES`.** A test now parses the table out of the doc and asserts
  set-equality, following the `readFileSync` precedent in `workspaceMapping.test.ts`.

### A trap worth knowing: jest here cannot see a type error

`ts-jest` runs with `isolatedModules`, which strips types without checking them. P4-T4’s two
modules passed their suites **green with three real `tsc` errors in them** — a widened
`includes` that narrowed nothing, and an `Array.isArray` on a `ReadonlyArray` silently
producing `any[]`. A green jest run is not a typecheck, and only `tsc --noEmit` is.

---

## Phase 4 open items (P4-T5), and a design-system finding with an owner

### The design system cannot meet WCAG AA for small text in six token pairs

Measured with `node scripts/checkTokenContrast.js`, which parses the hex values out of
`frontend/src/styles/tokens.css` and carries a positive control (21.00 black-on-white,
1.00 white-on-white) so a broken calculator cannot report a clean result:

| pair | ratio | note |
|---|---|---|
| `--color-muted` on `--color-bg` | 2.54:1 | **below even the 3:1 non-text bar** — must not carry text or a meaningful boundary at all |
| `--status-partial-text` on `--status-partial-bg` | 3.61:1 | one of the four pairs in the repo’s own status family |
| `--color-danger` on `--color-bg` | 3.76:1 | |
| `--color-primary` on `--color-bg` | 3.85:1 | fine for headings, which are large text; **not** for a label at `--font-size-sm` |
| `--status-verified-text` on `--status-verified-bg` | 3.95:1 | also from the status family |
| `--color-text-light` on `--color-bg` | 4.02:1 | the nearest usable neutral, and still short |

**This is a finding about the EXISTING design system, not about Phase 4’s work**, and it
belongs to whoever owns `tokens.css`. Phase 4 only constrains itself: `AA_LABEL_PAIRS` in
`workspaceStateChecks.ts` admits the measured-passing pairs and nothing else, and a test
derives the AA-passing set from `tokens.css` so the list cannot drift from the file.

**Two of the six are in the four-state status family**, which is the family a reviewer would
naturally reach for when labelling a workspace state — the reason the check exists rather
than a note asking people to be careful.

### There is no dark theme, so §4.5’s dark-mode option is closed

`grep -rn "prefers-color-scheme|data-theme" frontend/src/styles/*.css` returns nothing. §4.5
permits dark "only if supported by existing tokens", and it is not supported — not partially.
A contract declaring a dark variant would declare something nothing can render. Closed by
measurement, so it does not need re-litigating on taste.

### Deferred to Phase 5, with the reason

- **Screenshots and real responsive behaviour.** Both need a rendered surface, and Phase 4
  produces contracts. §4.5 itself says "a screenshot or matching domain vocabulary alone does
  not establish usability", so the deferral is not a weaker position than taking them now.
- **Whether the running surface enforces the permission views it declares.** That is a
  route-authorisation question and belongs where the routes are. Worth flagging for whoever
  does it: this repo’s route-auth lint is per FILE, so an unguarded route in a guarded file
  passes it.

### CLOSED: the export-surface breach from P4-T1 — and the plan’s premise for T5 was stale

The T5 packet says `workspaceMapping.ts` is "478 lines against the 500-line hard ceiling" and
must extract `shapeIssue`/`refIssues` first. **That was done in P4-T1 and the measurement was
stale.** What was NOT done was the surface: the P4-T1 split fixed a LINE count and made the
EXPORT count worse, turning one over-ceiling file into two.

| file | lines | exported symbols (ceiling 12) |
|---|---|---|
| `workspaceBindingTypes.ts` **(new)** | 158 | **10** |
| `workspaceBindingChecks.ts` | 325 | **10** (was 20) |
| `workspaceMapping.ts` | 383 | **5** (was 15) |
| `workspaceStateChecks.ts` **(new, P4-T5)** | 279 | **8** |

The seam needed no invention — the types were already a contiguous block between the imports
and the first function. **Removing the re-export facade is what actually closed it:**
`workspaceMapping` was re-exporting ten of the sibling’s symbols so older import paths kept
resolving, and that convenience was two thirds of its budget. CLAUDE.md permits that as a
single coordinated change with every consumer updated in the same diff, and every consumer is
in this repo.

**Two tasks stepped around this before it was fixed** (P4-T4 and P4-T5 each added a sibling
module rather than widen it), which is worth recording as a pattern: the second time a change
avoids a rule rather than satisfying it, the rule needs its own change, not a third preamble.

**The trap found while doing it — and the first description of it was WRONG.**
`__tests__/workspaceMapping.test.ts` derives both its generator keyspace and its leaf value
space from a **hand-listed set of filenames**. The original claim here, and in the shipped
source header, was that removing the new file from that list would shrink the keyspace "with
nothing failing". A verifier removed it and ran the suite; so did I:

```
SOURCES without workspaceBindingTypes.ts  ->  97 of 98 pass
FAIL: THE LEAF VALUE SPACE IS DERIVED: union literals the code compares against
```

So the keyspace control alone would NOT have caught it — that test stays green — and the
leaf-value-space control does, by name, because the union literals moved with the types. **The
real residual is narrower: a symbol that is neither a key nor a union literal can leave this
folder and neither control will notice.** Corrected in the source header too, because a false
counterfactual in shipped guidance tells the next engineer they are safe when they are not.

The lesson is this run’s own rule applied to prose: **a claim about what a check
would do has to be mutation-proven before it is written.** This one was asserted from reading.

**And the split broke 19 tests before it passed.** `workspaceMapping` *uses*
`HEADLESS_REASONS` and `SURFACE_CODES`, not merely re-exports them, so moving them out from
under its imports left two `ReferenceError`s. Caught by running the suites — and `tsc` would
have caught it sooner, which is the argument for running the typecheck before believing a
refactor.

### A flake observed once and NOT reproduced

A verifier saw `designAlternatives.test.ts` fail one test under six-suite parallel load while a
second verifier was simultaneously running jest and a 14-minute `tsc` on the same machine. Run
alone it was 41/41, and serially 206/206.

**Three further parallel runs of seven suites: 252/252 each time.** Slowest single test 424ms
against jest’s 5s default timeout, so a timeout is implausible at normal load. Recorded as
observed-once-and-unreproduced with the measurements, rather than claimed fixed or waved away:
if it recurs, the first thing to know is that no test in these suites is anywhere near the
timeout, so look at module-compile contention rather than at test logic.

---

## Phase 4 open items (P4-T6): two deferrals, a retroactive gap, and one size residual

### DEFERRED: the hash and approval-invalidation binding — three parts, all missing today

**Owner: the phase that ships a persisted manifest** (Phase 5 or 6, whichever writes
`refs_json` first).

All three plan-audit cycles carried an item asserting that selecting or revising a design
changes the blueprint hash predictably and invalidates the right approvals. **No file in any
task's Files list could have produced that**, and the audit was right to block it. What is
actually there:

- the hash is `manifestContentHash({tenantId, projectId, revision, refs})` at
  `blueprintApproval.ts:104-116`, computed over `manifest.refs_json`;
- **nothing in production writes `refs_json`**, and the root cause is a level deeper than it
  looks: **production never CREATES a manifest row at all.** `blueprintApproval.ts` only
  `findOne`s one and `update`s it; every `INSERT` into `operating_blueprint_manifests` is in a
  test, and there are exactly **two**: the raw-SQL concurrency test and P4-T6’s own
  `designPersistence.test.ts`. This line previously said three and named
  `blueprintApproval.test.ts`, which a verifier showed **inserts nothing** — it `jest.mock`s the
  model with `{ findOne, update }` and merely sets `refs_json` on an in-memory fixture. Two
  documents this task was charged with reconciling disagreed, and the policy document was the
  one that had it right;
- **no material-vs-cosmetic classifier exists anywhere in `backend/src`**;
- ~~and the policy it would implement is not written down either~~ — **CLOSED by P4-T7.**
  `approval-and-change-policy.md` said only *"Follows a documented narrower rule"*: a document
  shipped in Phase 1 promising a rule it never stated. **§4.1 now states it.** Writing it
  needed neither `refs_json` nor a classifier, which is why it was unbundled from this
  deferral rather than waiting on it — and a verifier flagged that leaving this bullet as-is
  would make the register contradict a document in the same commit.

**The three parts, so none of them is forgotten separately:**
1. Write `refs_json` on the production manifest path.
2. ~~State the narrower cosmetic-vs-material rule~~ — **DONE**, §4.1 (P4-T7). The rule is
   mechanical: **a change is cosmetic if and only if every gate returns an identical verdict
   on the old and new revision.** Defined that way rather than as a list of safe fields,
   because a list goes stale silently the moment a new gate reads a listed field; and rather
   than as a judgement about "altering meaning", because that is unfalsifiable and is
   exactly the judgement a motivated author makes in their own favour.
3. Implement the classifier, and only then assert invalidation.

**What P4-T6 did instead of asserting it:** `blueprint_design_decisions.manifest_content_hash`
RECORDS the hash a decision was taken against. That is what lets the classifier arrive later
without a backfill. It is deliberately not a claim that invalidation works, and the column
comment says so.

### DEFERRED: the `gatherEvidence` stubs that the design gate depends on

**Owner: Phase 6**, as already recorded in the Phase 6 section above. P4-T6 adds the specific
implication rather than a second copy of the obligation: `lifecycleStatus.ts:142` hardcodes
`selectedDesignRef: null`, so the `design_ready` gate that P4-T4 feeds **cannot be reached
end to end today**. P4-T4 asserts through the exported `prerequisiteGaps` over a constructed
`LifecycleEvidence` instead, which is a unit proof of the rule and not of the wiring. Whoever
closes the stub should expect that distinction to be load-bearing.

### RETROACTIVE GAP: the acceptance-evidence rows owed by Phases 1-3

`acceptance-evidence.md` now exists, created by P4-T6 with the **LC-08 and LC-09 rows only**.
`execution-contract.md:103` requires all eighteen; **LC-01 to LC-07, LC-13 and LC-14 are owed
by Phases 1-3 and are not written.**

Recorded rather than backfilled, deliberately. Writing those rows now would mean inventing
evidence from plans that did not measure it — and LC-13 in particular is a real production
incident whose row should cite the incident and the fix, not a summary written months later by
someone reading the plan. **Owner: whoever next touches those phases, or Phase 8 when it
assembles the table.**

### CLOSED by P5-T1.3: `ensureProjectLifecycleSchema.ts` split at the prescribed seam

Split into `ensureProjectLifecycleSchema.ts` (the DDL and the ensure path) and
`projectLifecycleSchemaContract.ts` (the assertion lists and the assert), at
exactly the seam this entry named. Three importers repointed, no re-export barrel. The
split broke the `assertProjectLifecycleSchema()` call at the end of the ensure path and
`tsc` caught it as one TS2552 above the 4-error baseline — the entry below was right that
discovering this at the ceiling costs a split under pressure, and right to say so in
advance.

**NO LINE COUNTS ARE QUOTED HERE, and an earlier version of this entry quoted two.** It said
287 and 167; the shipped tree is 324 and 200, because P5-T1.3 step 2 then added a column, a
fourth assertion list and an assert block to both halves. **That is the identical mistake the
original text below warned about**, two paragraphs under a sentence reading "No current count
is quoted here". Run `wc -l`. Both halves are under the 500 HARD ceiling, which is what the residual was about.
**An earlier version of this sentence also claimed both were under the ~300 soft target. They
are not** - the DDL half measures over it, so this residual is still OPEN and the split
narrowed it rather than closing it. That is the THIRD stale claim this one entry has made
about its own subject, which is itself the argument for the rule: run
`wc -l backend/src/db/ensureProjectLifecycleSchema.ts`, because nothing asserts a line count
and prose cannot be trusted to carry one.

The original text follows.

### SIZE RESIDUAL (original text): `ensureProjectLifecycleSchema.ts` is approaching the 500-line ceiling

Against CLAUDE.md’s 500-line hard ceiling and a ~300 soft target. P4-T6 added two tables and
their documentation to a file that was already 326 lines. **No current count is quoted here:**
this entry said 426 and a later commit in the same phase edited the file, so run `wc -l`. A
verifier caught the stale number, and a line count in prose is the most reliable way to be
wrong in this repo. **The next change to it should split
it before adding** — the natural seam is the three assertion lists plus `assertProjectLifecycle
Schema` on one side and the DDL statement list on the other, which is how the P4-T1 folder was
eventually arranged. Recorded now rather than discovered at the ceiling, because P4-T1 proved
that discovering it mid-task costs a split under time pressure.

### ACCUMULATING RISK: the generation folder holds THREE unwired validators

Flagged by the P4-T5 verifier, then **under-counted by me and corrected by the P4-T7 verifier**.
Three validators have no production call site — only their own tests: `validateTaskSurfaces`
(P4-T1), `validateWorkspaceStates` (P4-T5) and `validateControlSpec` (P4-T2). Alongside
`controlSurfaceExists`, `unboundProposedSurfaces`, `consolidationAssessment` and `selectDesign`,
that is most of what the phase built.
Their sibling `validateProcess` *is* composed into `blueprintGeneration.ts`, so the pattern is
available and simply not applied yet.

Neither task claimed otherwise and wiring was in neither packet, so this is not a defect in
either. But this repo has a named failure mode for exactly this shape — a producer with no
consumer — and it is accumulating. **Owner: whoever composes the generation
pipeline.** The question to ask then is not "are these functions correct" but "is anything
calling them", which is the question nobody asked about `controlSurfaceExists`.
