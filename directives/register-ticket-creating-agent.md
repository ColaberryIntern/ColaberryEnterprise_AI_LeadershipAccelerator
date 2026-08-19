# Register a ticket-creating agent against the Agent Ticket Standard

## Purpose

Every AI agent in this platform that opens tickets on the admin ticket board
(`/admin/tickets`) creates a real, ongoing operational liability if it isn't held
to the same bar: tickets that pile up forever with no way to close, tickets
attributed to nobody a human can recognize, duplicate tickets from a dedup key
that silently breaks, or a "resolution" mechanism that closes tickets on elapsed
time instead of a real fact. Between 2026-08-15 and 2026-08-17, all 6 of this
platform's registered ticket-creating agents (`cory-engine`, `CoryBrain`,
`workforce_intelligence_engine`, `InboxCaseEngine`, `Reese`, `bpos_orchestrator`)
were audited and fixed, one at a time, and each fix found a real bug in exactly
this shape. This directive codifies what those fixes actually proved is
achievable into a checklist so the next agent that creates tickets - and the next
person auditing an existing one - doesn't have to re-discover the same 6 bugs one
at a time. Every item below cites the real, merged PR(s) that proved it, not an
aspirational ideal.

This directive governs **registration and audit**, not initial capability
build-out. Pair it with the `build-platform-agent` skill (identity/persona/
transparency-page scaffolding) when standing up a brand-new agent; use this
directive on its own when auditing or hardening an agent that already exists.

## Inputs

- The agent's real `agent_name` string as it appears in `tickets.created_by_id`
  (verify with `SELECT DISTINCT created_by_id FROM tickets WHERE created_by_type
  IN ('agent','cory') GROUP BY created_by_id ORDER BY count(*) DESC` against
  production, not an assumption).
- `backend/src/services/agentRegistrySeed.ts` - the `AGENT_REGISTRY` array,
  the single source of truth for every registered `AiAgent` row.
- `backend/src/models/AiAgent.ts` - the contract every registry entry must
  satisfy (`tools_granted: string[] | null`, `trigger_type: 'cron' | 'on_demand'
  | 'event_driven'`, `schedule: string`, `enabled: boolean`).
- `backend/src/services/agentBlueprint/ticketCreatorIdentitySeed.ts` and
  `backend/src/services/actorIdentity/resolveActorDisplayName.ts` - the identity
  registration and resolution machinery.
