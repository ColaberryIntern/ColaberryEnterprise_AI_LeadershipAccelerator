# ProofDesk — Program Status (post-Milestone 6)

**As of:** 2026-08-06, Milestone 6 (Consolidation), session `CC-20260805-n5br`.
**Purpose:** the single end-state reference for the whole 6-milestone ProofDesk build.
Supersedes reading through 5 milestones' worth of PROGRESS.md entries individually.

ProofDesk evolves the ticket board at `https://enterprise.colaberry.ai/admin/tickets`
from a conventional Kanban into a system backed by an append-only **Agent Work
Ledger**: every agent action gets a durable, evidence-backed record, and tickets
become the human-readable story generated from that record.

## A note on sourcing

The original source spec, `docs/ProofDesk_Multi_Agent_Ticketing_System_Spec.md`, does
**not exist anywhere in this repository's git history** — confirmed independently by
this milestone (`git log --all --diff-filter=A`, `git fsck --unreachable`, zero
matches) and consistent with the same finding M1's and M2's own build sessions already
made and documented. The 15 acceptance criteria audited below are a **reconstruction**,
built from: the Milestone 6 task brief's own quoted criterion language, the approved
phased plan (`linked-floating-lemon.md`)'s per-milestone grounding table and its own
citations of "acceptance criterion #1" and "#12", and each milestone's own PROGRESS.md
scope description. Treat the criterion numbering as this run's own organizing scheme,
not a guarantee it matches an original document's numbering.

---

## What's live today (all 6 layers)

| Layer | Milestone | Status | Key surfaces |
|---|---|---|---|
| Agent Work Ledger | M1 | **Live** | `work_ledger_events`, `agent_runs`, `ticket_action_links` tables; `emitEvent()` in `backend/src/services/workLedger/workLedgerService.ts`; wrapped into `ticketService.ts` (create/status-change/agent-output) and `ticketAgentDispatcher.ts` |
| Proof & Ticket Experience | M2 | **Live** | `evidence_artifacts`/`evidence_links`/`decision_records` tables; 6-tab `TicketDetailModal.tsx` (Story/Visual Proof/Work Graph/Decisions/Technical/References); anti-fabrication summary generator (`summaryGeneratorService.ts`); evidence-gated auto-close in `ticketManagementAgent.ts`'s cron |
| Multi-Agent Work Graph | M3 | **Live, low real adoption** | `ticket_work_units`/`work_unit_dependencies`/`resource_leases` tables; Capability Router (`capabilityRegistry.ts`, `capabilityRouter.ts`) replacing the old hard-coded `AGENT_MAPPINGS`, backward-compatible (all 5 original mappings ported verbatim, regression-tested); Work Graph tab in the ticket detail modal |
| Governance (shadow-mode) | M4 | **Live, shadow-only by design** | `approval_requests` table; `authorizeAgentAction()` chokepoint via `agentActionAuthorizationBridge.ts`; separation-of-duty flagging (`separationOfDutyService.ts`, log-only); Governance Shadow admin panel |
| Outcomes & Learning | M5 | **Live, thin real data** | `outcome_measurements` table; agent trust by capability, cost-to-proof (duration proxy), related-work clustering, executive narrative — all at `GET /api/admin/dashboard/{agent-trust,cost-to-proof,related-work-clusters,executive-narrative,outcome-measurements}` |
| Consolidation | M6 (this milestone) | **Complete** | 15-criteria audit below; one small in-scope fix shipped (`experimentService.ts` ledger bypass); this document |

**Real admin route paths** (for anyone building on top of this — the exact mounted
paths differ from the shorthand used in early planning docs):
`GET /api/admin/dashboard/work-ledger-health`, `/governance-shadow`,
`/agent-trust`, `/cost-to-proof`, `/related-work-clusters`, `/executive-narrative`,
`/outcome-measurements` — all in `backend/src/routes/admin/workLedgerRoutes.ts`,
`requireAdmin`-gated. The frontend page `/admin/work-ledger-health` is a separate,
correctly-named React Router path in a different namespace from the backend API path.

---

## What's shadow-mode or deferred, and why

