# Phase 1 reconciliation — Reese agentic employee & manager workspace

For Ali. This reconciles the new mission doc (`REESE_AGENTIC_EMPLOYEE_AND_MANAGER_WORKSPACE_BUILD.md`,
dropped 2026-09-18) against what is actually true in the codebase today, per that mission's own
Phase 1 exit bar: "Ali can locate her manager, scopes, communication channels, real capabilities,
active work, and disabled/missing integrations without inspecting code."

## What's already true (built and deployed this session, before this document)

- **Identity, manager, charter.** Reese reports to you. Her charter's mission text says so too
  (charter version 3, fixed 2026-09-18). Both were wrong before this session and are now
  correct and independently verified in production.
- **Scopes, behaviour switches, tool grants.** All 7 of her real behaviours (Reactive DM reply,
  Health assessment, Autonomous outreach sweep, Outreach follow-ups, Welcome DMs, Student
  support supersession resolver, Presence heartbeat) have real on/off switches on her Agent
  Detail page, restricted to you and her manager chain (not any admin). Turning one off asks for
  confirmation; turning one on doesn't.
- **One capability catalog, not several.** The same tool names and colors appear in
  Capabilities, Scheduled work, and Employee facts. Nothing hand-written duplicates this list
  anywhere in the UI.
- **Send/write/closure/escalation entry points.** Fully catalogued in `TOOL_INVENTORY.md` and
  `BEHAVIOUR_INVENTORY.md` in this same folder, written earlier this session.

## What's genuinely new in this reconciliation

### 1. Model-selected, rule-triggered, or human-directed — now shown per behaviour

Reactive DM reply and Health assessment are **model-selected**: within one triggered turn, the
model itself decides which of her real tools to call. The other 5 behaviours are
**rule-triggered**: a cron schedule or a fixed event decides when they run, with no model
judgment over whether to fire. Nothing today is **human-directed** — Reese has no
manager-assignable unit of work yet. That's a real, disclosed gap, not a hidden one; it's what
Phase 2's persisted work loop (see below) would create.

### 2. Callable / configured / authorized / enabled / healthy — now shown per behaviour, honestly

Every real behaviour is callable (the code exists) and configured (real, non-empty setup).
"Authorized" is honestly `true` for all 7 today — **not because a real permission check passed
them**, but because nothing currently has the power to block them (see the authorization
section below). "Enabled" is the same real switch you already control. "Healthy" is a real
error-count check for the 4 cron-tracked behaviours, and an honest "no signal" (not a fabricated
yes/no) for the 3 that have no per-behaviour run tracking.

### 3. Runtime authorization: real, but not enforcing anything yet

A real approval mechanism exists (`ApprovalRequest` rows, a real admin approve/reject/bulk-approve
surface, built 2026-09-13 in an earlier session). Reese's outreach path already writes real rows
there. **But nothing downstream reads their status to block a real send.** The platform-wide
switch that would change this (`abac_enforcement`) stays off, by your own standing rule for this
whole mission. This is not new information — it was already scoped as its own project (see
"What Phase 2 should tackle first," below) — this document just restates it plainly in one place
per the mission's own ask.

### 4. The persisted work-lifecycle schema — found, not built from scratch

The new mission document asks for a persisted work item and decision-event schema before any
new autonomy is added. **A real one already exists**, built and deployed in an earlier session,
currently unused by Reese: `work_contexts`, `agent_runs`, `work_ledger_events` (the real
decision-event table — records what was attempted, by whom, under what authorization, at what
cost, with what result), `ticket_work_units` (the real work-item table — acceptance criteria,
status, risk tier, who's assigned), plus dependency-tracking and resource-locking tables.

Two real findings from tracing Reese's own code line by line:

- **Her real-time replies already write to this ledger.** Every time a student messages her and
  every time she replies, a real event is recorded (`reeseReplyService.ts`, via
  `reeseTicketLinkService.ts`). This has been true since before this session — it was simply
  never surfaced anywhere on her page.
- **Her outreach sweep, follow-ups, welcome DMs, supersession resolver, and presence heartbeat do
  not.** None of those 5 behaviours write to this ledger today. This is a real, previously
  undocumented gap — not because the infrastructure is missing, but because nothing wired those
  5 paths to it.
- **Nothing creates a work-item row for Reese at all** — the `ticket_work_units` table is real
  and used by other parts of the platform (a different agent, InboxCaseEngine, plus a manual
  admin path), but Reese has never created one.

Three fields the mission's own field list wants that this schema didn't have — added this
session as inert, unused columns (nothing reads or writes them yet; this is schema-readiness,
not new behaviour): `plan_version`, `next_wakeup_at`, `attempt_count`, all on the existing
`ticket_work_units` table.

## What Phase 2 should tackle first (a recommendation, not a decision made for you)

Three real candidates, not mutually exclusive:

1. **Wire Reese's 5 silent behaviours into the real ledger** — a small, low-risk change (the
   pattern already exists and already works for her replies) that would make "what is she doing
   and why" visible for outreach, follow-ups, welcomes, closures, and heartbeats too.
2. **Start using `ticket_work_units` for her real cases** — the actual "persisted work loop" the
   new mission wants, now that the schema is ready. This is real new autonomy-adjacent work, not
   a quick follow-up.
3. **The pre-existing approval/enforcement project** — building the missing piece that lets a
   real `ApprovalRequest` actually hold a send until approved, instead of only logging it.

Recommendation: (1) first — it's small, safe, and immediately makes more of Reese's real work
visible to you, the exact thing this Phase 1 is about. (2) and (3) are both real Phase 2 scope,
and reasonable to sequence either way depending on whether "let her plan and act" or "let a human
gate a risky action" matters more to you next.
