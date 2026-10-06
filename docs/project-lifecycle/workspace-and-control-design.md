# Workspace and control design

The Phase 4 durable artifact named in the specification's §8. It records how a project's business
tasks reach human surfaces, and how the controls over those surfaces are specified.

**Status:** the workspace half (P4-T1) and the control half (P4-T2) are both implemented.

---

## 1. Every business task resolves to exactly one of two states

LC-08 requires that *every task maps to a justified human surface/action or explicit
background operation*. The implementation is two modules under
`backend/src/services/lifecycle/generation/`: **`workspaceMapping.ts`** holds the
orchestration and the consolidation report, and **`workspaceBindingChecks.ts`** holds the
types, the refusal codes and the shape, content, audience and acceptance checks. The split
happened because the single module reached 602 lines against CLAUDE.md’s 500-line hard
ceiling; `workspaceMapping` re-exports the public surface, so it remains the import point.

```
TaskSurfaceBinding =
  | { taskId, kind: 'workspace', ref: WorkspaceRef }
  | { taskId, kind: 'headless', reason: HeadlessReason }
```

**Two states, no third, and no default** — and that is now true at runtime, not only in
the type. A default would be the whole problem: whichever way it fell, a task nobody had
considered would acquire a position nobody chose. An unbound task is refused
(`SURFACE_UNMAPPED`), a task bound twice is refused (`SURFACE_DUPLICATE_BINDING`), and a
**third `kind` arriving as JSON is refused** (`SURFACE_BINDING_MALFORMED`) rather than
throwing.

**Corrected after verification.** The first version of this sentence was false in the one
way that mattered: a third `kind` was an unhandled `TypeError`, not a refusal, as were a
missing `ref` and every non-string or non-array field. The module header claimed model
JSON bypasses the union and then defended a single field against it.

**And corrected again after the second verification, because the first correction was itself
over-broad.** Attempt 2 refused every malformed *field* and still threw on a malformed
*container* or *element*: a `null` entry in the bindings array, and a `null` inside
`permissionViews`. Ten live throws. Proving an array is an array while never typing its
members is the same mistake one level up.

**And corrected a third time, because the second correction was also over-broad.** This
sentence previously claimed every `JSON.parse`-producible value was refused across all three
exports. A verifier falsified it again: the project guard proved
`tasks`/`roles`/`requirements` were arrays and never typed their **elements**, so
`.map((t) => t.id)` on a `[null]` threw — and `${t.id}` was interpolated raw into a
refusal message three lines after `label()` was introduced for exactly that.

**The claim is now a SCOPED LIST, and the list is the claim.** Every `JSON.parse`-producible
value is refused rather than thrown on in: the `bindings` argument and every position nested
under it; `proposedSurfaces`; the `project` argument, its three arrays, and their elements’
`id`, `title` and `kind`; and `headlessAcceptance`.

**Each position in the tables carries a PER-POSITION positive control**, and so do the two
whole-argument positions this list names (`proposedSurfaces`, `headlessAcceptance`), which had
none until a verifier found them claimed without one — the suite fails and names any
position it cannot reach past its guard. The aggregate version of that control passed while
**5 of 27 positions were dead**, an average hiding five zero rows, which is why it is now
per position. Reach itself comes from a valid exemplar seeded at each position, not from the
derived leaf literals: three positions need the value to *be* a valid structure. Both facts
are mutation-proven.

The position table is **hand-written**, and that is a stated residual limit rather than a
claim of derivation. The keyspace and leaf value space are derived from the module sources;
the positions are not. A position missing from the table is a gap the control cannot see.

Anything outside the list is unproven, and an unproven position is how this sentence became
false five times.

Out of scope by construction: a throwing accessor and `Object.create(null)`, neither of
which `JSON.parse` can produce. A blanket try/catch would hide real defects rather than
classify them.

`START` and `END` need no binding. They mark where a process begins and ends rather than
work anyone performs, and requiring surfaces for them would make every blueprint carry
two meaningless bindings — noise that trains a reviewer to skim the list. A binding
placed on one anyway is **refused** (`SURFACE_BINDING_ON_FLOW_MARKER`).

