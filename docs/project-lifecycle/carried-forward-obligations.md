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

## Open question for the owner: who approves a STAFF-INITIATED student build?

Raised by a peer session from the entry-point matrix, and recorded here rather than left to be
discovered when Phase 6 wires those routes. **Not decided.** It has been put to Ali as a product
question; this is the engineering shape of it so the answer can be applied without re-deriving
the problem.

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
