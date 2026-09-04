---
name: build-platform-agent
description: Build or preview ONE real staff-account AI agent end to end — identity (AdminUser/Enrollment/CommunityMember/AiAgent), a persona-based system prompt, ProofDesk ticket-linkage, the Agent Detail transparency page, AND the AI Workforce Management trust layer (reports-to hierarchy, permission tier, autonomy level, GOALS™ scoring inputs, the manager-conversation prompt) — following the proven Reese pattern. From a name + one-line intent it derives the identity config, drafts the system prompt, checks whether this is genuinely new capability or an existing agent's missing governance row, and previews everything with zero real writes; a real commit is a separate, explicit, human-approved step. Invoke when Ali says "build a platform agent", "set up the {X} agent", "give me a new AI staff identity", "who does {agent} report to", "assign {agent} a permission tier / autonomy level", "why is {agent}'s GOALS score generic", or wants to spin up the next Reese-style agent, or wire an existing one into the org/trust system, fast and safely.
---

# build-platform-agent — the reusable platform-agent builder

A **platform agent** = a real staff-account AI identity in this system: a real
`AiAgent` registry row, a real `AdminUser`/`Enrollment`/`CommunityMember` identity
triple, a system prompt, and (once wired) real ProofDesk ticket-linkage and a real
Agent Detail transparency page at `/admin/agents/:id`. **Reese** is the first real
agent built this way (Phase 1: identity/DM/ticket-linkage/transparency — PR #1251,
live; Phase 2: signal-driven autonomous outreach — PR #1319, live). This skill takes
as little as a **name + one line of intent** and produces a complete, previewed agent
identity — reusing the exact shared modules Reese's own Phase 1 code now calls.

## THE non-negotiable boundary (read first)

**This skill's default mode is PREVIEW.** Running it produces a draft config, a draft
system prompt, and a dry-run identity-seed report — zero real `AiAgent` rows, zero real
staff accounts, zero real messages sent. Committing a real identity (calling
`seedAgentIdentity()` for real, adding a real `AGENT_REGISTRY` entry) is a SEPARATE,
explicit step that requires the producer to say so outright — never inferred from "the
preview looked good." Any capability beyond reactive identity/reply (DM-initiation,
autonomous outreach, any outbound communication) additionally requires Ali's sign-off
before that agent's `AiAgent.enabled` flag is ever set `true` in production — see the
Governance checklist below and `docs/PROOFDESK_STATUS.md`'s matching section.

## Step 0 — is this really a new agent?

Before drafting anything, check: does the requested capability already belong to an
existing agent? A real case from this repo (2026-09-04): Ali asked to review the
"Reese family" of agents for sprawl. Three separately-registered `AiAgent` rows
(`ReeseAutonomousOutreachSweep`, `ReeseOutreachFollowUps`,
`ReeseStudentSupportSupersessionResolver`) looked like 3 extra agents but turned out
to be the SAME Reese identity, persona, and largely the same code — just 3
independently-pausable cron entry points for 3 distinct behaviors, each with no
`system_prompt`/`tools_granted`/`reports_to` of its own. The real gap that turn
uncovered was different: `ReesePresenceHeartbeat`, a live cron that had been calling
`instrumentCronJob('ReesePresenceHeartbeat', ...)` every minute since Phase 1 with
**no matching `AiAgent` row at all** — silently running untracked, no kill switch, no
monitoring. The fix wasn't a new agent identity; it was one missing registry row.

Ask, in order:
1. **Is this a new persona/identity** (something that should talk to students or
   managers, have its own voice, own tickets)? → proceed with this skill's full
   identity build below.