**Corrected after verification.** Attempt 1 silently *skipped* flow-marker bindings, so a
ref on `START` bypassed every rule in this document while still being counted by
`consolidationAssessment` — a surface that existed for the count and for nothing else.

## 2. `headless` is a closed enum, never a sentence

```
scheduled_ingestion | system_to_system | derived_computation
notification_delivery | retention_or_cleanup
```

There is no `other` and no free-text field. The reason is a measured one rather than a preference.

Phase 6 will read this field to decide whether a release reaches user-visible output — the rule
that closes the walking-skeleton failure. This repository already contains a cautionary precedent
for the alternative: `planGate`'s `r0_no_trust_spine` tries to detect meaning with a regex over
story text, and it was measured to miss `Approval`, `Notification`, `Generation`, `Deliver` and
`Upload` while flagging correct plans. A prose justification would make the downstream rule
evadable for the cost of one sentence. An enumerated reason is checkable; a paragraph is not.

Adding a member is a deliberate act visible in a diff. That is the point.

## 3. A proposed screen must justify its own existence

`WorkspaceRef` carries the fields §4.5 requires: `primaryJob`, `intendedRoles`, `records`,
`decisions`, `requirementIds`, `taskIds`, and `whyNotExisting` — *why an existing workspace cannot
serve this*. An empty `whyNotExisting` is refused (`NEW_SCREEN_UNJUSTIFIED`), because a screen that
cannot answer that question is the renamed dashboard the phase exit condition rules out.

It also carries `deepLink` and `preservesNavigationState`, since §4.5 requires deep
links and preserved navigation state. A workspace with no addressable link is refused
(`SURFACE_DEEP_LINK_MISSING`), and one declaring `preservesNavigationState: false` is
refused too (`SURFACE_NAVIGATION_STATE_NOT_PRESERVED`) — declaring the field false
declares non-compliance rather than satisfying it.

**Corrected after verification.** `preservesNavigationState` was declared and then read
by nothing: `false` passed clean, and no later task was scheduled to check it. A declared
field with no enforcement is the dummy switch this phase exists to refuse, and it meant
the "preserve navigation state" requirement was half-closed while looking closed.

§4.5 also requires a primary human job, intended roles and relevant records of every
proposed screen. Those are enforced non-empty (`SURFACE_FIELD_EMPTY`), as are
`workspaceId` and `workspaceTitle`. **`decisions` is deliberately exempt**: a read-only
view supports none, and a test pins that exemption so the rule cannot quietly grow to
forbid read-only surfaces. A ref whose own `taskIds` omit the task it is bound to is
refused (`SURFACE_TASKIDS_INCONSISTENT`).

Roles are checked against `project.roles`, both for `intendedRoles` and for each
`permissionViews` entry (`SURFACE_ROLE_UNKNOWN`). Cited requirement ids are checked
against `project.requirements` under **their own code**,
`SURFACE_REQUIREMENT_UNKNOWN`.

**Corrected after verification, and this one was load-bearing.** Attempt 1 folded the
requirement check into `SURFACE_TASK_UNKNOWN`. Because two unrelated branches shared one
code, the code-reachability test could not see that the requirement branch had **zero**
coverage — deleting the check left the suite green. Splitting the code is what makes
the branch visible, and it is a worked example of why overloading a refusal code weakens
the test that is supposed to protect it.

## 4. Customer and internal surfaces stay distinct

`audience` is `'internal' | 'customer'`. One workspace id declared as both is refused
(`SURFACE_AUDIENCE_CONFLATED`), because that is a collapsed trust boundary — an internal view shows
records a customer must not see.

**What the rule is not:** it does not stop a project having both kinds of surface. A customer
portal and an internal review queue are two workspaces with two audiences, and that passes. A test
pins this, because a rule that forbade it would reject every product with an admin view.

## 5. The project-level rule, which is the walking-skeleton lesson made enforceable

`SURFACE_NO_HUMAN_PATH` refuses a blueprint in which **no** business task reaches any human
surface.

