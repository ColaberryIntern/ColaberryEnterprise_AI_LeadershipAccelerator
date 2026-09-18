# Phase 1 report — Reese agentic employee & manager workspace

For Ali. Covers Phase 1 of `REESE_AGENTIC_EMPLOYEE_AND_MANAGER_WORKSPACE_BUILD.md`, built via
`/loop-architect` (`.loop-architect/runs/20260918-reese-agentic-workspace-phase1/`). Shipped as
PR #2718 (color coordination, last-used times, ticket links — merged and deployed) and PR #2719
(trigger-mode/status facts, work-lifecycle schema reconciliation — merged and deployed,
independently production-verified).

## What Reese can now do, one concrete example

Open her Agent Detail page, Overview tab, Employee facts card. Every behaviour row now tells you
three new things at a glance: a color, a trigger-mode pill, and five status-fact pills. Take
"Autonomous outreach sweep" — it shows a color that matches its own row in Scheduled work below
(so you can find it there without reading), a "Rule-triggered" pill (it runs on a fixed schedule,
never a model's own judgment call about whether to fire), and Callable: yes, Configured: yes,
Authorized: yes, Enabled: yes, Healthy: yes — each one a real, independently-computed fact, not
a single flattened "it's on" switch. Click its "Last ticket" link and the exact ticket opens in a
new tab.

## What you can see or control, and where to click

- **Agent Detail page → Overview tab → Employee facts card**: every real switch (all 7
  behaviours), color-matched to Capabilities and Scheduled work, each with a trigger-mode label,
  5 status facts, and a real last-ticket link that opens in a new tab.
- **Same card**: manager chain, charter version, availability, and last meaningful action — all
  real, all already shipped in an earlier Phase 1 slice this session.
- **Reconciliation memo**, `docs/reese-agentic-employee/PHASE_1_WORKSPACE_RECONCILIATION.md`: the
  full current-state matrix and the real finding that her replies already write to a work ledger
  the other 5 behaviours don't yet use.

## What was verified, and in which environment

- Unit + integration tests: 64 backend + 15 frontend tests for R11 alone, all passing; full
  backend suite 23,808/23,936 passing (the 2 failures are an unrelated, pre-existing local-timing
  artifact in a password-hash test, confirmed clean on CI). Both `tsc --noEmit` clean.
- **Production**: independently verified by a `loop-production-verifier` pass, PASS. Confirmed
  the exact deployed commit matches the merged PR, confirmed the new pills render on Reese's real
  live page with real data (screenshot captured), confirmed the changed API endpoint correctly
  requires authentication, confirmed zero Reese-attributed errors post-deploy, confirmed the new
  database columns exist and are genuinely unused. Full detail in this run's `deployment-log.md`.

## What's still missing or disabled

- **Runtime authorization is real but not enforcing.** A genuine approval mechanism exists
  (`ApprovalRequest`, a real admin queue), and Reese's outreach path already writes to it — but
  nothing today reads its status to block a send. `abac_enforcement` stays off, by your standing
  rule. Every "Authorized: yes" pill on her page reflects this honestly: nothing currently has
  the power to say no, not that a real check passed.
- **5 of her 7 behaviours are invisible to the work ledger.** Only her real-time replies write
  real decision-event rows today. Her outreach sweep, follow-ups, welcome DMs, supersession
  resolver, and presence heartbeat do not. This is a real, previously undocumented gap — small
  and low-risk to close.
- **No persisted work loop yet.** The schema is ready (this session added 3 fields to the
  existing table); nothing creates or updates a work-item row for Reese yet. That's Phase 2.
- **The dashboard shell redesign** (the 5-destination layout you shared a mockup for) is
  confirmed sequenced as its own build, right after this one — not started yet.

## Score changes, with evidence

Using the mission's own disclosed rubric (0 absent, 2 declared/manual, 4 narrow working path, 6
tested lifecycle with gaps, 8 verified integrated behavior in scope, 10 sustained operational
evidence). Scored only for the dimensions this Phase 1 slice actually touched — the rest
genuinely have no new evidence yet and are marked as such rather than guessed.

| Dimension | Score | Evidence |
|---|---|---|
| Visibility | 6 → 8 | Model-selected/rule-triggered and 5 decomposed status facts now render per behaviour, verified integrated in production (real data, real screenshot) — up from a single flattened enabled/disabled switch. |
| Investigation | 4 → 6 | The work-ledger tracing in R12 is a real, tested finding about which of her own actions are actually observable today, not a declared capability — but it's a one-time analysis, not a repeatable investigation behavior yet. |
| Enforced boundaries | 2 (unchanged) | Still declared/manual — a real approval mechanism exists and is disclosed honestly as non-blocking. No behavior changed here this phase, deliberately (flipping enforcement was explicitly out of scope). |
| Proactive monitoring, follow-through, outcome verification, adaptive decisions, execution, human handoffs, manager communication, governed learning | **Not yet assessable** | No Phase 2+ behavior exists yet for any of these — scoring them now would be a guess, not evidence. |

## One consolidated decision request

See `PHASE_1_WORKSPACE_RECONCILIATION.md`'s own recommendation: **wire the 5 silent behaviours
into the real work ledger first** (small, safe, immediately makes more of her real work visible)
before either the larger persisted-work-loop build or the enforcement project. That's my
recommendation for what Phase 2 opens with — happy to start there, start with the dashboard
redesign instead (your mockup is ready to build from), or take a different order if you'd rather.

Also flagging, separately: production verification surfaced 2 stuck marketing emails from
2026-09-14 ("AI Leadership Cold Outbound Q1"), unrelated to this work. Let me know if you want
that looked at.
