---
name: onboard-ai-agent
description: Build or migrate ONE AI agent to Reese's real standard — a full AI employee with identity, accountability, trust instrumentation, and governance, not just an AGENT_REGISTRY entry with a name. Covers the real registry declarations, the identity/accountability seed, risk-tier and autonomy classification, and the three bespoke code chokepoints (authorization, activity logging, ticket visibility) every agent's business logic must call. Invoke when Ali says "onboard a new agent", "build the next AI employee", "migrate X to the Reese process", or is standing up or hardening any agent in `agentRegistrySeed.ts`.
---

# onboard-ai-agent — bring one agent to Reese's real standard

Ali, 2026-09-14, after the fleet-wide autonomy-classification dry-run found 232
registered agents and exactly one (Reese) with a real `system_prompt`/`persona_version`:
"Those other agents aren't registered like Reese. Reese should represent the new
registration process and I will pull the other agents over to this process one at a
time... The agents will be actual AI employees so they will be much more than just a one
trick poney. They will be robust like Reese and report to an actual human that will be
responsible for them." And the follow-up that authored this skill: "Make sure in this
new skill process runs the autonomy classifier and has everything that reese has because
when I create new agents I want them to fill out all functionality every time and if
unsure to ask... I don't want to have to fill in the gaps later."

**This is a checklist, not a script.** Ali runs it himself, one agent at a time, at his
own pace — there is no batch migration here, and this skill does not attempt one.

---

## What this produces

Not a row in `AGENT_REGISTRY` with a name. A real AI employee: a durable identity a
human or student can actually talk to, a named human who is accountable for it, an
honest risk tier and autonomy level derived from what it can really do, and full trust
instrumentation (audit trail, cost tracking, ticket visibility) so its work is as
inspectable as a human employee's. Everything below exists because Reese has it and the
other 231 registered agents mostly don't.

---

## Obligations — one row per thing a real agent needs

Tier A rows are free — any row in `ai_agents` gets them with zero extra code. Tier B
rows are deliberate config/data declarations. Tier C rows require real code the agent's
own business logic must call; nothing does this automatically.