This is deliberately separate from every per-task rule above, because the per-task rules cannot
catch it. A student finished **20 of 20 stories, platform-verified**, and could not run her own
product: twelve services unreachable, nothing chaining them. Each of those tasks could have been
legitimately headless. Every per-task check would have passed. The blueprint still described a
system nobody could operate.

**It is a DISCLOSURE requirement, not a prohibition — corrected after verification.**
Refusing an all-headless blueprint outright was wrong, for the reason this phase argues
everywhere else: a legitimately headless pipeline could then proceed only by declaring a
workspace nobody would use, which is the "invent a screen to clear the gate" incentive.

So an all-headless project **passes when it declares a rationale and a named acceptor
recorded by the owner**, and is refused otherwise. That is the shape of
`checkTargetDisclosure` in `effortMeasures`, which lets a below-target AI share proceed on
a visible rationale plus owner acceptance. An undisclosed absence of any human surface is
how a design decision quietly becomes a defect nobody admits.

### And the acceptance may not be self-issued

**Added after the second verification, which found the disclosure cost one string
literal.** `HeadlessAcceptance` carries an `origin`, and `model_turn` is refused as
`SURFACE_ACCEPTANCE_SELF_SUPPLIED`.

The asymmetry that makes this necessary, because the two cases look identical:
`checkTargetDisclosure` waives a **target** that sits on top of an independent
**measurement** — the AI share is computed from effort rows, and no acceptance string
moves it, so the waiver buys a pass on the threshold rather than on the number.
`SURFACE_NO_HUMAN_PATH` has **no measurement underneath**: the acceptance *is* the whole
gate, and what it waives is the only rule here that catches the walking-skeleton failure.

So this follows `blueprintGeneration.DeclarationOrigin` instead, whose
`DECLARATION_SELF_SUPPLIED` refuses a capability declaration from the same model turn as
the roster, on the stated grounds that "a generator emitting both can declare whatever it
invents". A disclosure a generator can self-issue is not a disclosure.

**A noted inconsistency, recorded rather than resolved by assertion.** A blueprint with no
human surface at all is now waivable (by an owner-recorded acceptance), while a blueprint
with an honest human surface that cannot preserve navigation state is **unwaivable**. The
weaker violation has a disclosure path and the stronger one does not. That is arguably
backwards; it is left as-is because adding a second waiver hatch is a design decision for
P4-T5, which owns the UX-quality rules, rather than something to settle inside a refusal
table.

Tests pin all four directions: undisclosed all-headless **fails**; declared all-headless
**passes**; acceptance with a blank rationale or no named acceptor **still fails**, so the
declaration is load-bearing; and a single human surface clears the rule with no
acceptance at all. A further test proves a workspace on `START` does **not** buy a human
path, so the flow-marker exclusion is not itself the evasion route.

**Grounding, stated precisely because the first version overclaimed it.** LC-08 and
§4.5’s first clause both *permit* an all-headless blueprint. The requirement comes
from §4.5’s journey clause — "Required prototype journeys: normal success,
approval, rejection/revision, uncertain/failed AI result, and human takeover" — which a
project with no human surface cannot satisfy.

### What a workspace binding does NOT prove

Stated here so a later phase does not over-read it: a binding proves a human interacts
**somewhere**. It does not prove the task produces user-visible output chained to the rest of the
workflow. An ingestion task bound to an "Imports" admin screen satisfies every rule in this
document.

That is strictly stronger than the measured-unworkable regex and strictly weaker than "proves a
workflow". The stronger guarantee needs Phase 6's release-level view, and it is recorded as open in
`carried-forward-obligations.md` rather than implied here.

## 6. Workspace count is recorded, never targeted

`consolidationAssessment()` reports the distinct workspace count, the headless count, and the
per-workspace rationale. It does **not** cap anything.

`reference-fixtures.md` already ruled that workspace count is "recorded, not targeted. There is no
required page count", and §5 forbids allocating a release to a page merely to satisfy a count. A
cap would silently drop a surface, which is the source-truncation failure the specification forbids
elsewhere. A test asserts that six workspaces are reported rather than refused.

