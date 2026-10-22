---
name: build-platform-agent
description: Build, migrate, or audit ONE real AI employee to Reese's real standard — identity (AdminUser/Enrollment/CommunityMember/AiAgent), a persona-based system prompt, ProofDesk ticket-linkage, the Agent Detail transparency page, the full AI Workforce Management trust layer (reports-to hierarchy, permission tier, autonomy level, GOALS™ scoring inputs), and the real Tier-C code hooks (authorization chokepoint, activity logging, cost tagging) every agent's own business logic must call. Covers three real entry points: a brand-new agent from a name + one-line intent (or a rich description), an existing lightweight registry row that needs the missing depth, and a completeness audit against Reese's own real current configuration. From a name/intent/description it derives the identity config, drafts the system prompt, derives tools_granted/autonomy/risk-tier/category/persona, checks whether this is genuinely new capability or an existing agent's missing governance row, and previews everything with zero real writes; a real commit is a separate, explicit, human-approved step. Invoke when Ali or a manager says "build a platform agent", "set up the {X} agent", "onboard a new agent", "build the next AI employee", "migrate {X} to the Reese process", "give me a new AI staff identity", "who does {agent} report to", "assign {agent} a permission tier / autonomy level", "why is {agent}'s GOALS score generic", or is standing up, migrating, or hardening any agent in `agentRegistrySeed.ts`.
---

# build-platform-agent — build, migrate, or audit one real AI employee