- `backend/src/services/ticketService.ts` (`createTicket()`'s dedup logic,
  `VALID_TRANSITIONS` state machine) and
  `backend/src/services/company/ticketOrchestrator.ts` (the non-state-machine
  `updateTicketStatus()` every resolver built this week uses instead, because
  `backlog -> done` and `todo -> done` are not valid transitions in
  `ticketService.ts`'s state machine).
- `backend/src/scripts/validateAgentTicketStandard.ts` - the mechanical check for
  the checkable subset of this standard (see Verification below).

## Steps

### 1. Give ticket creation a stable, non-volatile dedup key

Every ticket-creating code path must call `ticketService.ts`'s `createTicket()`
with an `entity_type`/`entity_id`/`type` combination that is **stable across
repeated cycles for the same underlying finding** - never a value that
regenerates every run (a fresh UUID, a per-cycle decision id, a timestamp). If
the finding has no natural entity (no campaign id, no agent id, nothing
per-instance), key on the **problem type**, not a per-run identifier.

**Proof this is the real, live bug class, not theory:** PR #1554 found
`autonomousEngine.ts`'s `resolveCoryEngineTicketDedupKey()` fell back to
`{ entity_type: 'decision', entity_id: decisionId }` for problems with no
stable entity (`conversion_drop`, `error_spike`) - and `decisionId` is a fresh
`IntelligenceDecision.decision_id` **every cycle**, so `createTicket()`'s own
dedup query (`Ticket.findOne({ entity_type, entity_id, type, status: notIn(done,
cancelled) })`) could never match a key that always differs, and cory-engine
filed a brand-new ticket on every cycle for the same recurring finding. Confirmed
live: 1,731 tickets titled exactly `[Review] update_campaign_config`, of which 14
were open simultaneously, created roughly hourly. The fix changed the fallback to
`{ entity_type: 'problem_type', entity_id: '<problem.type>:<action>' }` - stable
across cycles because it's derived from the problem's own type, not a per-run id.
PR #1530 independently proves the same principle for ledger events: the new
`afterCreate` hook's idempotency key is `ticket-created:<ticket.id>` - keyed on
the row's own primary key, deliberately colliding with `createTicket()`'s own
emitted key so double-firing collapses to one ledger row, not two. PR #1495
proves the same principle applies to **title-based** dedup, not just
entity-based: `CoryBrain`'s `createStrategicInitiative()` deduped on exact title
match, so a title carrying a volatile embedded number (`"CampaignQAAgent is slow
(41.2s avg)"` vs `(38.9s avg)`) never matched its own earlier occurrence -
`normalizeInitiativeDedupTitle()` strips the volatile number before comparing
(282 of 350 stuck rows were exactly this bug).

**Verify:** grep the agent's ticket-creation call site for every distinct
`entity_type`/`entity_id` (or title) shape it can produce, and for each one, ask
"does this value change if the exact same underlying condition is detected
again next cycle?" If yes, it's the #1554 bug.

### 2. Register a real display identity - never a generic type-level fallback

The agent's `created_by_id` string must resolve, via
`resolveActorDisplayName.ts`, to a real, distinguishing display name - not a raw
UUID, not a bare passthrough of an unregistered string, and never a collapsed
generic label shared by multiple different agents.

**Proof:** PR #1431 ("Agent Registration Stage 1") and PR #1452 ("Agent Alias &
Identity Fix") built the underlying mechanism: a full `AdminUser`/`Enrollment`/
`CommunityMember`/`AiAgent` identity quad for each of the 5 non-conversational
ticket-creators (`ticketCreatorIdentitySeed.ts`'s `TICKET_CREATOR_IDENTITIES`,
`getTicketCreatorAdminUserId()`), and `resolveActorDisplayName.ts`'s
`resolveViaAiAgentName()` - a real, verified `AiAgent.agent_name` lookup
(exact match, then a `regexp_replace`-normalized fallback) before any raw
passthrough, so a real registered identity is actually looked up instead of
accidentally working because the raw string already looked human-readable. PR
#1559 found the display-identity machinery above was correct but **unused** on
the ticket board itself: `getTicketsForBoard()` returned raw `Ticket` rows with
zero enrichment, and the board's own card rendering used a naive
`source.startsWith('cory')` heuristic that collapsed both `cory-engine`
(`source='cory_autonomous_cycle'`) and `CoryBrain` (`source='cory:evolution'`)
into the literal string `"Cory"`, while `bpos_orchestrator`
(`source='bpos_engine'`) matched nothing and showed no badge at all. The fix
wired the existing, correct `resolveActorDisplayNamesBatch()` into
`getTicketsForBoard()`/`getTicketById()` - after the fix, three genuinely
distinct names render (verified live: `"Cory Engine — Autonomous Operations"`,
`"Cory Brain — Strategic Initiatives"`, `"BPOS Orchestrator — Universal Ticket
Layer"`), never a shared collapse label. PR #1491 confirms the identity call
(`getTicketCreatorAdminUserId('CoryBrain')`) is preserved correctly through
unrelated ticket-lifecycle changes, not just present at registration time.

**Verify:** a real `AiAgent` row exists for the agent's exact `agent_name`
string used as `created_by_id`; a linked `AdminUser` (via `agent_id`) exists with
a real `display_name` distinct from generic labels (`"Cory"`, `"Agent"`,
`"System"`, `"Human"`); `resolveActorDisplayName(actorType, agentName)` returns
that real name, not a passthrough or a collapse.

### 3. Evidence-gated resolution per distinct condition-type - **hard ban on any time-based fallback closure**

For every distinct kind of condition the agent opens a ticket for, there must be
a resolution mechanism that closes the ticket **only** by re-deriving the exact
same live signal the ticket was opened under and confirming it has genuinely
cleared. **A ticket-age or elapsed-wall-clock-time check ("close after N days
untouched") is explicitly, permanently banned as a closure condition in this
codebase.** This is not a style preference - it was ripped out of
`ticketManagementAgent.ts`'s old 7-day auto-close during the original ProofDesk
build for being dishonest, and this week's own history proves the temptation to
reintroduce it under a different name keeps recurring.

**Proof, one per condition-type shape actually built this week:**
- **Multi-detector re-derivation** (PR #1531, cory-engine): 3 independent
  detectors (`detectAgentFailures`/`detectConversionDrops`/`detectErrorSpikes`),
  each re-run live via the SAME exported functions the original detection code
  calls (`ProblemDiscoveryAgent.ts` exports made pure and reused, not
  duplicated). `error_spike` is classified for visibility but **never
  auto-closed** (`ERROR_SPIKE_RELIABLE_CHECK = false as const`) because its own
  detector's SQL references a column (`system_processes.updated_at`) that
  doesn't exist in production and its try/catch always returns `[]` - a
  condition-type with no reliable live re-check must be left open, never
  force-closed with a fake heuristic. `coryEngineTicketResolutionRules.ts`'s own
  `__tests__` file greps the rules file's own source (`Date.now()`, `getTime()`,
  `daysSince`, `ageInDays`, `created_at\s*[<>]`, `createdAt\s*[<>]`) and asserts
  zero matches - a permanent regression guard, not a one-time promise.
- **Reconciliation against an already-fixed terminal state** (PR #1537,
  CoryBrain): re-reads the *current* `strategic_initiatives.status` for a
  ticket's linked initiative (parent via `ticket_id`, subtask via
  `metadata.initiative_id`) and syncs - 4 outcomes, only 2 ever write.
- **Structural ordering, never wall-clock** (PR #1545, Reese): a
  `student_support` ticket closes only when a **strictly newer sibling ticket**
  exists for the same room - comparing two *persisted* `created_at` values to
  each other to determine order is allowed and used
  (`a.createdAt.getTime() > b.createdAt.getTime()`); comparing either to
  `Date.now()`/`new Date()` to decide closure is exactly the forbidden pattern
  and does not appear anywhere in the file. This is the precedent for **why the
  ban is "no wall-clock comparison," not "no `getTime()` anywhere"** - a blind
  ban on `.getTime()` would falsely flag this legitimate, structural code.
- **Live source-of-truth re-check, general sweep** (PR #1541, InboxCaseEngine):
  reads `ops_bc_todos.status` (an existing read-mirror) to disposition items,
  then re-runs the real, unmodified `evaluateClosureGuard()`/`closeCase()`
  across every non-terminal case - not just touched ones - which is what closed
  a case that had qualified for a while but nothing had ever invoked the
  existing closure authority on.
- **Two-signal check with an explicitly rejected candidate signal** (PR #1547,
  bpos_orchestrator): closes only on `Capability.user_status === 'verified'`
  (human-asserted) or the capability row being hard-deleted. A third candidate
  signal (`requirements_maps.verification_status`) was checked and explicitly
  **rejected** as internally self-contradictory, and the PR documents this
  rejection rather than silently using it - the strongest evidence in this
  week's work that evidence-gating was applied with real rigor, not just
  claimed.
- **Explicit exclusion for a genuinely ambiguous case** (PR #1513, CoryBrain
  stale initiatives): one agent name/title-shape combination is explicitly
  excluded from auto-resolution by name (not by the volatile percentage in its
  title, which would silently stop excluding once the number changed) because
  the condition is a judgment call, not a mechanically re-checkable fact - not
  every condition-type needs to resolve to "close" or "leave open forever," a
  documented "explicitly excluded, always human territory" outcome is valid too.

**Verify:** for each distinct condition-type the agent's tickets represent, name
the exact live signal its resolver re-checks and confirm it is re-derivable
(not a snapshot from ticket-creation time). Run
`backend/src/scripts/validateAgentTicketStandard.ts`'s static scan against the
resolver's rules file - it greps (comments stripped) for `Date.now()`, bare
`new Date()`, `daysSince`, `ageInDays`, `created_at\s*[<>]`, `createdAt\s*[<>]`,
the exact token set proven this week to be the recurring anti-pattern shape.

### 4. Populate `AiAgent.tools_granted` accurately

`tools_granted` (a `string[]` JSONB column) must list the agent's **real**
capabilities - re-verified against what its actual code does, not a boilerplate
placeholder.

**Proof:** every one of the 6 creator identities and all 6 resolver rows
registered this week carries a `tools_granted` array whose entries are
behavior-specific - PR #1531 (cory-engine resolver), #1537 (CoryBrain resolver:
`['query_strategic_initiative_status',
'close_corybrain_tickets_on_initiative_terminal_state']`), and #1547
(bpos_orchestrator resolver) each ship a 2-3 item list matched to that
resolver's real behavior, not a shared boilerplate. E.g. `bpos_orchestrator`:
`['create_bpos_tickets', 'transition_bpos_ticket_status',
'attach_build_outputs']` - the third entry called out in
`agentRegistrySeed.ts`'s own comment as "a capability unique to this agent among
the 5," confirmed by re-reading `ticketOrchestrator.ts`'s real exports, not
assumed). PR #1531's own comment trail ("Agent Quality Cleanup, Item 5 -
re-verified against autonomousEngine.ts's real runAutonomousCycle() 8-step
pipeline") documents the re-verification happening against actual code, not
copy-paste from a template.

**Verify:** every string in `tools_granted` maps to a real function/capability
you can point to in the agent's own source; nothing is aspirational
("will eventually be able to..."); nothing is a leftover from a copy-pasted
sibling entry.

### 5. Ticket detail tabs show real evidence or an honest N/A/missing state

The Story/Visual Proof/Work Graph/Decisions/Technical/References tabs on a
ticket's detail view must never show identical, generic dead text regardless of
ticket type. Each tab shows real evidence when it exists, `"Not applicable for
this ticket type"` when evidence was never plausible for this combination of
type/source/creator, or `"No evidence captured yet"` when it's plausible but
genuinely absent - a real 3-state decision, not a 2-state (empty/full) guess.

**Proof:** PR #1530 found ~90% of 16,070 production tickets had zero
work-ledger coverage because at least 3 creation paths (`ticketOrchestrator.ts`'s
tracked-ticket family, plus a direct-`Ticket.create()` bypass in
`projectRoutes.ts`) skipped `ticketService.ts`'s `createTicket()`, the only place
emitting a ledger event. Fixed with a Sequelize `afterCreate` hook wired directly
on the `Ticket` model - one choke point no future service wrapper can bypass
(the one disclosed residual gap is raw SQL `INSERT INTO tickets`, grep-audited
and found to have zero occurrences at fix time). The evidence-expectation
classifier (`evidenceExpectationService.ts`) is a real per-`TicketType` decision
table (15 entries), not per-ticket guessing - e.g. `bug` tickets expect visual
proof, `strategic_initiative` tickets expect work-graph and decisions evidence,
`task` tickets expect neither. All 3 evidence tabs render the identical 3-state
pattern from this one shared classification.

**Verify:** for the agent's ticket type(s), confirm an entry exists in
`evidenceExpectationService.ts`'s `TYPE_DEFAULTS` that honestly reflects what
evidence that ticket type can ever produce; spot-check a real ticket of this
type in the admin UI and confirm no tab shows generic filler text when the
honest answer is "not applicable."

### 6. Register the recurring resolver as a real `AiAgent` cron row - or log why not

If the agent needs a recurring resolver (step 3), that resolver must be a real,
registered `AiAgent` row with an accurate `trigger_type: 'cron'` and a real
`schedule`, wired into the actual scheduler - not a bare function nobody ever
calls.

**Proof, and the two real wiring shapes in this codebase:** PRs #1531, #1537,
#1541, #1547 each add an `AGENT_REGISTRY` entry (`trigger_type: 'cron'`, e.g.
`'25 */6 * * *'`) AND a matching entry in `aiOpsScheduler.ts`'s
`SCHEDULE_REGISTRY` calling into `aiOrchestrator.ts`'s runner - the tick fires on
schedule per the scheduler entry, while the separate `AiAgent.enabled` flag
(seeded `false`, flipped to `true` only after a reviewed historical bulk-clear
succeeds - "findOrCreate() only honors `enabled` at first-row creation," so this
is a real, deliberate hold-until-reviewed gate, not an accident) is a second,
independent safety layer. PR #1545 (Reese) is the one resolver wired
**differently**: its `AGENT_REGISTRY` entry exists for identity/tooling
transparency, but the actual cron tick is a direct `cron.schedule(...)` call in
`schedulerService.ts`, not a `SCHEDULE_REGISTRY` entry - #1559's own
documentation flags this as "the one resolver with no governance-override path
at all." Both shapes are real and correct; **verifying "is there a real cron"
means checking whichever wiring actually applies to this agent**, not assuming
the more common `aiOpsScheduler.ts` shape universally.