## 7. Upstream proposed surfaces are reported, never auto-bound

`unboundProposedSurfaces()` names any `proposed_surfaces` entry from the project understanding that
no declared workspace covers.

It returns a list; it never produces a validation error, and it never binds anything automatically.
`proposed_surfaces` is free-text model output — `projectUnderstandingExtractor` asks for "screen or
area the system would need" — so matching one to a workspace is a judgement a human makes. Binding
on a string match would manufacture exactly the traceability this phase exists to establish
honestly, and treating an unmatched proposal as an error would push a generator to invent a screen
to clear the gate. A surface named in an interview and absent from the design is a question for a
reviewer.

---

## Refusal codes

| Code | Refuses |
|---|---|
| `SURFACE_BINDING_MALFORMED` | A binding a model could emit but no rule could read: a third `kind`, an absent `ref`, a non-string or non-array field, an out-of-union `audience`, a non-boolean flag |
| `SURFACE_UNMAPPED` | A business task with neither binding |
| `SURFACE_TASK_UNKNOWN` | A binding naming a task the project does not declare |
| `SURFACE_REQUIREMENT_UNKNOWN` | A cited requirement the project does not declare |
| `SURFACE_DUPLICATE_BINDING` | One task bound twice |
| `SURFACE_BINDING_ON_FLOW_MARKER` | A surface or reason on `START`/`END` |
| `NEW_SCREEN_UNJUSTIFIED` | A workspace with no `whyNotExisting` |
| `SURFACE_FIELD_EMPTY` | An empty `workspaceId`, `workspaceTitle`, `action`, `primaryJob`, `intendedRoles` or `records` |
| `HEADLESS_REASON_UNDECLARED` | A headless reason outside the closed set |
| `SURFACE_ROLE_UNKNOWN` | A role not in `project.roles` |
| `SURFACE_AUDIENCE_CONFLATED` | One workspace serving both audiences |
| `SURFACE_DEEP_LINK_MISSING` | A workspace with no addressable link |
| `SURFACE_NAVIGATION_STATE_NOT_PRESERVED` | `preservesNavigationState: false` |
| `SURFACE_TASKIDS_INCONSISTENT` | A ref whose `taskIds` omit the task it is bound to |
| `SURFACE_NO_HUMAN_PATH` | **Project level:** no task reaches a human surface, with no rationale and no named acceptor |
| `SURFACE_ACCEPTANCE_SELF_SUPPLIED` | **Project level:** the no-human-path acceptance came from the same model turn as the blueprint |
| `SURFACE_ARGUMENT_NOT_ARRAY` | The `bindings` argument is not an array — refused rather than reported as an empty, compliant mapping |
| `SURFACE_PROJECT_UNUSABLE` | The project carries no usable tasks, roles or requirements array |
A test asserts the set of codes the module can actually emit equals this declared list in both
directions, so the table cannot drift and no code can be decorative.

---

# Part 2 — human controls as typed policies (P4-T2)

Implementation: `backend/src/services/lifecycle/generation/controlSpecification.ts`.

§4.5: *"Manager controls specify policy key, typed value, allowed range, permission, approver
requirement, preview/diff, version, effective time, and enforcement point. … Only show
functioning controls; unimplemented capabilities are labeled unavailable and block claims that
they work."*

## 8. The `unavailable` state is the point, not a nicety

**The dummy switch §4.5 forbids is already shipped in this repository.** `AiAgent` persists
`max_runs_per_hour`, `max_writes_per_execution` and `max_proposals_per_run`;
`agentPermissionService` has a check function for each; **all three have zero call sites**.
Outside their own definitions the only reference to **those three check functions** is a
doc comment. The three **columns** are read in several places — the agent resource monitor,
the Reese agent-detail service and the frontend — which is the asymmetry that matters: the
numbers are displayed, and the functions that would enforce them are called by nobody.
Meanwhile
`AgentTrustControlArchitecture.tsx:24` renders them to a human as
`` `Not set — ${fallback} applies` `` — a sentence asserting an enforcement that does not exist.
Two independent verifiers confirmed the zero.

