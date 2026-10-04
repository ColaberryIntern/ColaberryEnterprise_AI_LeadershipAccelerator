# Workspace and control design

The Phase 4 durable artifact named in the specification's §8. It records how a project's business
tasks reach human surfaces, and how the controls over those surfaces are specified.

**Status:** the workspace half (P4-T1) is implemented. The control half (P4-T2) follows and will be
appended to this file.

---

## 1. Every business task resolves to exactly one of two states

LC-08 requires that *every task maps to a justified human surface/action or explicit background
operation*. The implementation is `backend/src/services/lifecycle/generation/workspaceMapping.ts`.

```
TaskSurfaceBinding =
  | { taskId, kind: 'workspace', ref: WorkspaceRef }
  | { taskId, kind: 'headless', reason: HeadlessReason }
```

**Two states, no third, and no default.** A default would be the whole problem: whichever way it
fell, a task nobody had considered would acquire a position nobody chose. An unbound task is
refused (`SURFACE_UNMAPPED`), and so is a task bound twice (`SURFACE_DUPLICATE_BINDING`).

`START` and `END` need no binding. They mark where a process begins and ends rather than work
anyone performs, and requiring surfaces for them would make every blueprint carry two meaningless
bindings — noise that trains a reviewer to skim the list.

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

It also carries `deepLink` and `preservesNavigationState`, since §4.5 requires deep links and
preserved navigation state. A workspace with no addressable link is refused
(`SURFACE_DEEP_LINK_MISSING`).

Roles are checked against `project.roles`, both for `intendedRoles` and for each `permissionViews`
entry (`SURFACE_ROLE_UNKNOWN`), and cited requirement ids against `project.requirements`. A surface
may not name a role or a requirement the project never declared.

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

So this is the one rule an all-headless project cannot satisfy by declaring each reason correctly.
A test asserts that an all-headless project **fails**, and a paired control asserts that a single
human surface clears it — otherwise a rule that refused everything would pass the first test too.

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
| `SURFACE_UNMAPPED` | A business task with neither binding |
| `SURFACE_TASK_UNKNOWN` | A binding, or a cited requirement, the project does not declare |
| `SURFACE_DUPLICATE_BINDING` | One task bound twice |
| `NEW_SCREEN_UNJUSTIFIED` | A workspace with no `whyNotExisting` |
| `HEADLESS_REASON_UNDECLARED` | A headless reason outside the closed set |
| `SURFACE_ROLE_UNKNOWN` | A role not in `project.roles` |
| `SURFACE_AUDIENCE_CONFLATED` | One workspace serving both audiences |
| `SURFACE_DEEP_LINK_MISSING` | A workspace with no addressable link |
| `SURFACE_NO_HUMAN_PATH` | **Project level:** no task reaches any human surface |

A test asserts the set of codes the module can actually emit equals this declared list in both
directions, so the table cannot drift and no code can be decorative.