| Item | State | Why |
|---|---|---|
| `abac_enforcement` | **shadow** (no override row in prod `system_settings`; falls back to the shipped code default) | Deliberate, per M4's own design — enforcement was explicitly scoped out of M1-M6, pending a dedicated decision from Ali. Every action is evaluated and logged; nothing is blocked. |
| Cost-to-proof dollar tracking | **Duration proxy only** | `AgentRun`/`WorkLedgerEvent` have no populated `cost_usd` field anywhere in the codebase today. `costToProofService.ts` deliberately reports real `duration_ms` as an honest proxy rather than fabricating a dollar figure. Building real cost tracking is a separate, unscoped feature. |
| Replayable runbooks | **Not built** | Never appeared as a concrete deliverable in any of M1-M5's shipped scope — noted here as a known gap in the original roadmap's ambition, not something this milestone silently dropped. |
| Work Graph adoption | **Mechanism live, ~0 real usage** | Only one disclosed test ticket has ever had work units in production; nothing in the real dispatch path (`ticketAgentDispatcher.ts`) auto-creates them. The Capability Router runs on every real dispatch; work-unit creation itself remains a manual admin-API surface only. |
| `work_contexts` table | **Schema-live, zero rows, zero writers, zero readers** | Structurally wired via 3 live foreign keys (`agent_runs`, `ticket_work_units`, `work_ledger_events` all reference it) — part of the intended M1 design for grouping related work under a shared context, never actually populated. Not retired this milestone (see Redundant Projections below). |
| BuildManifest/ValidationResult ↔ ledger coupling | **Mechanism exists, unused** | The generic `source_record_type`/`source_record_id` bridge on `work_ledger_events` is structurally reference-only (a type+id pair, incapable of copying a payload) and correctly designed, but no code path has ever actually linked a ledger event to a `build_manifests` or `validation_results` row. The two systems remain fully unconnected in practice. |

---

## The 15-criteria audit (evidence-backed, this milestone)

Verdicts are MET / PARTIALLY MET / NOT MET. Full evidence (exact queries, file:line
citations, live response payloads) for every row is in this run's
`.loop-architect/runs/20260806T000000Z-proofdesk-milestone-6-consolidation/audit-findings.md`,
independently re-verified task-by-task by a fresh `loop-task-verifier` subagent for
each (never self-graded).