So this module does not render a control. It makes **"we have a policy"** and **"the policy is
enforced"** two separate, separately checkable claims.

`ControlEnforcement` is a two-state union with no default:

```
{ status: 'enforced', enforcedBy: ControlEnforcementKind, callSite: string }
{ status: 'unavailable', why: UnavailableReason }
```

A policy claiming `enforced` with a blank `callSite` is refused
(`CONTROL_ENFORCEMENT_UNNAMED`). A control whose enforcement nobody has established is
**unavailable**, never assumed. `renderControlAvailability()` splits what a human may be shown
from what must be labelled unavailable, and a caller that renders `showable` while ignoring
`unavailable` is building the production UI this module exists to argue against.

## 9. The precedent is cited, and the enum deliberately not extended

`delivery/execution/executionPolicy.ts:47-48` already states the principle about a different
layer: *"`enforcedBy` is recorded because 'we have a policy' and 'the policy is enforced' are
different claims, and Gate 0 found three of these previously had no enforcer at all."*

That union is **not** extended. Its four members are sandbox-layer concepts
(`runner_isolation | no_provider | branch_protection | policy_gate`); a pause/resume, a rate
limit or a schedule has no honest member among them, so extending it would force a wrong
classification or widen a live policy module. The principle carries over; the enum does not.

## 10. Both vocabularies are DERIVED from what this repo measurably does

Every member names a state a survey of this codebase found. An invented taxonomy quietly lacks
the member that describes the real situation, and the author then picks the nearest flattering
one.

| member | the measured state it names |
|---|---|
| `system_setting_checked` | the kill switch and `llm_safe_mode`, read at named sites |
| `persisted_column_checked` | `ai_agents.enabled`/`.status`, checked in `workforceAgentRuntime` |
| `route_permission` | `requireAdmin` and friends on the control routes |
| `in_memory_only` | the agent-storm rate limit: real, unpersisted, not human-settable |
| `hardcoded_constant` | the Reese daily send caps: enforced, but unchangeable without a deploy |
| `no_enforcement_site` | the three execution limits: stored, checked by nothing |
| `prompt_text_only` | charter authority lists and `ManagerDirective` — persuasion, not a gate |
| `verdict_discarded` | `ticketAgentDispatcher` computes an authorization verdict and drops it |
| `shadow_mode_only` | `abac_enforcement` defaults to shadow, so the gate allows anyway |
| `not_implemented` | spend caps and agent takeover: no mechanism at all |
| `no_human_surface` | the kill-switch route exists and no UI calls it |

## 11. The spec is NOT an authorization source, and the TYPE says so

`requiredPermission` and `approverRequirement` are **specification data** — what the design says
should gate a change. `ApproverRequirement.separationEnforcedInCode` is typed as the literal
**`false`**, so the type refuses to let a spec claim requester-is-not-approver is enforced.

That is not pedantry: §4.6 requires "the proposer cannot fabricate the approver", and
`approval-and-change-policy.md:36` states it as policy — but no route in this repo implements it,
and `MANAGER_AUTHORIZATION_MAP.md` records that everything collapses to a single `requireAdmin`
bit. Making the negative claim **structural** means a future author who wants to assert otherwise
must change the type, which appears in a diff. A spec arriving as JSON with the field set true is
refused.

An approval that is `required` with no named approver role is refused
(`CONTROL_APPROVER_UNNAMED`) — an approval with no nameable human behind it is what the approval
ladders exist to refuse. An approver role the project does not declare is refused too.

## 12. `controlSurfaceExists()` — a specification of nothing is not a control surface

True only when at least one control is genuinely enforced with a named site. Tested in **both**
directions, plus the case that matters: an `enforced` claim with no call site returns **false**,
because the claim alone is not a surface. P4-T3 is **shaped to consume it** — the design brief populates
`controls` only when a `controlSurfaceExists` boolean is true, so an all-unavailable
specification produces an **open fact** rather than an empty array that reads like "no
controls needed". **Nothing calls this function in production.** See §15.