| # | Tier | Obligation | Where | What happens if you skip it |
|---|---|---|---|---|
| 1 | A | Agent Detail page (Overview, Talk, Decisions, Goals, Reports, Memory, Directives, Charter tabs) | `backend/src/services/reese/agentDetailService.ts` `getAgentDetail()` — generic, works for any `ai_agents` row | Nothing to skip — this renders for every registered agent automatically. |
| 2 | A | Talk tab (live chat with the agent) | `backend/src/services/reese/agentManagerConversationPrompt.ts` — agent-agnostic, injects the agent's own real system_prompt/directives/memory/recent activity | Nothing to skip — but a blank/generic `system_prompt` (see #4) makes the conversation hollow even though the tab renders. |
| 3 | A | Standing Directives, Goals & 1:1s, Report Subscriptions, Memory Proposals | Same generic Agent Detail surfaces | Nothing to skip — free for any row. |
| 4 | B | A real `AGENT_REGISTRY` entry with `agent_type`, `module`, `source_file`, `trigger_type`, `schedule`, `category`, `description`, **`tools_granted`, `system_prompt`, `persona_version`** | `backend/src/services/agentRegistrySeed.ts` — Reese's entry (`agent_name: 'Reese'`) is the worked example; `PreviewStackReaper`/`StaleActionRecovery` show the bare-minimum "before" shape most of the fleet is still in | Without `tools_granted`: the autonomy classifier (#8) has nothing to classify and the agent defaults to `observe`, honestly but uninformatively. Without `system_prompt`: the Talk tab (#2) and any real conversation loop have nothing to run on — Reese is the ONLY entry in the 252-agent registry with `system_prompt` or `persona_version` set today. |
| 5 | B | Identity + accountability: an `AdminUser` + `Enrollment` + `CommunityMember` the agent can act as, plus `reports_to_type`/`reports_to_id` pointing at a real human or AI Leadership agent | `backend/src/services/agentBlueprint/agentIdentitySeed.ts` `seedAgentIdentity()` — real and generic, already reused by 5 other agents (name-display only) via `ticketCreatorIdentitySeed.ts` | No identity: the agent has no durable presence a student or manager can see or address. No `reports_to`: there is no accountable human — this is the single biggest gap between Reese and the other 231 agents, and the one Ali named directly ("report to an actual human that will be responsible for them"). |
| 6 | B | `RISK_TIER` (R0-R4, honest, not copied from Reese) | `backend/src/modules/delivery/deliveryRiskLevels.ts` for the real meaning (R0=read_only, R1=reversible_content, R2=code_change, R3=schema/security/external_side_effect); set as a bare constant the way `reeseAutonomousOutreachService.ts:26` sets `RISK_TIER = 'R3'` | A wrong tier is either dangerous (too low — a real external-side-effect action never gets reviewed) or paralyzing (too high — routine work permanently stuck in an approval queue with no release path, the exact failure mode this session's real-enforcement scoping work found waiting for Reese). **This is a STOP AND ASK gate — see below.** |
| 7 | B | Role Charter content | Generic model, but never auto-populated by any seed path | An agent with no charter looks unfinished forever — nothing flags the absence as blocking, so it's the easiest obligation to silently forget. |
| 8 | B | Autonomy level, auto-classified from `tools_granted` | `backend/src/services/agentCapabilityClassifier.ts` (pure classifier) + `backend/src/scripts/classifyAiAgentAutonomyLevels.ts` (backfill script, run with `--apply`) | **As of 2026-09-14, PR #2540 (the ongoing-sync wiring into `seedAgentRegistry()`) is still OPEN, unmerged.** Until it merges, a new registry entry does NOT get classified automatically on boot — run `node backend/src/scripts/classifyAiAgentAutonomyLevels.js --apply` manually after adding `tools_granted`, or the agent sits at the bare column default (`observe`, `autonomy_level_set_at` null) indefinitely. Re-check `gh pr view 2540` before assuming this is automatic. |
| 9 | C | Authorization/audit chokepoint on **every** real outbound or write action | `backend/src/services/workLedger/agentActionAuthorizationBridge.ts` `authorizeTicketDispatch()` | Skipping this is invisible until enforcement is turned on (see Known Gaps) — the action just happens with no real audit trail and no way to ever hold it for review. **Confirmed inconsistent even on Reese**: her outreach path calls it, her reply path does not (PR #2477, still open as of 2026-09-14). Call it on every send in the new agent's own code — do not copy what Reese's reply path does, copy what her outreach path does. |
| 10 | C | GOALS-score activity logging, success AND failure paths | `backend/src/services/agentBlueprint/agentActivityLogService.ts` `logAgentActivity()` | **Real gotcha**: there is a same-named, unrelated `logAgentActivity` in `aiEventService.ts` that department/admissions agents call instead — calling the wrong one compiles fine and silently produces no real GOALS-score evidence for this agent. Double-check the import path. |
| 11 | C | Real per-call LLM cost tagging (`agent_id` passed to `getInstrumentedOpenAI()`) | Call site inside the agent's own LLM-calling code | Easy to omit — roughly 50 other call sites across this codebase already don't pass it, and Reese's own reply service needed a real, dated bug fix for exactly this omission. Without it, the agent's real spend is invisible in `ai_events`. |
| 12 | C | Ticket/ProofDesk visibility for real work | `backend/src/services/agentBlueprint/agentTicketLinkService.ts` `ensureAgentTicketForRoom` / `logAgentExchangeActivity` — generic and reusable; Reese's own wrapper is a thin pass-through over this | Without it, the agent's real work never shows up on the tickets board — from a manager's view, the agent looks idle even while doing real work. |
| 13 | C | The actual job (LLM conversation loop, signal-detection thresholds, eligibility gates, whatever this agent's real business logic is) | Bespoke, per agent — see Reese's ~20 source files under `backend/src/services/reese/` for the scale of what "a real agent" actually requires | No registration step can hand this out. This is what the agent's developer designs and writes, informed by the real product/business requirement for that specific role — not templated by this skill. |

---

## STOP AND ASK gates

Do not guess on these. Ask Ali and wait for a real answer before writing code:

- **Risk tier (#6)** — what is the worst real-world consequence of this agent's most
  capable action? Ground the answer in `deliveryRiskLevels.ts`'s real R0-R4 definitions,
  not in how it "feels." Getting this wrong in either direction is a real production
  problem (see #6's consequences column).
- **`reports_to` (#5)** — which real human is accountable for this agent? Not a
  placeholder, not "whoever's convenient" — the actual person who will review its work
  and answer for it, per Ali's explicit "report to an actual human that will be
  responsible for them."
- **`category`/department** — where does this agent sit in the org taxonomy? Don't infer
  it from the agent's name alone if it's ambiguous.
- **The real scope of `tools_granted`** — what is this agent genuinely allowed to do?
  This isn't a documentation exercise; it's the direct input to the autonomy classifier
  (#8) and, eventually, real enforcement. Overstating it inflates the autonomy level
  dishonestly; understating it undersells what the agent needs to do its job.
- **Persona / system-prompt content and tone** — for anything the agent will say to a
  real student or manager, the voice is a real editorial decision, not a default.

If any of these is unclear from the conversation or the surrounding code, ask before
proceeding. Filling in a plausible-sounding guess here is exactly the "fill in the gaps
later" outcome Ali asked this skill to prevent.

---

## Known gaps on Reese herself (2026-09-14) — don't silently copy these

Reese is the reference implementation, not a finished one. Disclosing her real open
gaps here means this skill doesn't launder them into every future agent as if they were
the standard:

- **Her reply path skips the authorization chokepoint** (`reeseReplyService.ts`
  `maybeTriggerReeseReply()`) — PR #2477 (adds the missing call) is still open. New
  agents should call the chokepoint on every send regardless of what Reese's reply path
  currently does.
- **New-agent autonomy classification isn't wired to boot yet** — PR #2540 is still
  open (see obligation #8). Until it merges, autonomy level does not "just stay in
  sync"; it requires a manual backfill run.
- **The GOALS score's zero-activity fallback is inflated, not conservative** —
  `backend/src/services/agentGoalsDimensionsService.ts`: a brand-new agent with zero
  real tracked activity shows governance=5, lexicon=4, availability=2-or-5 (5 if
  `trigger_type==='on_demand'`), solid=5, observability=3. That's a deceptively
  decent-looking score with no real evidence behind it. Don't read a fresh agent's first
  GOALS score as proof of anything, and don't let anyone else assume it is.
- **Role Charter is never auto-populated by any seed path** (obligation #7) — always a
  manual write, always easy to forget since nothing blocks on its absence.

---

## Verification checklist

Run this after building or migrating, before calling the agent done:

1. **Load the agent's real Agent Detail page** — every tab (Overview, Talk, Decisions,
   Goals, Reports, Memory, Directives, Charter) renders without a fabricated or
   unexpectedly blank state where real data should exist.
2. **Have a real exchange on the Talk tab** — confirm the agent responds using its own
   real `system_prompt`/persona, not a generic fallback.
3. **Take one real action through the agent's code**, then confirm a real row appears in
   `ai_agent_activity_logs` under this agent's own id (obligation #10) — not zero rows,
   not a row under the wrong agent.
4. **Confirm cost tagging** — a real `ai_events` row from that same action has
   `agent_id` populated (obligation #11), not null.
5. **Confirm ticket visibility** — a real ticket appears on the tickets board for that
   action (obligation #12).
6. **Confirm `autonomy_level_source` and `reports_to_id` are both non-null** on the
   `ai_agents` row — an agent with either still null is not finished, regardless of how
   complete everything else looks.

A page that "loads fine" is not the same as an agent that passes this checklist. Run it
for real, don't assume it from the code.

---

## Migrating an EXISTING lightweight agent

Most of the fleet already has a bare `AGENT_REGISTRY` row (`agent_type`, `module`,
`source_file`, `trigger_type`, `schedule`, `category`, `description` — the first 7
fields Reese also has). Migrating one of these is the same obligations table above,
reframed as a gap list against what's already there:

1. Read the agent's current registry entry and its real source file — what does its code
   actually do today? That's the ground truth for `tools_granted`, not a guess.
2. Walk obligations #4-13 in order, checking what's already present vs. missing. Most
   lightweight agents are missing everything from #4's `tools_granted`/`system_prompt`
   onward.
3. Apply the same STOP AND ASK gates — a pre-existing agent doesn't get a pass on risk
   tier or `reports_to` just because it's already running.
4. Run the same verification checklist at the end. An agent that's been live for months
   with no real audit trail is not verified just because it hasn't broken anything
   visibly.

---

## Explicitly out of scope

- **Batch or automated migration** of the other ~230 registered agents — Ali is doing
  this himself, one at a time, "until I have a better process." This skill is that
  process; running it repeatedly is his call.
- **Templating the real business logic** (obligation #13) — necessarily different per
  agent, can't be templated honestly.
- **Rewriting `agentToolRegistry.ts`** into a fleet-wide structured tool taxonomy —
  larger, separate work; this skill works with the real free-text `tools_granted` data
  that exists today.