**Verify:** `AiAgent.findOne({ where: { agent_name: '<ResolverName>' }})` returns
a row with `trigger_type: 'cron'` and a non-empty `schedule`; confirm the
schedule is actually referenced in either `aiOpsScheduler.ts`'s
`SCHEDULE_REGISTRY` or a direct `cron.schedule()` call in `schedulerService.ts`
(one of the two must be true). If no recurring resolver exists, the
`AiAgent` entry's `description` field must state why (e.g. "reactive only,
closure handled by an existing mechanism X" - see Reese Phase 1's own
`description`, which explicitly states it's 100% reactive).

### 7. Prove idempotency - dry-run + undo-log before any bulk/historical write

Any resolution or cleanup mechanism must be safe to run twice with no duplicate
side effects. Any bulk/historical backlog clear must ship as a `--plan`
(dry-run, zero writes) / `--apply` (writes, reviewed undo log) / `--revert`
(tested rollback) CLI, never a single irreversible batch script.

**Proof this is caught by real re-runs, not just claimed:** the #1495/#1499 pair
is the reference example - #1495 shipped the `--plan/--apply/--revert` CLI
(`consolidateDuplicateStrategicInitiatives.ts`) with a dry-run report + undo log
before any real write, and PR #1499 found that
after `consolidateDuplicateStrategicInitiatives.ts`'s `--apply` correctly
cancelled 282 duplicate rows, an immediate second `--apply` - run specifically to
prove idempotency per this repo's Idempotency & Replayability rule - **hard-aborted
with a false "Drift detected" error**, because the drift check's candidate fetch
filtered `status='proposed'` only, and once the duplicates were cancelled they no
longer matched that filter. Fixed by giving the apply-drift-check its own fetch
(`status IN ('proposed','cancelled')`), separate from the plan-time fetch. PR
#1502's production log proves the fix: re-ran `--apply` against production a
second time, result `0 cancelled, 282 skipped, 0 errors` - genuine idempotency,
not a test double. PR #1542 found the same class of bug one layer over:
`InboxCaseEngine`'s `closeEligibleCases()` re-closed all 162 already-closed cases
on a second `--apply` instead of reporting 0, because the underlying
`closeCase()` doesn't itself no-op on an already-`RESOLVED` case (it re-stamps
`closed_at` and posts a duplicate ticket comment every time the guard still
passes) - fixed with a live-state short-circuit (`if (caseRow?.state ===
'RESOLVED') { /* no-op */ }`) at the one shared function both the cron and the
CLI call through. PR #1513 proves the same bar applies across **two tables
atomically** (an initiative row and its ticket, committed as one transaction,
since a partial commit is forbidden per this repo's rules).

**Verify:** run the resolver's `--apply` CLI twice against the same undo log (or
the same live state) and confirm the second run reports 0 new writes, not a
duplicate action. Confirm a `lib/*Artifacts.ts` (or equivalent) undo-log module
exists for any bulk/historical clear.