## Refusal codes

| Code | Refuses |
|---|---|
| `CONTROL_SPEC_MALFORMED` | Any `JSON.parse`-producible shape the content rules could not read, including a third enforcement status and a `separationEnforcedInCode` that is not `false` |
| `CONTROL_KEY_DUPLICATE` | One policy key declared twice — the later would silently win |
| `CONTROL_ENFORCEMENT_UNNAMED` | `enforced` with no named call site |
| `CONTROL_VALUE_TYPE_MISMATCH` | A value that does not match its declared `valueType` |
| `CONTROL_VALUE_OUT_OF_RANGE` | A value outside its declared range or set |
| `CONTROL_RANGE_SHAPE_MISMATCH` | A min/max range on an enum, or a `oneOf` on a number |
| `CONTROL_PERMISSION_MISSING` | No required permission, so anyone reaching the surface can change it |
| `CONTROL_APPROVER_UNNAMED` | Approval required with no approver role named |
| `CONTROL_APPROVER_ROLE_UNKNOWN` | An approver role the project does not declare |
| `CONTROL_VERSION_INVALID` | A version that is not a positive integer |
| `CONTROL_EFFECTIVE_AT_INVALID` | An unparseable effective time |
| `CONTROL_PREVIEW_ABSENT` | `previewDiff: false` — declaring it false declares non-compliance |

Two tests, because one sentence used to claim both and only one was true: one asserts
`CONTROL_CODES` equals the **emittable** set in both directions, and one parses the
`CONTROL_`-prefixed rows **out of this file** and asserts they equal `CONTROL_CODES`. The
second was missing until the P4-T2 verifier pointed out that nothing checked this table
against the code at all.

## What P4-T2 does not do

It enforces nothing. It is a specification checker, and the gap between a specified control and
an enforced one is the thing it exists to keep visible. Phase 6 owns persisting a control
specification; nothing consumes this module until P4-T3.

---

# Part 3 — the design brief carries the facts (P4-T3)

Implementation: `backend/src/services/delivery/designBrief.ts`, additive only.

## 13. Additive, because the brief is on a live prospect-facing path

`buildDesignBrief` has exactly one production caller (`appPrototypeService.ts:131`), which
feeds the flotation preview a prospect sees. Every new field is **optional** and the new
`facts` argument is **optional**, so that caller is unchanged and the website generator — which
reads only named fields and never serialises the brief — cannot see any of this. The acceptance
test is that `designBrief.test.ts` and `websiteDesignGenerator.test.ts` keep passing untouched,
and they do.

New fields: `task_surfaces`, `allocation_summary`, `controls`, `workspace_count`, `open_facts`.

## 14. A missing fact is OPENED, never substituted

This extends the discipline `not_discussed` already applies to the understanding. A fact nobody
established is named in `open_facts`; it does not become a default.

The case that makes the rule concrete: **an empty allocation is treated as ABSENT, not as
"nobody does this work".** An empty array reads as a decision, and it is not one. Same for an
empty task-surface mapping.

**And absence of the whole `facts` argument is not a finding.** A caller that supplies no facts
is the prospect-facing path, which knows nothing of the lifecycle; opening four facts there
would put lifecycle noise into a sales artifact. A caller that supplies *some* facts is making
a claim, and whatever is missing from it is opened. A test pins both halves — this was caught by
that test rather than by reading.

## 15. The brief is SHAPED to consume `controlSurfaceExists()`, and nothing calls it yet

**This section overstated its case and an independent verifier caught it.** It read "this is
where `controlSurfaceExists()` becomes load-bearing… until now nothing consumed it". What is
true: the brief populates `controls` **only** when a `controlSurfaceExists` **boolean** is
true AND there is at least one showable control, and otherwise opens a fact — a claim that is
genuinely gated and tested in both directions. What is false: that the predicate now has a
consumer. `grep -rn controlSurfaceExists backend/src frontend/src` returns its own definition
and its own test, and nothing supplies the field either, because **no design-stage
orchestrator exists yet**. The phase that builds one closes the wire; the register holds it
with an owner.

