---
name: build-platform-agent
description: Build or preview ONE real staff-account AI agent end to end — identity (AdminUser/Enrollment/CommunityMember/AiAgent), a persona-based system prompt, ProofDesk ticket-linkage, and the Agent Detail transparency page — following the proven Reese Phase 1/2 pattern. From a name + one-line intent it derives the identity config, drafts the system prompt, and previews everything with zero real writes; a real commit is a separate, explicit, human-approved step. Invoke when Ali says "build a platform agent", "set up the {X} agent", "give me a new AI staff identity", or wants to spin up the next Reese-style agent fast and safely.
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
non-transactional staff row), `proactive` (boolean, default `false` — see below).

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
F. *(real commit)* Wire ticket-linkage: a thin wrapper file (mirroring
   `reeseTicketLinkService.ts`) calling `ensureAgentTicketForRoom()`/
   `logAgentExchangeActivity()` (`agentBlueprint/agentTicketLinkService.ts`) with the
   new agent's own title/description/type/entityType/intent-prefix.
G. *(real commit)* Wire a reply loop if the agent is conversational, mirroring
   `reeseReplyService.ts`'s loop-guard/scope-guard pattern (never reply to your own
   messages; only reply within your own room membership).
H. *(deploy + verify)* `tsc --noEmit` both stacks; unit tests (happy/failure/boundary/
   idempotency per CLAUDE.md's Mandatory Test Types); deploy; confirm a real message
   exchange and a real linked ticket live, then confirm the Agent Detail page renders
   real (not empty) identity/prompt/tickets — the same close-out verification Reese
   Phase 1 used.

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
chosen) · a ✅/⚠️ checklist (registry-entry-exists · identity-preview-clean ·
persona-drafted · prompt-drafted · ticket-shape-defined · transparency-page-confirmed-
generic-no-change-needed · governance-checklist-reviewed) · explicit confirmation nothing
was actually created (zero real writes) · the exact next step if the producer wants to
proceed to a real commit.

## Governance checklist (mirrored in `docs/PROOFDESK_STATUS.md`)

Before ANY agent built this way goes live:

1. Any communication capability (DM, email, outbound message) requires Ali's explicit
   sign-off before `AiAgent.enabled` is ever set `true` in production.
2. New agents seed with `AiAgent.enabled: false` by default.
3. Identity + ticket-linkage + the transparency page verified live (real exchange,
   real linked ticket, real page render) BEFORE any proactive capability is added.
4. A pilot-cohort or equivalent eligible-population gate is mandatory before any
   autonomous outreach ships, fail-closed by design — no exceptions.

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