2. **Is this a new scheduled/on-demand BEHAVIOR of an agent that already has an
   identity** (like Reese's 3 legitimate cron kill-switches)? → it may only need its
   own `AGENT_REGISTRY` row (for the pause switch + observability
   `instrumentCronJob()` already gives any registered name — see
   `references/trust-and-hierarchy.md`'s "Registering a behavior, not an identity"),
   reusing the parent agent's existing `system_prompt`/`AdminUser`/persona. Do not
   build a second full identity for it.
3. **Is a cron/job already calling `instrumentCronJob('<name>', ...)` with no
   matching registry row?** Grep `agentRegistrySeed.ts` for the exact name before
   assuming it needs anything built at all — it may just need registering.

Only proceed past this point once the answer is genuinely "new identity."

## What to say to run it

Give me the two required lines; everything else has a sane default I derive.

1. **name** — e.g. "CurriculumQA" (becomes `agentName`/`displayName`; `email` =
   `slugify(name)@colaberry.com` = the idempotency key downstream).
2. **intent** — one line: what the agent does and why it exists.

Optionally override any Tier-2/3 field below.

## The KEY runtime facts (author against these — do not fight them)

- **Identity is 4 real rows, not a special case.** `AdminUser` (role `ai_staff`,
  `is_ai_operated: true`, `agent_id` linked back to the `AiAgent` row) is the SAME
  model real human staff use. `Enrollment` (required FK target for
  `CommunityMember`) and `CommunityMember` (presence row) exist so the agent shows up
  in the People panel and can hold a DM room, exactly like a real staff member.
- **The `AiAgent` registry row must exist FIRST.** `seedAgentIdentity()`
  (`backend/src/services/agentBlueprint/agentIdentitySeed.ts`) throws if it doesn't —
  by design, a fail-loud guard against an orphaned identity. The registry entry is
  added to `AGENT_REGISTRY` in `backend/src/services/agentRegistrySeed.ts` (currently
  ~150+ entries; Reese's own `seedReeseIdentity()` call is wired in at line ~2305,
  right after the `AGENT_REGISTRY` findOrCreate loop in `seedAgentRegistry()`). This
  is a real code change (one array entry + one seed-call line), not a config toggle —
  flag it as the first concrete implementation step once a real commit is approved.
- **The transparency page is ALREADY generic — confirmed, not assumed.**
  `backend/src/services/reese/agentDetailService.ts`'s `getAgentDetail(agentId)`,
  its route (`GET /api/admin/agents/:id`, mounted in
  `backend/src/routes/admin/agentDetailRoutes.ts` via `adminRoutes.ts`), and the
  frontend consumer (`frontend/src/pages/admin/AgentDetailPage.tsx` +
  `frontend/src/services/agentDetailApi.ts`) contain no agent-name string literals in
  logic — only a header comment. It degrades gracefully (empty, not broken) for any
  `AiAgent` row that doesn't yet have the full identity linkage. **No code change is
  needed here for a new agent** — it lights up automatically once identity/prompt/
  tickets exist for the new agent's `AiAgent.id`. What it needs from YOUR new agent to
  show real data (not empty fields): `system_prompt`/`tools_granted`/`persona_version`
  populated on the `AiAgent` row (identity-seed does this), a linked `AdminUser` (via
  `agent_id`), and tickets using `assigned_to_type: 'ai_staff'` +
  `assigned_to_id` = the agent's real `AdminUser.id` (the ticket-linkage module does
  this automatically).
- **Reactive vs. proactive is a real fork, not a toggle.** Identity + a reply loop
  (agent responds when messaged) is the reactive baseline every agent gets. Proactive/
  autonomous behavior (the agent initiates contact on its own) is a SEPARATE, much
  more agent-specific build — see "If this agent needs to be proactive" below. Do not
  build proactive capability just because it's possible; most agents built from this
  skill should stay reactive-only.
- **Identity and trust/hierarchy are two separate layers — don't conflate them.**
  Everything above (AdminUser/Enrollment/CommunityMember/system_prompt) makes the
  agent EXIST and be able to talk. It says nothing about who it reports to, what
  it's allowed to do, or how trustworthy it is — that's a second, mostly-independent
  layer: `reports_to_type`/`reports_to_id` (org chart), a permission tier
  (`AGENT_PERMISSIONS` in `agentPermissionService.ts`), an autonomy level (inert
  until explicitly activated — see below), and GOALS™ evidence quality. A brand-new
  agent with perfect identity but no reports-to/permission-tier wiring is real and
  functional but organizationally invisible and defaults to the most restrictive
  tier. See `references/trust-and-hierarchy.md` for the full mechanics; step E.5
  below is where this actually gets set.
- **`system_prompt` feeds TWO different conversation paths, not one.** The manager-
  conversation prompt (`agentManagerConversationPrompt.ts`, the Admin > Agents > Talk
  tab) reads `AiAgent.system_prompt` DIRECTLY — set it on the registry entry and
  managers can talk to this agent immediately, no extra file needed. The
  student/learner-facing prompt (`agentSystemPrompt.ts`, what Derivation rule 2 below
  builds) is DIFFERENT — it takes a `personaBlock` as a plain function argument, never
  reads the DB column at all. Setting only `system_prompt` gets you a working manager
  conversation but NOT a working student conversation, and vice versa — most agents
  need both, built separately.
- **`tools_granted` has no enum — reuse the existing tool chest before inventing a
  new tool name.** `backend/src/services/reese/agentToolCapabilities.ts`'s
  `TOOL_CAPABILITIES` is the real, shared registry every agent's transparency page
  reads/produces view is derived from (35 real tool strings documented as of
  2026-09-04). Check there first: if an existing tool's real reads/produces already
  match what your new agent's capability actually does, grant that same tool name —
  don't invent `my_agent_does_the_thing_v2`. Only add a new `TOOL_CAPABILITIES` entry
  when the capability is genuinely new, grounded in the real implementing code, same
  as every existing entry. A tool granted but never added there isn't silently
  dropped — it surfaces honestly as `undocumentedTools` on the transparency page —
  but that's a signal to go document it, not a shippable end state.

## Parameters

### Tier 1 — required
`name`, `intent`.

### Tier 2 — shape (override the derivation)
`email` (default `slugify(name)@colaberry.com`), `role` (`AdminUser.role`, default
`'ai_staff'`), `communityRole` (`CommunityMember.role` — one of `'student' | 'mentor' |
'staff'`, default `'mentor'`), `agentType` (`AiAgent.agent_type` — a free-form string;
Reese used `'ai_staff_mentor'`, added as a new literal at the end of the existing
`AiAgentType` union in `backend/src/models/AiAgent.ts` since it's a closed type, not a
DB enum — a new agent with a genuinely new role shape adds its own literal the same
way), `category` (`AiAgent.category` — Reese used `'student_success'`), `enrollmentDefaults`
(`company`/`payment_status`/`payment_method`/`payment_mode`/`enrollment_type`/
`portal_enabled` — Reese's own honest-placeholder values: `'Colaberry'` /
`'paid'`/`'invoice'`/`'live'`/`'standard'`/`false`, safe defaults for any
non-transactional staff row), `proactive` (boolean, default `false` — see below),
`reportsTo` (exactly one of: a real `org_members.id` this agent reports to directly
as AI Leadership, or the exact `agent_name` of an already-registered agent it reports
through as AI Staff — never both, never neither; see step E.5), `department`
(`AiAgent.department` — a real column, distinct from `category`; leave unset rather
than guessing if none of the ~existing values genuinely fit), `permissionTier` (one
of `read_only`/`suggest_only`/`write_with_audit`/`communication` — see step E.5;
silently accepting the `DEFAULT_PERMISSION` fallback, `suggest_only`, without
deciding is a real gap this repo has already hit, not a safe default to assume).

### Tier 3 — fine (leave blank to auto-generate)
`personaBlock` (the full voice/persona text — see Derivation rule 2), `closingLine`
(the conversational-framing sentence appended after persona + learner context; default
mirrors Reese's DM framing — override if the new agent's surface isn't a DM thread),
`toolsGranted` (`AiAgent.tools_granted` JSONB array — empty `[]` by default; only
populate once the agent actually has tool access to declare on its transparency page),
`ticketType` (a `TicketType` literal the agent's ticket-linkage will use — must be a
real value from `backend/src/models/Ticket.ts`'s union, e.g. `'student_support'` for a
student-facing agent, `'curriculum'` for a content-review agent; add a new literal to
that union if none fits, the same way Reese Phase 2 added `'reese_autonomous_outreach'`),
`entityType` (a free-form string tag for the ticket's `entity_type`/`entity_id` dedup
key — Reese used `'community_room'`), `pilotCohortGate` (boolean, default `false` —
only turn on if `proactive: true` and the agent needs an eligible-population gate).

## Derivation rules (fill every blank before writing)

1. **Identity config**, built from Tier 1/2 inputs, in the exact shape
   `agentBlueprint/agentIdentitySeed.ts`'s `AgentIdentityConfig` expects:
   `{ agentName, email, displayName, role, communityRole, enrollmentDefaults,
   pilotCohortGate }`.
2. **Persona block**, written against `docs/CORY_PERSONA_SPEC.md`'s locked pattern
   (the spec Reese's own voice was transplanted from, name-swapped): a `VOICE
   PRINCIPLES (locked)` section and a `GUARDRAILS (never do these)` section, always
   including "never pretend to be human or hide that you are an AI" and a neutral-
   pronoun ("they/them") line — these two are non-negotiable across every agent built
   this way, not just Reese's. Everything else in the persona is genuinely
   agent-specific — do not copy Reese's exact voice for a different agent, derive a
   new one matched to the new agent's actual job.
3. **Ticket-linkage shape**: `title`/`description` templates, `ticketType`,
   `entityType` — mirror `reeseTicketLinkService.ts`'s `ensureReeseTicketForRoom()` as
   the worked example, substituting the new agent's own domain language.

## Execution (idempotent, key on `agentName`/`email`)

A. **Preview first, always.** Call `previewAgentIdentity(config)`
   (`backend/src/services/agentBlueprint/agentIdentitySeed.ts`) — read-only, zero
   writes by construction (only ever calls `.findOne`, never `findOrCreate`/`create`/
   `update`). Report `aiAgent.exists` — if `false`, the `AGENT_REGISTRY` entry doesn't
   exist yet, and that's the real next step, not a bug in the preview.
B. Call `buildAgentSystemPrompt(personaBlock, previewEnrollmentId, { agentLabel,
   closingLine })` (`backend/src/services/agentBlueprint/agentSystemPrompt.ts`) with a
   placeholder/non-existent enrollment id — the graceful-degradation path returns a
   valid persona-only prompt (proven in this skill's own worked example, see below),
   which is the honest state for a brand-new agent with no conversation history yet.
C. Describe (do not create) what the Agent Detail transparency page would show once
   real — grounded in step A's real preview ids, per "The KEY runtime facts" above.
D. **Report back** (see Output section) and STOP. Do not call `seedAgentIdentity()`
   for real, do not add the `AGENT_REGISTRY` entry, do not create anything — that is a
   separate, explicit step (E-H below), only taken when the producer says so outright.
E. *(real commit, explicit step only)* Add one `AGENT_REGISTRY` entry in
   `backend/src/services/agentRegistrySeed.ts` and wire a `seedAgentIdentity(config)`
   call after the registry loop in `seedAgentRegistry()`, mirroring
   `reeseIdentitySeed.ts`'s thin-wrapper pattern (export `seedXxxIdentity()`,
   `getXxxEnrollmentId()`, `getXxxAdminUserId()`, delegating to the generic module —
   do not duplicate the generic module's logic).
E.5. *(real commit, REQUIRED)* Wire trust & hierarchy on the same `AGENT_REGISTRY`
   entry (step E) — this is not optional polish, it's the difference between a
   working agent and an organizationally-invisible one:
   1. **`reports_to`**: set exactly one of `reports_to_type: 'human'` +
      `reports_to_id: <org_members.id>` (this agent is AI Leadership), or
      `reports_to_type: 'agent'` + `reports_to_id: <existing AiAgent.id>` (AI Staff,
      reporting through an agent that must already exist). Set via
      `seedAgentIdentity()`'s self-heal (step E) or an explicit follow-up update —
      never leave both null on a ticket-creating agent, `enforceReportsToGate()`
      will reject its tickets. Verify the chain actually resolves to a real human
      (`resolveReportsToHuman()`, max 5 hops) before calling this done — a
      misconfigured chain fails closed (returns `null`), not loudly.
   2. **Permission tier**: add an entry to `AGENT_PERMISSIONS` in
      `agentPermissionService.ts` keyed on the exact `agent_name`, choosing one of
      the 4 real tiers deliberately. Skipping this is not a safe no-op — the agent
      silently gets `DEFAULT_PERMISSION` (`suggest_only`, effectively read+propose
      only, `requiresEvaluateSend: false`), which is fine for a genuinely
      low-trust agent but wrong for one that's supposed to write or communicate.
   3. **`department`** (the real column, not `category`): set if a genuine value
      fits; leave `null` rather than forcing a guess — `null` renders honestly as
      "Unclassified" on the transparency page, which is more honest than a wrong
      guess.
   4. **Autonomy level — know that it's inert by default.** `AiAgent.autonomy_level`
      (DB default `'observe'`) has ZERO effect on the live ABAC gate
      (`agentAuthorizationService.ts`) until something explicitly calls
      `reactivateAgent()` (`agentReactivationService.ts`), which stamps
      `autonomy_level_set_at` at the same time. Until then, effective autonomy is
      silently derived from the permission tier (step 2) via `levelForTier()`. Do
      not set `autonomy_level` on the registry entry expecting it to do anything —
      it won't, until a human deliberately runs the reactivation flow.
   5. Full mechanics, the 4-rung autonomy ladder, HITL rules, and the GOALS™
      live/fixed scoring detail: `references/trust-and-hierarchy.md`.
F. *(real commit)* Wire ticket-linkage: a thin wrapper file (mirroring
   `reeseTicketLinkService.ts`) calling `ensureAgentTicketForRoom()`/
   `logAgentExchangeActivity()` (`agentBlueprint/agentTicketLinkService.ts`) with the
   new agent's own title/description/type/entityType/intent-prefix.
G. *(real commit)* Wire a reply loop if the agent is conversational, mirroring
   `reeseReplyService.ts`'s loop-guard/scope-guard pattern (never reply to your own
   messages; only reply within your own room membership).
G.5. *(real commit, REQUIRED if this agent creates tickets — see below)* Satisfy
   `directives/register-ticket-creating-agent.md`, the Agent Ticket Standard —
   codified from real bugs found and fixed in all 6 of this platform's other
   ticket-creating agents (cory-engine, CoryBrain, workforce_intelligence_engine,
   InboxCaseEngine, Reese, bpos_orchestrator) during the 2026-08-15–17 audit sweep.
   Any new agent that opens tickets (step F above) is exactly the kind of agent that
   standard governs — do not treat it as optional or "can add later." Concretely,
   before this agent is considered built:
   1. The ticket-creation call's `entity_type`/`entity_id` (or title) dedup key is
      stable across repeated cycles for the same finding — never a fresh id/UUID
      regenerated every run (the exact live bug PR #1554 fixed for cory-engine:
      1,731 duplicate tickets from a dedup key keyed on a per-cycle decision id).
   2. `tools_granted` on the `AGENT_REGISTRY` entry (step E above) lists this
      agent's real capabilities, re-verified against its actual code — not copied
      from a sibling entry.
   3. If this agent's tickets ever need to close on anything other than a human
      manually resolving them, the resolver re-derives the SAME live signal the
      ticket was opened under. **A ticket-age or elapsed-wall-clock-time check
      ("close after N days untouched") is permanently banned as a closure
      condition in this codebase** — it was removed once already for being
      dishonest and this week's own history shows the temptation to reintroduce
      it keeps recurring. Comparing two *persisted* timestamps to each other
      (e.g. to order two records) is fine; comparing either to `Date.now()`/
      `new Date()` to decide closure is exactly the forbidden pattern.
   4. Register the resolver (if any) as a real `AiAgent` cron row
      (`trigger_type: 'cron'`, a real `schedule`) — or state in the `AGENT_REGISTRY`
      entry's `description` exactly why none is needed.
   5. Any bulk/historical ticket cleanup ships as `--plan`/`--apply`/`--revert`,
      never a single irreversible script, and is proven idempotent by actually
      running `--apply` twice and confirming the second run makes zero additional
      writes.
   6. Check the checkable subset of all of the above by running
      `backend/src/scripts/validateAgentTicketStandard.ts` against this agent's
      real `agentName` (see that file's header for the exact invocation, both
      local/dev via `ts-node` and production via `docker exec accelerator-backend
      node dist/scripts/validateAgentTicketStandard.js <agentName>`). It is a
      read-only diagnostic, not a blocking gate — it reports PASS/FAIL/INFO per
      check; a FAIL means go fix the underlying thing, not silently ignore the
      output.
H. *(deploy + verify)* `tsc --noEmit` both stacks; unit tests (happy/failure/boundary/
   idempotency per CLAUDE.md's Mandatory Test Types); deploy; confirm a real message
   exchange and a real linked ticket live, then confirm the Agent Detail page renders
   real (not empty) identity/prompt/tickets — the same close-out verification Reese
   Phase 1 used. If step G.5 applied, also run
   `validateAgentTicketStandard.ts` against the new agent live in production and
   attach its real output to this build's `docs/sessions/CC-<id>.md` entry. Also
   confirm step E.5's wiring live, not just committed: query the real
   `reports_to_type`/`reports_to_id` and resolve it (`resolveReportsToHuman()` or an
   equivalent direct check) to a real human, confirm the `AGENT_PERMISSIONS` entry is
   actually being read (not silently falling to `DEFAULT_PERMISSION`), and if the
   agent talks to managers, send it one real message via the Talk tab and confirm the
   reply is grounded (not a generic refusal) — the same live verification pattern
   used for Reese's own recent-activity grounding (`agentManagerConversationPrompt.ts`,
   2026-09-04).

## If this agent needs to be proactive (initiates contact on its own)

Do not import Reese's autonomous-outreach code — it is deliberately domain-specific
(student inactivity/completion/idle-event signals have no meaning for most other
agents). Instead, treat these 6 files as the **worked pattern to adapt**, re-deriving
each safety rail for the new domain rather than skipping any category:

| File (worked pattern) | What it shows |
|---|---|
| `reeseSignalService.ts` | How to define real, domain-grounded trigger conditions (not vague "check periodically") — re-derive your own signal(s) entirely. |
| `reeseEligibilityService.ts` | **Eligible-population gate, fail-closed by design** — `isEligibleForAutonomousOutreach()` never defaults to eligible on missing/ambiguous data (no pilot cohort configured → nobody eligible, checked BEFORE the enrollment lookup even runs). Re-derive your own gate; reuse the fail-closed *principle*, not the code. |
| `reeseAutonomousOutreachService.ts` | **Cadence cap** (`CADENCE_DAYS`) and **daily send cap** (`DAILY_SEND_CAP`) — both real, enforced, DB-checked constants. Also the `dryRun` parameter pattern (runs the full real decision pipeline, skips only the writes, honestly simulates shared caps) — the model for THIS skill's own preview mode. |
| `reeseOutreachFollowUpService.ts` | **Follow-up/escalation cap** (`MAX_ATTEMPTS`) — hits the cap → escalates to human review, never sends one more message past it and never silently gives up either. |
| `reeseOutreachMessageService.ts` | Grounding generated messages in real per-candidate data, never a fixed/templated string. |
| `reeseInitiateDmService.ts` | The thin wrapper pattern for agent-initiated contact, built on the platform's existing generic `openDm()`/`sendDmMessage()` — no new send plumbing needed. |

**The 4 safety-rail categories every proactive agent must re-derive, not skip:**
cadence cap, daily send cap, an explicit eligible-population gate (fail-closed), a
follow-up/escalation cap. Building proactive capability without all 4 is not a smaller
version of this pattern — it's a different, unsafe thing. This is also the trigger
point for the Governance checklist below.

## Output (report back)

`agentName` · `email` · preview verdict (`aiAgent.exists`, what would be created) ·
draft persona block (full text) · draft system prompt (full text, persona-only since
no real conversation exists yet) · transparency-page preview (what Agent Detail would
show once real) · ticket-linkage shape (`ticketType`/`entityType`/title-description
templates) · reactive-only or proactive (and if proactive, the 4 safety-rail values
chosen) · **the trust/hierarchy plan** (proposed `reports_to` target and confirmation
it resolves to a real human, proposed permission tier and why, `department` if any,
confirmation `autonomy_level` is left at its inert default unless a reactivation is
explicitly also being proposed) · **the tool-chest check** (which existing
`TOOL_CAPABILITIES` entries are being reused vs. which are genuinely new, with the new
ones' draft reads/produces) · a ✅/⚠️ checklist (registry-entry-exists ·
identity-preview-clean · persona-drafted · prompt-drafted · ticket-shape-defined ·
transparency-page-confirmed-generic-no-change-needed · agent-ticket-standard-reviewed
(step G.5, if this agent creates tickets) · trust-hierarchy-planned (step E.5) ·
tool-chest-checked-before-inventing-new-tools · governance-checklist-reviewed) ·
explicit confirmation nothing was actually created (zero real writes) · the exact next
step if the producer wants to proceed to a real commit.

## Governance checklist (mirrored in `docs/PROOFDESK_STATUS.md`)

Before ANY agent built this way goes live:

1. Any communication capability (DM, email, outbound message) requires Ali's explicit
   sign-off before `AiAgent.enabled` is ever set `true` in production.
2. New agents seed with `AiAgent.enabled: false` by default.
3. Identity + ticket-linkage + the transparency page verified live (real exchange,
   real linked ticket, real page render) BEFORE any proactive capability is added.
4. A pilot-cohort or equivalent eligible-population gate is mandatory before any
   autonomous outreach ships, fail-closed by design — no exceptions.
5. Any agent that creates tickets satisfies
   `directives/register-ticket-creating-agent.md` (see step G.5 above) —
   non-negotiable, not a "nice to have for high-volume agents only." The standard
   was codified specifically because all 6 of this platform's existing
   ticket-creating agents shipped without it and each needed a real bug fixed as a
   result (stale dedup keys, generic display-name collapse, no resolution
   mechanism at all, time-based fallback closures, non-idempotent bulk cleanups).
   Run `backend/src/scripts/validateAgentTicketStandard.ts` against the new
   agent's real name before considering this checklist item done.
6. `reports_to` is set and its chain genuinely resolves to a real human — a
   ticket-creating agent with no resolvable chain is not deployable
   (`enforceReportsToGate()` will reject its own tickets at write time). A
   non-ticket-creating agent should still be wired for the org chart to be honest,
   but isn't blocked on it the way a ticket creator is.
7. A permission tier was chosen deliberately, not silently defaulted — see step
   E.5.2. Silently accepting `DEFAULT_PERMISSION` for an agent that actually needs
   to write or communicate is exactly the "random agent doing things" pattern this
   checklist exists to prevent.
8. Every `tools_granted` entry either reuses an existing `TOOL_CAPABILITIES` entry
   or has a new one added with it, grounded in the real implementing code — never
   left as an `undocumentedTools` gap at ship time (a temporary gap during
   preview/draft is fine; it is not fine at step H's live verification).

## Worked example (CurriculumQA, preview only, done 2026-08-10)

Input: name "CurriculumQA", intent "reviews generated curriculum content for factual
and pedagogical quality before it reaches students." Full real preview output (real
`previewAgentIdentity()` return value, real `buildAgentSystemPrompt()` output, real
zero-write confirmation, real transparency-page description) is captured in
`.loop-architect/runs/20260810-reese-phase3-agent-blueprint/worked-example-walkthrough.md`.
Headline finding: `aiAgent.exists: false` — CurriculumQA has no `AGENT_REGISTRY` entry
yet, so step E (a real commit) would need to add one before any identity could be
seeded for real. No `AiAgent`/`AdminUser`/`Enrollment`/`CommunityMember` row named
"CurriculumQA" (or similar) was created anywhere — confirmed by grep across this
diff and every migration/seed file.

## Worked example (ReesePresenceHeartbeat, real, 2026-09-04 — Step 0 in practice)

Ali asked to review the Reese agent family for sprawl ("I don't want random agents
doing things"). Step 0's checklist, applied for real: `ReeseAutonomousOutreachSweep`/
`ReeseOutreachFollowUps`/`ReeseStudentSupportSupersessionResolver` all answered "no" to
question 1 (not a new identity — no `system_prompt`/`tools_granted`/`reports_to` of
their own, all three write through Reese's own `AdminUser`) and "yes" to question 2
(each a real, independent, already-registered kill switch for one Reese behavior) —
left exactly as they were. `ReesePresenceHeartbeat` answered "yes" to question 3:
`schedulerService.ts` had been calling `instrumentCronJob('ReesePresenceHeartbeat',
...)` every minute since Reese Phase 1 with no matching row —
`instrumentCronJob()`'s own "agent not in registry, run untracked" branch had been
silently firing on every single run: no pause switch, no run_count/error_count, no
`AiAgentActivityLog`, invisible to `cronHealthAlertService`'s missed-run alerting.
One `AGENT_REGISTRY` entry closed it — no identity, no persona, no ticket-linkage,
because this is a presence-touch cron, not a conversational agent. Deployed and
confirmed live: the row exists, `enabled: true`, and is accumulating real
`run_count`/`last_run_at` on its own per-minute schedule.

Separately, the same review closed a real Global Tool Chest gap: 13 of the 35 real
tool strings already in use across `AGENT_REGISTRY` had never been added to
`TOOL_CAPABILITIES` (`agentToolCapabilities.ts`) — `AgentBehaviorMonitorAgent`'s 4
anomaly-detection tools and 4 ticket/case auto-resolvers' 2 tools each. All 13 were
documented from the registry's own already-grounded descriptions (real function
citations, not invented), closing the gap `undocumentedTools` had been honestly
flagging for them.

## References

- `references/trust-and-hierarchy.md` — the full `AiAgent` schema, the `reports_to`
  resolution algorithm, `AGENT_PERMISSIONS`' 4 tiers and defaults, the autonomy ladder
  and ABAC shadow-mode mechanics, GOALS™ live/fixed scoring detail, the 5
  manager-authored post-creation tables (`AgentGoal`/`AgentOneOnOne`/
  `AgentReportSubscription`/`AgentMemoryProposal`/`ManagerDirective`), and when (rarely)
  a new `docs/ai-governance/ai-systems-registry.csv` row is actually warranted.