Why the decoupling is deliberate rather than an oversight: `delivery/` importing from
`lifecycle/generation/` would invert the only direction this repo uses (measured 2026-10-06:
four import sites run that way and zero run this way), so `showableControls` mirrors the shape instead, with
`enforcedBy` widened to `string`. A hand-mirrored type is exactly how two definitions drift
apart, so the mirror is pinned on the lifecycle side: a composition test passes
`renderControlAvailability().showable` and `controlSurfaceExists()` straight into
`buildDesignBrief` and asserts **at runtime** that both branches come out right.

**No gate in this repo type-checks that mirror, and an earlier version of this paragraph
claimed one did.** `backend/tsconfig.json` excludes `**/*.test.ts` and `**/__tests__/**`, so
the composition test is not in the typecheck program at all:

```
node ../node_modules/typescript/bin/tsc -p tsconfig.json --listFilesOnly | wc -l        # 5762
node ../node_modules/typescript/bin/tsc -p tsconfig.json --listFilesOnly | grep -c __tests__   # 0
```

And `ts-jest` runs with `isolatedModules`, which strips types without checking them — the
same trap this phase recorded two sections earlier and then walked into. So the mirror is
guarded by a **runtime** assertion and by nothing else. Closing the compile-time half means
putting the composition in a module the gate compiles, which is work for the phase that
builds the design-stage orchestrator; the register holds it.

The predicate is **passed, never inferred from the array length**, and that distinction is the
point:

| situation | `controls` | `open_facts` says |
|---|---|---|
| enforced controls exist | populated | — |
| spec exists, every control unavailable | **absent** | "nothing a human can actually operate yet" |
| no spec at all | **absent** | "what a human can adjust is unknown" |

An empty array would assert "no controls are needed". The middle row is the whole argument of
Part 2, and flattening it into `controls: []` would undo it.

---

# Part 4 — interactive alternatives and the selected design (P4-T4)

Implementation: `backend/src/services/lifecycle/generation/designAlternatives.ts` and
`designSelection.ts`.

## 16. Why these are two NEW modules rather than an edit to `deliveryDesignLoop.ts`

The phase-4 plan named `delivery/deliveryDesignLoop.ts` as the file to edit. It is not,
for two reasons that were measured rather than argued:

1. **That file exported 20 public symbols when measured on 2026-10-06**, above CLAUDE.md’s hard ceiling of 12.
   The rule for an over-ceiling file is that the next change MUST split it before adding
   new code, so piling this task’s vocabulary on top would have widened a breach.
2. **The dependency direction runs `lifecycle/generation` → `delivery`** and never the
   reverse: measured 2026-10-06, four import sites that way and zero the other way. This code consumes `TaskSurfaceBinding` from P4-T1, so
   putting it under `delivery/` would have inverted an established direction to satisfy a
   path in a plan.

`MIN_VARIANTS` and `MAX_VARIANTS` are **imported** from `deliveryDesignLoop`, so there is
still exactly one definition of the variant bounds. The `too_few_variants` /
`too_many_variants` warnings stay where they are and keep their severity: duplicating them
here would create a second source for one rule, and the two layers compose correctly as it
is — the existing warning notes a thin option set, and §18 below makes it blocking unless a
human accepted it.

## 17. The alternatives are a derivation, which is what lets the comparator be structural

`generateDesignAlternatives()` makes **no model call**. It projects the process graph and
P4-T1’s bindings onto the three patterns §4.5 names — queue/detail, case workspace, and
exception-first — and nothing else. A fourth pattern would be this module’s opinion about UX
presented to a human as a thing the system supports.

Two consequences, and they are the reason for the choice:

- **"Do these two options actually differ?" becomes a structural question.** The fingerprint
  is built from TASK ids and navigation depth, and deliberately not from workspace ids, slot
  ids, titles or actions. Task ids arrive from the process graph; everything else is minted
  by the design step and can be renamed at will. A fingerprint that read a workspace id would
  call "rename the dashboard" a different design, which is the exact failure §4.5’s
  "genuinely different" wording exists to prevent.