### 8. Independent production verification with fresh evidence before "done"

An agent's ticket-creation/resolution work is not done until someone other than
the implementer re-derives the evidence live against production - fresh queries,
fresh JWTs, fresh spot-checks - not a restatement of the implementer's own
claims.

**Proof - the reference example:** PR #1502's independent
`loop-production-verifier` pass created its own throwaway
same-condition-different-number pair via the real deployed
`createStrategicInitiative()` (`"[VERIFIER-TEST] AgentZ is slow (111.1s avg)"`
then `(222.2s avg)`) and confirmed the second call returned the identical row
rather than creating a new one - the dedup fix proven working live, not
asserted, then cleanly resolved via the real `rejectInitiative()` function
afterward (not deleted - left identifiable by a `[VERIFIER-TEST]` prefix). PR
#1559/#1560's production verification is the second reference example: a
separate `loop-production-verifier` pass, with its own freshly-minted JWT, its
own DB queries, ticket IDs never reused from the first session's evidence, and
its own download+grep of the live frontend bundle, independently re-derived all
6 resolvers' live cron schedules and hand-computed next-fire times against the
box's own UTC clock.

**Verify:** an independent pass (different session/agent than the one that
shipped the change) re-runs real queries/commands against production and reports
matching results - self-reported claims from the implementing session are not
sufficient.