A **platform agent** = a real staff-account AI identity in this system: a real
`AiAgent` registry row, a real `AdminUser`/`Enrollment`/`CommunityMember` identity
triple, a system prompt, and (once wired) real ProofDesk ticket-linkage and a real
Agent Detail transparency page at `/admin/agents/:id`. **Reese** is the reference
implementation (Phase 1: identity/DM/ticket-linkage/transparency — PR #1251, live;
Phase 2: signal-driven autonomous outreach — PR #1319, live). This skill takes as
little as a **name + one line of intent** (or a rich description — see "From a
detailed description" below) and produces a complete, previewed agent identity,
reusing the exact shared modules Reese's own code calls.

**This file used to be two separate skills** — `build-platform-agent` (this one, the
step-by-step builder) and `onboard-ai-agent` (a completeness checklist). They covered
the same ground from two angles and had started to drift out of sync with each other
and with the real code. Reconciled 2026-09-30 into one skill, at Dhee's request, so
there is one place to look and one thing to keep accurate. If anything below cites a
line number, treat it as **verified as of the date next to it, not a permanent fact**
— every numeric line citation in both source documents had drifted at least slightly
by the time of this reconciliation (see "A note on citation drift" below); file and
function names are far more durable than line numbers in a file this size.

This skill is also the one `CLAUDE_CODE_AI_EMPLOYEE_CONSOLIDATION_LOOP_PROMPT.md`
(repo root) points to as the minimum checklist for its own "Reese Employee Standard
2.0" (that file's Section 6) — the live program building the next 9 AI employees
across the org (Marketing, Product, Curriculum, Admissions, Sales, Internship,
Websites, Platform, Executive). Dara (Curriculum) is Employee #1, already built close
to this standard. Nothing in Section 6 of that program document is new — it's the
same obligations below, organized by business category instead of by Tier A/B/C.

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

## STOP AND ASK gates — do not guess on these

Ask and wait for a real answer before writing code, regardless of how much context
already exists:

- **`reports_to`** — which real human is accountable for this agent? Not a
  placeholder, not "whoever's convenient." Every AI employee must have exactly one
  direct accountable human in its reports-to chain (`CLAUDE_CODE_AI_EMPLOYEE_
  CONSOLIDATION_LOOP_PROMPT.md` Section 9 names the real owners per domain as of
  2026-09-30 — resolve the actual org record, don't guess from a first name). This
  stays a hard gate even for a very detailed agent description, unless the
  description explicitly names the accountable human.
- **Risk tier** — what is the worst real-world consequence of this agent's most
  capable action? Ground the answer in `deliveryRiskLevels.ts`'s real R0-R4
  definitions (R0=read_only, R1=reversible_content, R2=code_change,
  R3=schema/security/external_side_effect — any `communicate`-tier tool is, by
  definition, at least R3), not in how it "feels." Too low and a real
  external-side-effect action never gets reviewed; too high and routine work gets
  permanently stuck in an approval queue with no release path (see Reese's own
  `AGENT_PERMISSIONS` gap below for exactly this failure mode, just the quieter
  version — nobody set her tier at all).
- **Permission tier** (`AGENT_PERMISSIONS` in `agentPermissionService.ts`) — one of
  `read_only`/`suggest_only`/`write_with_audit`/`communication`, chosen deliberately.
  Silently accepting the fallback (`DEFAULT_PERMISSION`, `suggest_only`) without
  deciding is not a safe default — see "Reese's real configuration today" below for
  what this looks like when skipped even on the reference agent.
- **`category`/department** — where does this agent sit in the org taxonomy? Don't
  infer it from the agent's name alone if it's ambiguous.
- **The real scope of `tools_granted`** — what is this agent genuinely allowed to do?
  This is the direct input to the autonomy classifier and, eventually, real
  enforcement. Overstating it inflates the autonomy level dishonestly; understating it
  undersells what the agent needs to do its job.
- **Persona / system-prompt content and tone** — for anything the agent will say to a
  real student, manager, or customer, the voice is a real editorial decision, not a
  default. Every employee needs a genuinely distinct personality — don't copy Reese
  and change only the name (`CLAUDE_CODE_AI_EMPLOYEE_CONSOLIDATION_LOOP_PROMPT.md`
  Section 5).

Filling in a plausible-sounding guess on any of these is exactly the "fill in the gaps
later" outcome this skill exists to prevent.

## Step 0 — is this really a new agent, or something smaller?

Before drafting anything, check: does the requested capability already belong to an
existing agent, or does an existing agent just need its missing depth filled in? A
real case from this repo (2026-09-04): Ali asked to review the "Reese family" of
agents for sprawl. Three separately-registered `AiAgent` rows
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
4. **Does this agent already have a bare `AGENT_REGISTRY` row** (`agent_type`,
   `module`, `source_file`, `trigger_type`, `schedule`, `category`, `description` —
   most of the fleet is at exactly this depth and no further)? → skip to "Migrating an
   existing lightweight agent" below instead of treating it as a from-scratch build.

Only proceed past this point once the answer is genuinely "new identity" or "existing
identity missing real depth."

## Reese's real configuration today — the floor every new employee must clear

This is Reese's actual, current, verified configuration (re-verified against
`origin/main` 2026-09-30) — not a template to copy verbatim (her `tools_granted`,
persona, and business logic are her own, and yours will differ), but the concrete
floor every new AI employee's *structural* configuration must at minimum reach. Where
Reese herself falls short of her own standard, it's disclosed here honestly rather
than swept under the rug, so this skill doesn't launder her own gaps into every future
employee as if they were acceptable.

| # | Tier | Obligation | Reese's real value | Where it's set |
|---|---|---|---|---|
| 1 | A | Agent Detail page (all tabs) | Renders fully | `agentDetailService.ts` `getAgentDetail()` — free for any `ai_agents` row |
| 2 | A | Talk tab (manager conversation) | Real, grounded replies | `agentManagerConversationPrompt.ts` — free once `system_prompt` is set |
| 3 | A | Standing Directives, Goals & 1:1s, Report Subscriptions, Memory Proposals | All functional | Free, generic Agent Detail surfaces |
| 4 | B | `AGENT_REGISTRY` entry: `tools_granted`/`system_prompt`/`persona_version` | `tools_granted: ['respond_to_dm', 'read_learner_context', 'read_student_success_snapshot', 'assess_student_health']`; `system_prompt: REESE_PERSONA_BLOCK`; `persona_version: '2026-08-06'` | `agentRegistrySeed.ts`, Reese's entry (search for `agent_name: 'Reese'`) |
| 5 | B | Identity + accountability (`AdminUser`/`Enrollment`/`CommunityMember` + `reports_to`) | `reports_to_type: 'human'`, `reports_to_id` → Ali Muwwakkil's real `org_members.id` | `reeseIdentitySeed.ts`'s `seedReeseIdentity()`, reassigned for real via `backend/src/scripts/reassignReeseToAli20260918.ts` (2026-09-15 decision: "reports to Ali for now, to be reassigned to Kes later" — a real, time-bound interim answer, not a permanent one) |
| 6 | B | `RISK_TIER` (R0-R4) | `'R3'` (external side effect — she sends real DMs) | `const RISK_TIER = 'R3'` near the top of `reeseAutonomousOutreachService.ts` |
| 7 | B | Permission tier (`AGENT_PERMISSIONS`) | **No entry exists.** Silently governed by `DEFAULT_PERMISSION` (`suggest_only`) | `agentPermissionService.ts` — **a real, current gap on the reference agent herself, see Known Gaps** |
| 8 | B | `department` column | Not set (`null` by omission — no seed path ever populates it for her) | n/a |
| 9 | B | Role Charter | Real content exists, but not purely manager-authored in practice (see Known Gaps) | `AgentRoleCharter` row, `AgentCharterTab.tsx` |
| 10 | B | Autonomy level | Code-derivable as `communicate` (her `respond_to_dm` tool is the highest tier present) via the real classifier, auto-sourced | `agentCapabilityClassifier.ts` + `agentRegistrySeed.ts`'s create/update loop |
| 11 | B | `abac_mode_override` | `null` — inherits the platform-wide default (`shadow`), confirmed live | `AiAgent.abac_mode_override`, visible on her own Agent Detail page (Performance & Settings → Authority & controls) |
| 12 | C | Authorization chokepoint on every real send | Her outreach path AND her reply path both correctly branch on `authorizeTicketDispatch()`'s real `allowed` field. **Her 3rd send path (follow-ups) does not call it at all — a real, current gap, see Known Gaps.** | `reeseAutonomousOutreachService.ts`, `reeseReplyService.ts` |
| 13 | C | GOALS-score activity logging | Both working paths call the correct `logAgentActivity()` (not the same-named, unrelated one in `aiEventService.ts`) | imports from `agentBlueprint/agentActivityLogService` in both files |
| 14 | C | Per-call LLM cost tagging | Both working paths pass her real `agent_id`. **One of her 4 tools (`assess_student_health`) does not — its LLM call has no `agent_id` parameter at all, see Known Gaps.** | `getInstrumentedOpenAI({ agent_id: ... })` call sites |
| 15 | C | Ticket/ProofDesk visibility | Real, generic wrapper, confirmed correct | `reeseTicketLinkService.ts` wraps `agentBlueprint/agentTicketLinkService.ts` |
| 16 | A/B | Always-online presence heartbeat | `ReesePresenceHeartbeat`, `enabled: true`, real cron, accumulating real `run_count` | `agentRegistrySeed.ts` |
| 17 | C | The actual job | ~20 real files under `backend/src/services/reese/` | Bespoke — no registration step can hand this out |

**Read this table as "every one of rows 1-17 needs a real answer," not "copy Reese's
literal values."** Rows 4, 6, 10, 14, 17 are explicitly agent-specific — your new
employee's tools, risk tier, autonomy level, cost-tagged calls, and actual job will
differ from Reese's. Rows 1-3, 5, 7-9, 11-13, 15-16 are structural and should look the
same in *kind* (a real reports-to chain, a real deliberate permission tier, a real
authorization call on every send, real activity/cost/ticket evidence) even though the
specific values differ per agent.

## From a detailed description to the obligations table

Most new employees don't start from a blank form — Ali, 2026-09-30: "Most of the time
building an agent will come from a request of skills to plug into this system... an
agent will be explained in great detail and then we should be able to map to all the
answers." This section is how to turn a rich description (or a Personality & Judgment
Profile from `CLAUDE_CODE_AI_EMPLOYEE_CONSOLIDATION_LOOP_PROMPT.md` Section 5) into
real Tier 1-3 parameter answers below, instead of re-asking every STOP AND ASK gate
from zero regardless of how much the description already said.

Read the description once, fully, before touching any field. Then work through these
in order:

1. **`tools_granted`** — list every real capability the description names, phrased as
   the same kind of snake_case verb strings the real registry already uses (`respond_to_dm`,
   `create_agent_tasks`, `detect_stuck_agents`). Don't invent capabilities the
   description doesn't support, and don't under-list ones it clearly does — this list
   is the direct input to the next 2 steps, not decoration.
2. **Autonomy level, derived, not asked** — run the real classifier's own logic by
   hand against the list from step 1: `agentCapabilityClassifier.ts`'s
   `KEYWORD_TIERS` (`send_`/`respond_to_dm`/`_sms`/`_email`/`_call`/`_dm` →
   `communicate`; `create_`/`update_`/`delete_`/`cancel_`/`resolve_`/`flag_`/
   `auto_execute_`/`auto_repair`/`retry_`/`apply_` → `act_audited`;
   `propose_`/`identify_`/`generate_` → `suggest`;
   `read_`/`detect_`/`query_`/`evaluate_`/`assess_`/`analyze_`/`monitor_`/`scan_` →
   `observe`) — take the MAX tier across every tool. Once `tools_granted` is seeded,
   the real wiring (`seedAgentRegistry()` → `classifyNewAgentAutonomyLevel()`) does
   this automatically on boot — this step is for confirming the description supports
   the level you expect *before* seeding, not a substitute for the real classifier.
3. **`RISK_TIER`** — do not guess a feeling. Take the single MOST CONSEQUENTIAL real
   action `tools_granted` implies and place it on `deliveryRiskLevels.ts`'s real R0-R4
   scale (any `communicate`-tier tool is, by definition, an external side effect and
   therefore at least R3). If the description's actions span multiple tiers, the tier
   is the HIGHEST one present — a mostly-read-only agent with one real send action is
   still a communicate/R3 agent, not a mostly-observe one with an asterisk.
4. **Permission tier** — derive from the SAME `tools_granted` list, by the mapping in
   "The autonomy ladder" (`references/trust-and-hierarchy.md`): `communicate` tools →
   `communication` permission tier; `act_audited` → `write_with_audit`; `suggest` →
   `suggest_only`; `observe`-only → `read_only`. **Unlike autonomy level, nothing
   auto-derives this one — it must be added to `AGENT_PERMISSIONS` by hand (step E.5.2
   below).** Skipping this step is exactly the gap Reese's own configuration has
   today (see the table above) — don't repeat it on a new agent just because nothing
   technically breaks if you do.
5. **`category`/department** — the description's own stated domain or team almost
   always answers this directly (e.g. "helps students with curriculum" → student
   success; "audits agent behavior" → platform/governance). Only fall through to STOP
   AND ASK when the description genuinely doesn't say or implies more than one
   plausible department.
6. **Persona / system-prompt tone** — draft from the description's own stated audience
   and voice cues (who does it talk to, how formal, what it should never say) rather
   than a generic template. Still an editorial decision Ali should see before it ships
   to real students, not something to silently finalize.
7. **`reports_to`** — the one field most descriptions genuinely don't answer (who is
   accountable is an organizational decision, not a technical one derivable from what
   the agent does). This stays a hard STOP AND ASK gate regardless of how detailed the
   description is, unless the description explicitly names the accountable human.