- **The phase has no unbounded loop.** There is nothing to retry until the options look
  varied enough.

The comparator is exported and tested directly against hand-written structures. A comparator
only ever checked against structures the same module generated proves the two agree, not that
either is right.

## 18. One structure is an answer; ZERO is the refusal

A short linear process can honestly admit one shape. Refusing there would strand the
manual-only case, and padding to two would ship the "one proposal presented as a choice"
that `deliveryDesignLoop` already warns about, with the warning suppressed.

So a sole structure is **recorded**, with a rationale and a named human who accepted it —
the shape this repo already uses for a below-target AI share. `ALTERNATIVES_NO_STRUCTURE` is
reserved for zero structures, which is not a thin design but a process graph that produced
nothing a human can stand in front of.

**The plan predicted Fixture D was itself the degenerate case. Measured, it is not.** With
both of its business tasks on surfaces, D yields two structurally distinct options: a queue
of contracts routing into a review detail, and one case workspace holding both actions. D
becomes the one-structure case when its intake is read as an **ingestion step** rather than a
screen job — so degeneracy is a property of the **bindings**, not of the fixture. Both
readings are tested, and the one-structure reading reaches `design_ready` once the acceptance
is recorded, which was the fixture’s stated purpose all along.

## 19. The five journeys are declared, and one may be waived by a named human

§4.5 requires normal success, approval, rejection/revision, uncertain/failed AI result, and
human takeover. Each is either **declared** as steps over the selected structure, or declared
**not applicable** with a reason, a named acceptor, and an `origin`.

The second branch is not a loophole, it is the manual-only case: a project with no software
actor has no uncertain AI result to show and nothing for a human to take over from, and a
rule demanding those journeys anyway would punish the honest answer — the same mistake as
demanding an agent roster from Fixture D. What it must not be is **silent**, which is why the
waiver carries the same rationale/acceptor/origin triple as every other waiver in this phase,
and why `origin: 'model_turn'` is refused.

A step must name a task **and** the workspace that actually serves it in the chosen
structure. Checking only the task id would accept a journey walking through a screen the
design does not have, which is how a demo script drifts from the design it claims to show.

## 20. The selection record, and why the ref carries two things

`selectedDesignRef` is `<alternativeId>@vc<revision>`. §4.5 requires the approval record to
reference the selected variant **and** the visual contract revision; a ref carrying only the
variant would let the contract move underneath an approval without the ref changing. A
missing revision is refused rather than defaulted to 1.

`selectDesign()` returns `selected: null` whenever any issue is raised, so a caller cannot
read a ref out of a refused selection. That matters downstream: this ref is what clears
`design_variant_not_selected` in `lifecyclePrerequisites`, a blocking gap, and a ref produced
alongside a refusal would clear it on the strength of a record that was rejected.

## 21. The honest limit, and two findings about the corpus

**A journey here is a declared path, not a rendered interaction.** Nothing in this module
clicks anything, and there is no surface to click until Phase 5. §4.5 itself says a
screenshot or matching vocabulary does not establish usability; a declared journey does not
either. What it does is make the claim checkable and name the gap, rather than leaving "can
be demonstrated" as an untested sentence in a brief.

Two things found while building this, both recorded in the carried-forward register:

- **`ProcessRecord.exceptions` is read by nothing in this repo and carries no doc comment.**
  An earlier draft of `exceptionTaskIds()` treated it as a list of task ids. It should not:
  every sibling field on that record holds prose, so the invention would fail silently —
  free-text exception descriptions never equal a task id, `exception_first` would simply
  never fire, and the cause would be invisible. `is_rework` on a typed edge is the only
  source this module reads.
- **No fixture in the reference corpus has a rework edge.** All eight transitions across
  `referenceFixtures.ts` and `manualOnly.ts` carry `is_rework: false`, so `exception_first`
  is unreachable by the corpus as it stands and this suite supplies the input itself. Fixture
  B’s own documented coverage says its appeals path should be "a real exception/rework edge
  in the transition graph", and the code fixture does not have one.