| # | Criterion | Milestone | Verdict | Evidence summary |
|---|---|---|---|---|
| 1 | Ledger coverage for real agent actions | M1 | **PARTIALLY MET** | 98.3% in the flattering 24h snapshot, but 90.0% in the fair "since M1's real 2026-08-01 deploy" window — below the informal ≥95% target. Root cause: at least one code path (`experimentService.ts`) bypassed the ledger entirely by calling `Ticket.create()` directly — **fixed this milestone** (see below). Remainder of the gap not fully root-caused; disclosed honestly rather than papered over. |
| 2 | Anti-fabrication summaries | M2 | **MET** | `summaryGeneratorService.ts`'s no-evidence branches never emit an unqualified "verified"/"deployed"/"fixed" claim; regression test suite (5/5 passing) asserts all 3 output fields, not just the obviously-relevant one, per branch. |
| 3 | Evidence-gated closure | M2 | **MET** | The old 7-day time-only auto-close is fully replaced, not supplemented, in `ticketManagementAgent.ts`. A ticket with neither an evidence row nor a `[APPROVE-CLOSE]` override comment stays `in_review` indefinitely — no remaining time-only path exists. |
| 4 | 6-tab ticket detail experience | M2 | **MET** | All 6 tabs (Story/Visual Proof/Work Graph/Decisions/Technical/References) are real, non-stub components; all 4 dedicated backing endpoints confirmed live and auth-gated (401, not 404). |
| 5 | Work graph visibility | M3 | **PARTIALLY MET** | Mechanism proven correct and functional (on the one disclosed test ticket), but **zero real production tickets** have any work units today — nothing auto-creates them at dispatch time. |
| 6 | Capability routing correctness | M3 | **MET** | The Capability Router provably preserves all 5 original `AGENT_MAPPINGS` routing decisions — independently re-run regression suite (29/29 tests passing, including the dedicated backward-compat block), diffed against the pre-M3 array via git history. |
| 7 | Authorization required for R3/R4 actions | M4 | **NOT MET (by design)** | `abac_enforcement` is live-confirmed `shadow` in production (no override row). The evaluation path is real and would gate correctly if flipped to `enforce`, but nothing is blocked today. This is the deliberate, expected state — not a defect. |
| 8 | Separation of duty | M4 | **MET** | Log-only flag, live-confirmed to never block dispatch (`ticketAgentDispatcher.ts`'s flow always falls through to execution regardless of the flag). 0 flag events / 0 approval requests accumulated to date, consistent with the low real traffic through the mechanism. |
| 9 | Outcome measurement + agent trust | M5 | **MET** | An apparent 2-of-91 coverage gap was fully root-caused as a deployment-recency artifact (the M5 hook has only been live in prod for a few hours at audit time — 100% coverage in the actual live window). Agent-trust and cost-to-proof correctly return empty results live, traced directly to Work Graph's sparse adoption (criterion 5) rather than a bug. |
| 10 | Duration-to-proof | M5 | **MET** | Live-called directly; confirmed no fabricated dollar figure is ever invented when real cost data is absent. |
| 11 | Related-work clustering | M5 | **MET** | Live-called directly; returns real, non-empty clusters of genuine production tickets. |
| 12 | Executive narrative | M5 | **MET** | Live-called directly; one claimed-"shipped" ticket spot-checked against the live `tickets` table and confirmed genuine, not fabricated. |
| 13 | No regression to existing surfaces | Cross-cutting | **MET**, with one disclosed pre-existing (non-ProofDesk) defect | `ticketReplyService.ts` (email approve/reject) untouched by any M1-M5 commit. Kanban board live and auth-gated. **Real, currently-live bug found and disclosed**: `ticket_number` is `NULL` for all 15,037 production tickets (the Kanban board literally renders "TK-null") — traced via `git log` to a commit from **2026-03-11, five months before M1**, entirely unrelated to ProofDesk. Not fixed this milestone (needs a real backfill-strategy decision for 15,037 rows) — flagged for Ali/a future ticket. |
| 14 | BuildManifest/ValidationResult stay authoritative | Cross-cutting | **PARTIALLY MET** | The reference-only bridge mechanism is architecturally sound (structurally incapable of copying a payload), so "never copies payload" is vacuously true — but no code path has ever actually linked the two systems, so the "ledger references them" half was never realized in practice. |
| 15 | Idempotent, additive schema | Cross-cutting | **MET** | All 5 ProofDesk `ensure*Schema()` functions are additive-only (zero destructive `DROP`/`ALTER...DROP` statements), called from `server.ts`'s boot sequence, per-statement failure-isolated — matches this repo's established migration convention. |

**Scorecard: 11 MET, 3 PARTIALLY MET, 1 NOT MET (by explicit design).** No criterion
was rounded up to look cleaner than the evidence supports; two (5, 9) required a real
retry cycle when an independent verifier caught the audit stopping short of a fully
available root cause — both were re-investigated and closed with decisive evidence
rather than left at "good enough."

---

## Regressions found

**None caused by ProofDesk.** One pre-existing, unrelated defect was found and
disclosed (the `TK-null` ticket-number bug, criterion 13 above) — confirmed via git
history to predate M1 by five months. `ticketReplyService.ts` (email approval),
`AdminTicketBoardPage.tsx` (Kanban), and `BuildManifest`/`ValidationResult` all confirmed
intact and unmodified by any M1-M5 commit.

## Fixed this milestone

`backend/src/services/reporting/experimentService.ts`'s `createExperimentTicket()`
previously called `Ticket.create()` directly (bypassing the ledger) and set an invalid
`status: 'open'` (not a real `TicketStatus`, reachable only via an `as any` cast — a
second bug found in the same line). Fixed to route through the ledger-instrumented
`ticketService.createTicket()` with a valid `status: 'todo'`. 3 new tests, `tsc --noEmit`
clean, `ticketService.test.ts` regression suite (12/12) unaffected.

## Redundant projections — none retired

Only real candidate found: `work_contexts` (M1) — 0 rows, 0 writers, 0 readers
anywhere in `backend/src`, but structurally referenced by 3 live foreign keys
(`agent_runs`, `ticket_work_units`, `work_ledger_events`). **Not retired** — a
zero-row table with live FK dependents is not "zero dependency" by this milestone's own
explicit guardrail. Documented as a candidate for a future decision: either wire it up
for real (populate `work_context_id` at dispatch time so related agent runs/work
units/ledger events can be grouped, as originally intended) or formally deprecate the
column/table trio. `ticket_work_units`/`resource_leases`/`outcome_measurements` are
sparse but not redundant — they're real, correct, early-adoption mechanisms, not
duplicates of anything.

---

## Concrete decisions still pending from Ali

1. **`abac_enforcement`: shadow → enforce, scope and timing.** This is the single
   biggest open decision across the whole program. It is a global flag already shared
   with the pre-existing ERP-integration/realtime-sync agent families (per M4's own
   disclosure) — flipping it affects more than just ProofDesk ticket dispatch. Today,
   zero live tickets carry risk_tier R3/R4 at all, so flipping it would have no
   *visible* effect on ticket dispatch specifically until something else starts
   assigning real R3/R4 tiers. Recommend: decide this independent of any ProofDesk
   deadline pressure, since M6 confirms nothing is currently blocked by it remaining
   shadow.
2. **`ticket_number` / "TK-null" fix.** Pre-existing (predates ProofDesk by 5 months),
   but real and currently visible on the Kanban board today. Needs a decision on
   backfill semantics for 15,037 existing rows (sequential backfill by `created_at`?
   leave historical tickets numberless and only number going forward? a new sequence?)
   before anyone should write the fix.
3. **`work_contexts`: wire it up or deprecate it.** A real design decision, not a bug
   fix — the table/FKs exist and are structurally sound, but nothing has ever used them.
4. **Cost-to-proof real dollar tracking and replayable runbooks** remain unscoped
   beyond the duration-proxy and the M2 evidence infrastructure respectively — worth a
   deliberate decision on whether/when to build them as a future, separate initiative.

---

## Governance checklist for a new platform agent (added 2026-08-10, Reese Phase 3)

Reese (Phase 1: identity/DM/ticket-linkage/transparency; Phase 2: signal-driven
autonomous outreach) is the proven pattern for a real staff-account AI agent wired into
ProofDesk. `.claude/skills/build-platform-agent/` turns that pattern into a repeatable
skill for the next agent, sharing 3 generic modules
(`backend/src/services/agentBlueprint/{agentIdentitySeed,agentSystemPrompt,
agentTicketLinkService}.ts`) that Reese's own Phase 1 code now calls (Reese is their
first caller, refactored with zero behavior change — see
`.loop-architect/runs/20260810-reese-phase3-agent-blueprint/handoff.md`). Before a new
agent built this way goes live, confirm:

1. **Any communication capability (DM, email, outbound message) requires Ali's
   explicit sign-off before that agent's `AiAgent.enabled` flag is ever set `true` in
   production** — matching Reese Phase 2's own rollout gate (a pilot-cohort-scoped
   launch, explicitly verified live before wider enablement). This is a CLAUDE.md
   Autonomy Model judgment call (new communication capability sits outside routine
   implementation-level autonomy), not an automatic proceed.
2. **New agents seed with `AiAgent.enabled: false` by default.** Reactive-only agents
   (identity + DM reply + ticket-linkage, no autonomous outreach) still need an
   explicit enable step before their first real conversation.
3. **Identity-seed + ticket-linkage + the transparency page must be verified live**
   (a real DM or equivalent real exchange, a real linked ticket, a real Agent Detail
   page render) before any proactive/autonomous capability is added on top — mirrors
   Reese's own Phase 1 → Phase 2 sequencing, never built simultaneously.
4. **A pilot-cohort or equivalent eligible-population gate is mandatory before any
   autonomous outreach ships, fail-closed by design** (no default-to-eligible path on
   missing/ambiguous data) — see `reeseEligibilityService.ts` for the worked pattern.
   Cadence cap, daily send cap, and a follow-up/escalation cap (see
   `reeseAutonomousOutreachService.ts` / `reeseOutreachFollowUpService.ts`) are each
   re-derived per agent for its own domain, never imported as shared code.

---

## Where to look next

- Full audit evidence (every query, every citation, every independent re-verification):
  `.loop-architect/runs/20260806T000000Z-proofdesk-milestone-6-consolidation/audit-findings.md`
- Plan + execution contract for this milestone:
  same directory's `plan.md` / `execution-contract.md`
- Program closing handoff (testing guide + pending decisions restated): the same
  run's `handoff.md`, produced as this milestone's final task, immediately after this
  document
- Prior milestones' individual handoffs and deployment logs: referenced by run-directory
  path in each milestone's own PROGRESS.md entry (M1-M5, all `.loop-architect/runs/...`,
  gitignored — not recoverable outside the worktree that produced them, per this
  milestone's own experience trying to locate the source spec file).