### 9. PROGRESS.md entry with concrete verification evidence

Per this repo's root `CLAUDE.md` (Logging, Reporting & Progress Tracking - hard
gate), no code change is "done" without a session-ID-tagged `PROGRESS.md` entry
carrying real verification evidence (a test name, a deploy URL, a query result -
never "looks right" or "should work").

**Verify:** the entry exists, is tagged with the session's real ID, and every
`[x]` claim has a concrete artifact attached on the same line.

### 10. Every registered ticket-creating agent's `reports_to` chain MUST resolve to a real human — ticket creation is structurally blocked without one

Every agent that creates tickets must resolve, directly or through one or
more AI Leadership agents, to a real human it is accountable to: a real
`org_members` row (the Business Account "Employee" roster feature) on the
"Colaberry" org. This is not a recommendation — as of 2026-08-18 (session
CC-20260818-x4nk), `ticketService.createTicket()` rejects ticket creation
outright (throws `TicketCreatorNotReportableError`, never a silent no-op or
a warning) for any non-`human` creator whose `reports_to` chain doesn't
resolve to a real human. "Even if there are no human approvals" (Ali, live)
— an agent that never needs sign-off from its human still needs a real
human it reports to, for accountability.

**AI Leadership / AI Staff hierarchy (2026-08-19):** an agent's `reports_to`
now resolves to EITHER a human directly (**AI Leadership**) OR another agent
(**AI Staff**, reporting through a leadership agent, which itself reports to
a human). `AiAgent.reports_to_type` (`'human' | 'agent'`) +
`reports_to_id` (an `org_members.id` or another `ai_agents.id`, depending on
type) supersede the flat `reports_to_org_member_id` column from 2026-08-18
(left in place, unread, for historical value only).
`ticketCreatorReportsToResolver.ts`'s `resolveReportsToHuman()` walks the
chain (bounded by a `MAX_CHAIN_DEPTH` cycle guard, currently 5 — not a
hardcoded "exactly 2 hops" assumption, so a future 3rd tier needs no code
change) until it lands on a real human. Of the 23 currently-registered
agents, 2 are AI Leadership (`CoryBrain` → Ali, `workforce_intelligence_engine`
→ Kes) and the other 21 are AI Staff, reporting through one of those two.