**The STOP AND ASK gates above still apply — but only fire on what's still genuinely
ambiguous after this mapping pass, not by default for every field regardless of input
detail.** A rich description that clearly implies `communicate`/R3 and a clear
department doesn't need those 2 questions re-asked; a description that never names an
accountable human still needs that question asked every time, no matter how detailed
the rest of it is.

## What to say to run it

Give me the two required lines; everything else has a sane default I derive (or, per
the section above, derive from a rich description).

1. **name** — e.g. "CurriculumQA" (becomes `agentName`/`displayName`; `email` =
   `slugify(name)@colaberry.com` = the idempotency key downstream).
2. **intent** — one line (or a full description — see above): what the agent does and
   why it exists.

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
  added to `AGENT_REGISTRY` in `backend/src/services/agentRegistrySeed.ts` (a large,
  still-growing array — Reese's own identity-seed call site has moved multiple times
  as entries were added before and after it; find it by searching for
  `seedReeseIdentity()`, not by a remembered line number). This is a real code change
  (one array entry + one seed-call line), not a config toggle — flag it as the first
  concrete implementation step once a real commit is approved.
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
  tier — **this is exactly Reese's own live state for permission tier today**, not a
  hypothetical. See `references/trust-and-hierarchy.md` for the full mechanics; step
  E.5 below is where this actually gets set.
