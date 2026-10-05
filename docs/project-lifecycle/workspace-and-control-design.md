# Workspace and control design

The Phase 4 durable artifact named in the specification's §8. It records how a project's business
tasks reach human surfaces, and how the controls over those surfaces are specified.

**Status:** the workspace half (P4-T1) is implemented. The control half (P4-T2) follows and will be
appended to this file.

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

The guarantee is now scoped to what it can carry: **every value `JSON.parse` can produce is
refused rather than thrown on**, across all three exported functions. A hostile object with a
throwing accessor is explicitly out of scope and named as such in the code, because `JSON.parse`
cannot produce one and a blanket try/catch would hide real defects rather than classify them.

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