**Proof:** the 2026-08-18 PR added `reports_to_org_member_id` (nullable
UUID) to `AiAgent` and gated `createTicket()` on it — flat, one hop only.
The 2026-08-19 change (this step's current form) added the polymorphic
`reports_to_type`/`reports_to_id` pair, rewrote `enforceReportsToGate()` to
walk the chain via `resolveReportsToHuman()` instead of reading the flat
field directly, re-resolved every currently-open ticket's assignee against
the new chain (`resolveTicketReportsToChain.ts`'s `--plan`/`--apply`/
`--revert`, same dry-run-then-undo-log-then-apply discipline as every other
bulk operation this week — a real, deliberate consequence of moving 20
agents from a direct human report to an AI Leadership report is that many
of their open tickets' real human assignee CHANGES, e.g. a
`StudentSuccessArchitect` ticket moves from Taiwo to Ali, since it now
resolves through `CoryBrain`), and made
`agentBlueprint/agentIdentitySeed.ts`'s `AgentIdentityConfig` require
**exactly one** of `reportsToOrgMemberId` (AI Leadership) or
`reportsToAgentName` (AI Staff, resolved to the target's real `ai_agents.id`
at seed time) — enforced at runtime in `seedAgentIdentity()`, not just
documented. Also registered a 23rd agent found in the same pass:
`AgentBehaviorMonitorAgent` (a real, previously-unregistered security
watchdog that was stamping `created_by_id` as its own raw `AiAgent.id` UUID
instead of its `agent_name` — a genuine bug, fixed in the same change,
alongside giving it a real identity and an AI Staff report to
`workforce_intelligence_engine`).

**Known structural gap, disclosed not fixed here:** `ticketService.createTicket()`
is the gate, but at least two call paths bypass it entirely via a direct
`Ticket.create()` (`services/company/ticketOrchestrator.ts`'s
`createTrackedTicket()` family and `routes/projectRoutes.ts`'s fallback) —
the same disclosed gap Step 5's `afterCreate` hook (ledger events) already
documents for a different purpose. A ticket created through either bypass is
NOT rejected by this new gate. Closing that gap (e.g. a model-level
`beforeCreate` hook enforcing the same check) is a real, separate, logged
follow-up proposal — out of scope for this run per CLAUDE.md's Scope Lock,
not silently expanded into it.

**Verify:** `reports_to_type`/`reports_to_id` are set on the agent's real
`AiAgent` row and the chain resolves to a real `org_members` row on
"Colaberry" — `validateAgentTicketStandard.ts`'s reports-to check covers
this mechanically (see Verification below), reporting the full chain path
taken (e.g. `AdmissionsConversionArchitect (agent) -> CoryBrain (agent) ->
[human]`) so a broken link's exact break point is visible, not just a
pass/fail. Attempt creating a ticket as the agent locally/in dev with
`reports_to_type`/`reports_to_id` temporarily null and confirm
`createTicket()` throws `TicketCreatorNotReportableError` before any row is
written.

## Outputs

- A real `AiAgent` row (creator identity) and, if applicable, a real `AiAgent`
  resolver row, both in `backend/src/services/agentRegistrySeed.ts`.
- A linked `AdminUser`/`Enrollment`/`CommunityMember` identity (via
  `agentBlueprint/agentIdentitySeed.ts`, mirroring `ticketCreatorIdentitySeed.ts`
  or `reeseIdentitySeed.ts`).
- Pure classification rules file + I/O resolver file + `--plan/--apply/--revert`
  CLI + `lib/*Artifacts.ts` undo-log module, if the agent has a recurring
  resolver (the pattern every resolver built this week except
  `workforceTicketAutoResolver.ts`, which predates the split, follows).
- An `evidenceExpectationService.ts` entry for the agent's ticket type(s).
- A `validateAgentTicketStandard.ts` run's output (see Verification) attached to
  the registration/audit's `PROGRESS.md` entry.

## Verification

Run the mechanical check for the checkable subset of this standard:

```
docker exec accelerator-backend node dist/scripts/validateAgentTicketStandard.js <agentName>
```

(or, pre-deploy, `ts-node backend/src/scripts/validateAgentTicketStandard.ts
<agentName>` against a local/dev database). This is a **read-only diagnostic**,
not a merge gate - it reports PASS/FAIL/INFO per check and never blocks anything
on its own (wiring it into CI as a hard gate is a deliberately separate,
escalation-tier decision, not something this directive authorizes). It checks:
`AiAgent` registration, `tools_granted` population, display-identity
registration, the `reports_to` chain (direct or through an AI Leadership
agent) resolving to a real `org_members` row on "Colaberry" (Step 10),
recurring-resolver registration
(or an explicit logged reason for none), and a static scan of the resolver's
rules file for the specific time-based-closure anti-pattern tokens proven
this week. It does **not** check
idempotency live (structural presence of an undo-log module only, never
re-executes a resolver) or production-verification history (a one-time,
per-change process requirement, not perpetually re-checkable state) - those stay
manual per steps 7-8 above.

## Edge cases / failure modes

- **A condition-type has no reliable live re-check available** (e.g.
  `error_spike` - PR #1531): classify it for visibility, never force-close it
  with a fallback heuristic. Document exactly why in the classifier's own
  comments (which underlying detector/query is unreliable and why).
- **A condition is a genuine judgment call, not a mechanically re-checkable
  fact** (e.g. PR #1513's excluded agent): an explicit "always human territory,
  never auto-resolved" outcome is valid - don't force every condition-type into
  either "auto-close" or "silently ignore forever."
- **An agent's ticket-closing mechanism was removed out from under it** (e.g.
  PR #1547 - the sole frontend caller of `execution-ticket`'s
  `action:'complete'` was deleted 2026-07-18, leaving `bpos_execution` tickets
  with no way to ever close): a repo-wide grep for the old closure path's caller
  is part of the audit, not an assumption that "it must still be called from
  somewhere."
- **Two different real cron-wiring shapes coexist** (`aiOpsScheduler.ts`'s
  `SCHEDULE_REGISTRY` vs. a direct `schedulerService.ts` `cron.schedule()` call,
  per step 6): don't assume the more common shape and report a false FAIL.
- **A disclosed, intentional scope gap is not a bug**: PR #1559 explicitly
  scoped `ticketAutoCheckService.ts`'s `OWNERSHIP_RULES` to "5 of 6 registered
  agents," leaving the 9 open `reese_autonomous_outreach` tickets (covered by a
  real, separate, older cron - `ReeseOutreachFollowUps`, registered directly in
  `schedulerService.ts`) outside its coverage. `validateAgentTicketStandard.ts`
  surfaces this as an `INFO`/documented-gap line for `Reese`, not a FAIL - future
  audits should recognize a documented gap by name rather than silently treating
  it as either a clean pass or a fresh defect.

## Safety constraints

- This directive's validation script is **read-only** - it must never call
  `.create(`, `.update(`, `.destroy(`, or `.save(` on any model. Any check that
  would require a write (e.g. truly proving idempotency by re-running a
  resolver) stays a manual, human-supervised step per the resolver's own
  `--plan/--apply/--revert` CLI, never something this directive's automated
  check does on its own.
- Never wire this standard's validator into CI/GitHub Actions as a hard merge
  gate without going through this repo's Escalation Protocol first (CI/CD
  pipeline changes are explicitly named as production-infrastructure-adjacent
  decisions in root `CLAUDE.md`'s Autonomy Model) - it ships and stays
  manually/skill-invoked until that separate decision is made.
- Flipping a resolver's `AiAgent.enabled` from `false` to `true` in production is
  a real, deliberate, documented action (a single `UPDATE`, no redeploy needed)
  taken only after its historical backlog has been reviewed and cleared via the
  reviewed `--plan`/`--apply` sequence - never flipped as a side effect of
  registering the agent.