- **`system_prompt` feeds TWO different conversation paths, not one.** The manager-
  conversation prompt (`agentManagerConversationPrompt.ts`, the Admin > Agents > Talk
  tab) reads `AiAgent.system_prompt` DIRECTLY — set it on the registry entry and
  managers can talk to this agent immediately, no extra file needed. The
  student/learner-facing prompt (`agentSystemPrompt.ts`, what Derivation rule 2 below
  builds) is DIFFERENT — it takes a `personaBlock` as a plain function argument, never
  reads the DB column at all. Setting only `system_prompt` gets you a working manager
  conversation but NOT a working student conversation, and vice versa — most agents
  need both, built separately.
- **The Talk tab's real ACTIONS (goal-setting, 1:1 scheduling, standing directives,
  task assignment, approve/reject) are free the moment `system_prompt` works — no
  per-agent wiring.** All eight manager-intent classifiers are generic, keyed on
  `agentId` alone, with zero agent-specific code anywhere in them. See
  `references/trust-and-hierarchy.md`'s "Manager-conversation ACTIONS are free"
  section — do not add a step to this skill's build flow to "wire up" these
  capabilities; there is nothing to wire for a new agent.
- **The Trust & Control tab's Role Charter (`AgentRoleCharter`) is real, meant to be
  manager-authored, and NOT seeded automatically by the generic path** — same posture
  as the other 5 manager-authored tables (`AgentGoal`/`AgentOneOnOne`/
  `AgentReportSubscription`/`AgentMemoryProposal`/`ManagerDirective`), now 6 total. A
  brand-new agent's charter reads `charter: null` honestly until a manager writes one
  via `PUT /api/admin/agents/:id/charter`. **In practice, Reese's own charter was
  later updated by a one-off script applying canned content over the manager-written
  row** (`backend/src/scripts/applyReeseCharterV2.ts`) — a real deviation from the
  "manager-authored only" ideal, disclosed here rather than presented as the clean
  story. Consider filling the charter out at build time (through the real `PUT`
  endpoint, not a canned-content script) if the new agent's purpose is already well
  understood — see `references/trust-and-hierarchy.md`'s table for the exact field
  shape and limits.
- **`authorizeTicketDispatch()`'s result carries TWO fields that are easy to
  confuse — branch on the right one.** `verdict` is mode-INDEPENDENT ("would this be
  denied," true regardless of enforcement); `allowed` is mode-AWARE (unconditionally
  `true` in shadow mode, the real gate once enforcement is on for that agent). **Branch
  on `allowed`, never on `verdict`/`wouldDeny`** — a real design finding from Reese's
  own build: getting this backwards makes shadow mode silently start holding real
  actions the moment the code ships, with no enforcement flag ever flipped. When
  `allowed` is `false`, return an honest "held" outcome and skip every downstream side
  effect that would dishonestly record something that never happened (a "last
  contacted" timestamp, a ledger event). Reese's outreach and reply paths are both the
  correct worked example to copy for this (see the floor table above) — her follow-up
  path is the worked example of what skipping this looks like, not what to copy.
- **`tools_granted` has no enum — reuse the existing tool chest before inventing a
  new tool name.** `backend/src/services/reese/agentToolCapabilities.ts`'s
  `TOOL_CAPABILITIES` is the real, shared registry every agent's transparency page
  reads/produces view is derived from. Check there first: if an existing tool's real
  reads/produces already match what your new agent's capability actually does, grant
  that same tool name — don't invent `my_agent_does_the_thing_v2`. Only add a new
  `TOOL_CAPABILITIES` entry when the capability is genuinely new, grounded in the real
  implementing code, same as every existing entry. A tool granted but never added
  there isn't silently dropped — it surfaces honestly as `undocumentedTools` on the
  transparency page — but that's a signal to go document it, not a shippable end
  state.

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
than guessing if none of the ~existing values genuinely fit — Reese herself has none
set, see the floor table above), `permissionTier` (one of `read_only`/`suggest_only`/
`write_with_audit`/`communication` — see step E.5; silently accepting the
`DEFAULT_PERMISSION` fallback, `suggest_only`, without deciding is a real gap this
repo has already hit on the reference agent herself, not a safe default to assume).

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
   new one matched to the new agent's actual job (see `CLAUDE_CODE_AI_EMPLOYEE_
   CONSOLIDATION_LOOP_PROMPT.md` Section 5's full Personality & Judgment Profile
   shape for a richer version of this when building under that program).
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
      the 4 real tiers deliberately (derived from `tools_granted` per "From a
      detailed description," step 4 above). **Skipping this is not a safe no-op —
      it is the single real gap this skill's own reference agent (Reese) currently
      has** (see the floor table above): the agent silently gets `DEFAULT_PERMISSION`
      (`suggest_only`, effectively read+propose only, `requiresEvaluateSend: false`),
      which is fine for a genuinely low-trust agent but wrong for one that's supposed
      to write or communicate. Do not let a new agent repeat this gap just because
      nothing technically breaks when you do.
   3. **`department`** (the real column, not `category`): set if a genuine value
      fits; leave `null` rather than forcing a guess — `null` renders honestly as
      "Unclassified" on the transparency page, which is more honest than a wrong
      guess (Reese herself has none set — a real, low-stakes but real gap).
   4. **Autonomy level — know that it's inert until reactivated.**
      `AiAgent.autonomy_level` has ZERO effect on the live ABAC gate
      (`agentAuthorizationService.ts`) until either (a) `reactivateAgent()`
      (`agentReactivationService.ts`) is explicitly called, stamping
      `autonomy_level_set_at` at the same time, or (b) the real boot-time
      classifier (`classifyNewAgentAutonomyLevel()`/`maybeReclassifyAutonomyLevel()`
      in `seedAgentRegistry()`'s create/update loop) runs for a brand-new agent with
      `tools_granted` declared — this now happens automatically on first boot,
      stamping `autonomy_level_source: 'auto'`. Until either path has run, effective
      autonomy is silently derived from the permission tier (step 2) via
      `levelForTier()`. A human decision (`autonomy_level_source: 'manual'`) is never
      silently overwritten by the automatic path.
   5. Full mechanics, the 4-rung autonomy ladder, HITL rules, and the GOALS™
      live/fixed scoring detail: `references/trust-and-hierarchy.md`.
F. *(real commit)* Wire ticket-linkage: a thin wrapper file (mirroring
   `reeseTicketLinkService.ts`) calling `ensureAgentTicketForRoom()`/
   `logAgentExchangeActivity()` (`agentBlueprint/agentTicketLinkService.ts`) with the
   new agent's own title/description/type/entityType/intent-prefix.
G. *(real commit)* Wire a reply loop if the agent is conversational, mirroring
   `reeseReplyService.ts`'s loop-guard/scope-guard pattern (never reply to your own
   messages; only reply within your own room membership) — **and, if the agent will
   have more than one send path (e.g. a reactive reply loop plus a proactive
   follow-up sweep), wire the authorization chokepoint and activity logging on
   EVERY one of them, not just the first.** Reese's own follow-up send path
   (`reeseOutreachFollowUpService.ts`) currently calls neither — a real, disclosed
   gap on the reference agent (see Known Gaps below), not a pattern to repeat.
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
      dishonest and the temptation to reintroduce it keeps recurring. Comparing two
      *persisted* timestamps to each other (e.g. to order two records) is fine;
      comparing either to `Date.now()`/`new Date()` to decide closure is exactly the
      forbidden pattern.
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
H.5. *(deploy + verify, REQUIRED)* **Walk every real `AgentDetailPage` tab for the new
   agent — none of the steps above check this, and "does it actually work across the
   whole page" was an undocumented gap until this checkpoint (2026-09-10).** Open
   `/admin/agents/:id` and click through all eight: **At a Glance** (real KPI tiles,
   no crash even with zero data everywhere), **Live Status** (operational state
   derives something real, even if "Unknown"), **Overview** (identity/system-prompt/
   reports-to render, matching what steps E-F actually set), **Work & Decisions**
   (empty Manager Inbox renders honestly, not broken), **Talk** (send one real message
   — already covered above, but confirm the tab itself opens clean), **Reports**
   (subscribe form renders; the Preview button is a good extra check — click it with
   any section checked and confirm real content comes back, not an error),
   **Performance** (empty goals/1:1 lists render honestly), **Trust & Control**
   (Charter panel shows `null`/empty honestly unless step E.5's charter-fill option was
   taken, in which case confirm the real written content renders). A tab that crashes
   or silently shows nothing where an honest empty state was expected is a real defect
   to fix before considering this agent built — not a follow-up. Also open the real
   Org Chart page and confirm the new agent appears in the correct position under its
   `reports_to` chain (visual confirmation, not just the API-level check above).
H.6. *(verification checklist, minimum subset)* If short on time, this is the floor —
   every item below must still pass even when H/H.5's fuller walk isn't done in full:
   1. Load the agent's real Agent Detail page — no fabricated or unexpectedly blank
      state where real data should exist.
   2. Have a real exchange on the Talk tab — the agent responds using its own real
      `system_prompt`/persona, not a generic fallback.
   3. Take one real action through the agent's code, then confirm a real row appears
      in `ai_agent_activity_logs` under this agent's own id — not zero rows, not a
      row under the wrong agent.
   4. Confirm a real `ai_events` row from that action has `agent_id` populated, not
      null.
   5. Confirm a real ticket appears on the tickets board for that action.
   6. Confirm `autonomy_level_source` and `reports_to_id` are both non-null on the
      `ai_agents` row — either still null means the agent is not finished, regardless
      of how complete everything else looks.

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
| `reeseOutreachFollowUpService.ts` | **Follow-up/escalation cap** (`MAX_ATTEMPTS`) — hits the cap → escalates to human review, never sends one more message past it and never silently gives up either. **Note the disclosed gap above**: this specific file does not itself call the authorization chokepoint or activity logging — copy the cadence/escalation PATTERN, not the gap. |
| `reeseOutreachMessageService.ts` | Grounding generated messages in real per-candidate data, never a fixed/templated string. |
| `reeseInitiateDmService.ts` | The thin wrapper pattern for agent-initiated contact, built on the platform's existing generic `openDm()`/`sendDmMessage()` — no new send plumbing needed. |

**The 4 safety-rail categories every proactive agent must re-derive, not skip:**
cadence cap, daily send cap, an explicit eligible-population gate (fail-closed), a
follow-up/escalation cap, **plus the authorization chokepoint and activity logging on
every one of them, including follow-ups** (a 5th rail, added in this reconciliation
after finding Reese's own follow-up path skips it). Building proactive capability
without all 5 is not a smaller version of this pattern — it's a different, unsafe
thing. This is also the trigger point for the Governance checklist below.

## Known gaps — on Reese herself, and on this skill's own prior drift

Reese is the reference implementation, not a finished one. Disclosing her real open
gaps here means this skill doesn't launder them into every future agent as if they
were the standard. All items below were independently re-verified against
`origin/main` on 2026-09-30, during this reconciliation:

- **Live gap, found this reconciliation: no `AGENT_PERMISSIONS` entry for Reese.**
  She silently gets `DEFAULT_PERMISSION` (`suggest_only`) despite being a
  `communicate`-tier, R3 agent in practice. This is the clearest evidence that even
  the reference agent needs this skill's step E.5.2 applied retroactively — not
  something a new agent should inherit by copying her.
- **Live gap, found this reconciliation: `reeseOutreachFollowUpService.ts` (her 3rd
  real send path) calls neither the authorization chokepoint nor activity logging.**
  Her outreach and reply paths both do this correctly; follow-ups do not.
- **Live gap, found this reconciliation: `assessStudentHealth.ts`'s LLM call (backing
  her `assess_student_health` tool) has no `agent_id` cost-tagging parameter at all**
  — `chatJson()` (`runtime/runtimeAi.ts`), the helper it calls, doesn't accept one.
  Her other 3 tools' LLM calls are correctly cost-tagged.
- **Live gap, found this reconciliation: no `department` set** — low-stakes (renders
  honestly as "Unclassified"), but real.
- **Live gap, found this reconciliation: her Role Charter's version 2 was applied by
  a one-off script over canned content** (`applyReeseCharterV2.ts`), not through the
  generic manager-authored `PUT` endpoint a real manager would use for a new agent —
  version 1 WAS genuinely manager-authored, so this is a partial, not total,
  deviation from the ideal.
- **RESOLVED, 2026-09-21, re-confirmed 2026-09-30**: her reply path
  (`reeseReplyService.ts` `maybeTriggerReeseReply()`) and her outreach path
  (`reeseAutonomousOutreachService.ts`) both now call the authorization chokepoint
  and genuinely gate on `allowed`, not just log shadow-mode-style.
- **RESOLVED, 2026-09-21**: new-agent autonomy classification is wired to boot now
  (`seedAgentRegistry()`'s create/update loop calls `classifyNewAgentAutonomyLevel()`/
  `maybeReclassifyAutonomyLevel()`). Declare `tools_granted` honestly and it
  classifies itself; no manual backfill run needed for a new agent.
- **Capability to know exists**: enforcement is no longer purely global.
  `AiAgent.abac_mode_override` (`'shadow' | 'enforce' | null`) lets an admin put ONE
  agent into real enforcement independent of the platform default, visible/settable
  on that agent's own Agent Detail page. A new agent inherits the platform default
  automatically (`null` override, confirmed Reese's own current state) — nothing to
  build for this, but a single agent's first real enforcement moment can now be a
  deliberate decision rather than an all-or-nothing platform flip.
- **The GOALS score's zero-activity fallback is inflated, not conservative** —
  `agentGoalsDimensionsService.ts`: a brand-new agent with zero real tracked activity
  shows governance=5, lexicon=4, availability=2-or-5 (5 if
  `trigger_type==='on_demand'`), solid=5, observability=3. That's a deceptively
  decent-looking score with no real evidence behind it. Don't read a fresh agent's
  first GOALS score as proof of anything, and don't let anyone else assume it is.
- **A note on citation drift, found this reconciliation**: every numeric line-number
  citation checked in both of this skill's source documents had drifted at least
  slightly by 2026-09-30 (one by over 800 lines, in a fast-growing array file); every
  file+function-name citation (no line number) checked out exactly. This skill now
  deliberately avoids baking in line numbers for anything likely to grow (arrays,
  frequently-edited files) and uses them only for small, stable files, dated next to
  the citation. Treat any surviving line number elsewhere in this file as something
  to re-verify, not a permanent fact.

## Migrating an existing lightweight agent

Most of the fleet already has a bare `AGENT_REGISTRY` row (`agent_type`, `module`,
`source_file`, `trigger_type`, `schedule`, `category`, `description` — the first 7
fields Reese also has). Migrating one of these is the same floor table and execution
steps above, reframed as a gap list against what's already there, not a from-scratch
build:

1. Read the agent's current registry entry and its real source file — what does its
   code actually do today? That's the ground truth for `tools_granted`, not a guess.
2. Walk the floor table's rows 4-17 in order, checking what's already present vs.
   missing. Most lightweight agents are missing everything from row 4's
   `tools_granted`/`system_prompt` onward.
3. Apply the same STOP AND ASK gates — a pre-existing agent doesn't get a pass on
   risk tier, permission tier, or `reports_to` just because it's already running.
4. Run the same verification checklist (H/H.5/H.6) at the end. An agent that's been
   live for months with no real audit trail is not verified just because it hasn't
   broken anything visibly.

## Output (report back)

`agentName` · `email` · preview verdict (`aiAgent.exists`, what would be created) ·
draft persona block (full text) · draft system prompt (full text, persona-only since
no real conversation exists yet) · transparency-page preview (what Agent Detail would
show once real) · ticket-linkage shape (`ticketType`/`entityType`/title-description
templates) · reactive-only or proactive (and if proactive, the 5 safety-rail values
chosen) · **the trust/hierarchy plan** (proposed `reports_to` target and confirmation
it resolves to a real human, proposed permission tier and why, `department` if any,
confirmation `autonomy_level` is left to the automatic classifier unless a manual
override is explicitly also being proposed) · **the tool-chest check** (which existing
`TOOL_CAPABILITIES` entries are being reused vs. which are genuinely new, with the new
ones' draft reads/produces) · a ✅/⚠️ checklist (registry-entry-exists ·
identity-preview-clean · persona-drafted · prompt-drafted · ticket-shape-defined ·
transparency-page-confirmed-generic-no-change-needed · agent-ticket-standard-reviewed
(step G.5, if this agent creates tickets) · trust-hierarchy-planned (step E.5,
including the permission-tier entry — not just reports_to) ·
tool-chest-checked-before-inventing-new-tools · governance-checklist-reviewed ·
manager-intent-actions-confirmed-free-no-wiring-needed · role-charter-plan (write one
now through the real `PUT` endpoint, or confirm the honest-empty state is acceptable
for launch) · all-eight-tabs-walked-live (step H.5)) · explicit confirmation nothing
was actually created (zero real writes) · the exact next step if the producer wants
to proceed to a real commit.

## Governance checklist (mirrored in `docs/PROOFDESK_STATUS.md`)

Before ANY agent built this way goes live — and, where this skill is being used under
`CLAUDE_CODE_AI_EMPLOYEE_CONSOLIDATION_LOOP_PROMPT.md`'s Consolidation Program, this
list is the SAME ground that program's own Section 11 ("Production safety and
migration rules") covers at the macro-phase level; use that document's checkpoint
structure as the outer gate and this list as the concrete per-agent detail inside it:

1. Any communication capability (DM, email, outbound message) requires Ali's explicit
   sign-off before `AiAgent.enabled` is ever set `true` in production.
2. New agents seed with `AiAgent.enabled: false` by default.
3. Identity + ticket-linkage + the transparency page verified live (real exchange,
   real linked ticket, real page render) BEFORE any proactive capability is added.
4. A pilot-cohort or equivalent eligible-population gate is mandatory before any
   autonomous outreach ships, fail-closed by design — no exceptions.
5. Any agent that creates tickets satisfies
   `directives/register-ticket-creating-agent.md` (see step G.5 above) —
   non-negotiable, not a "nice to have for high-volume agents only." Run
   `backend/src/scripts/validateAgentTicketStandard.ts` against the new agent's real
   name before considering this checklist item done.
6. `reports_to` is set and its chain genuinely resolves to a real human — a
   ticket-creating agent with no resolvable chain is not deployable
   (`enforceReportsToGate()` will reject its own tickets at write time). A
   non-ticket-creating agent should still be wired for the org chart to be honest,
   but isn't blocked on it the way a ticket creator is.
7. A permission tier was chosen deliberately, not silently defaulted — see step
   E.5.2. Silently accepting `DEFAULT_PERMISSION` for an agent that actually needs
   to write or communicate is exactly the "random agent doing things" pattern this
   checklist exists to prevent, and exactly the gap this reconciliation found on
   Reese herself.
8. Every `tools_granted` entry either reuses an existing `TOOL_CAPABILITIES` entry
   or has a new one added with it, grounded in the real implementing code — never
   left as an `undocumentedTools` gap at ship time (a temporary gap during
   preview/draft is fine; it is not fine at step H's live verification).
9. Every real send path the agent has — not just the first one built — calls the
   authorization chokepoint and activity logging (step G above).

## Explicitly out of scope

- **Batch or automated migration** of the fleet's other registered agents — this is
  one agent at a time, by design, matching the Consolidation Program's own "no batch
  migration of all employees" rule.
- **Templating the real business logic** (floor-table row 17) — necessarily different
  per agent, can't be templated honestly.
- **Rewriting `agentToolRegistry.ts`/`agentToolCapabilities.ts`** into a fleet-wide
  structured tool taxonomy — larger, separate work; this skill works with the real
  free-text `tools_granted` data that exists today.

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

Separately, the same review closed a real Global Tool Chest gap: 13 of the real
tool strings already in use across `AGENT_REGISTRY` had never been added to
`TOOL_CAPABILITIES` (`agentToolCapabilities.ts`) — `AgentBehaviorMonitorAgent`'s 4
anomaly-detection tools and 4 ticket/case auto-resolvers' 2 tools each. All 13 were
documented from the registry's own already-grounded descriptions (real function
citations, not invented), closing the gap `undocumentedTools` had been honestly
flagging for them.

## Worked example (Dara, real, in progress — "AI Employee Consolidation Program, Employee #1," curriculum)

Dara's real `AGENT_REGISTRY` entry carries a comment identifying her as "Built to
Reese Employee Standard 2.0" — the second real post-Reese build, not merely a
preview. She has a real `system_prompt`, real `tools_granted` (independently
plan-audited to classify as `act_audited` before shipping), a real `persona_version`,
and a real, structural `reports_to` (her identity seed sets `reportsToOrgMemberId` to
Swati Raman's real `org_members.id`, the same mechanism this skill's step E.5.1 uses).
She is still `enabled: false` as of this reconciliation, per this skill's own
governance checklist item 2 — pending Phase 5 shadow validation and Phase 6
production verification under the Consolidation Program, not yet live. Treat her as
an in-progress worked example, not yet a finished one.

## References

- `references/trust-and-hierarchy.md` — the full `AiAgent` schema, the `reports_to`
  resolution algorithm, `AGENT_PERMISSIONS`' 4 tiers and defaults, the autonomy ladder
  and ABAC shadow-mode mechanics, GOALS™ live/fixed scoring detail, the 6
  manager-authored post-creation tables (`AgentGoal`/`AgentOneOnOne`/
  `AgentReportSubscription`/`AgentMemoryProposal`/`ManagerDirective`/
  `AgentRoleCharter`), and when (rarely) a new
  `docs/ai-governance/ai-systems-registry.csv` row is actually warranted.
- `CLAUDE_CODE_AI_EMPLOYEE_CONSOLIDATION_LOOP_PROMPT.md` (repo root) — the live
  program this skill is the minimum checklist for, building the next 9 AI employees
  under "Reese Employee Standard 2.0" (that file's Section 6), one at a time, each
  stopping for Ali's approval at every macro-phase checkpoint.
