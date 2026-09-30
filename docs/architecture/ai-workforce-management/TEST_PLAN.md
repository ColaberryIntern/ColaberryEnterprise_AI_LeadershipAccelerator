# Test Plan (Checkpoint A proposal — not built)

Per CLAUDE.md's Test Strategy Framework (~70% unit / ~20% integration / ~10% E2E) and Failure-First Design (BUILD → BREAK → HARDEN). This plan covers Checkpoints B–G; Checkpoint A's own baseline is `BASELINE_TEST_RESULTS.md`.

## Unit tests (per new service, happy path minimum, BREAK cases before shipping)

| Surface | Happy path | BREAK cases to test |
|---|---|---|
| `requireAgentManagerOrAdmin` | Direct manager passes; superadmin passes | No linked `OrgMember` for the email → 403; agent not in downstream chain → 403; agent belongs to a *different* human's chain → 403 (cross-manager leak); malformed/missing JWT → 401 (existing `requireAdmin` behavior must still hold) |
| `ManagerDirective` creation | Directive restricts a real existing permission → saved, versioned | Directive attempts to *grant* authority the agent doesn't have → rejected, converted to an authority-change-request per non-negotiable #4, never silently applied |
| Runtime context assembler | Injects an active directive into a run | Directive expired/revoked → not injected; two conflicting directives → deterministic resolution, not silent last-write-wins; directive present but context assembler throws → run fails closed, never silently drops the directive and proceeds unrestricted |
| `AgentManagerInboxItem` lifecycle | pending → approved/rejected → applied, mirroring `ProposedAgentAction` | Double-approval (idempotency) → second approval is a no-op, not a duplicate side effect; approval by a non-manager admin → 403 unless superadmin |
| `AgentReportSubscription` send | Scheduled send fires once at the configured time in the configured timezone | Manager timezone unset → creation blocked with a clear error, never silently defaults to `America/Chicago`; same subscription fires twice in one window (retry/cron overlap) → deduped, no double-send (per CLAUDE.md's idempotency table pattern) |
| `AgentGoal` progress | Real metric exists → real computed progress | No real metric backs the goal → renders `UNMEASURED`, never 0% or a guessed number |
| `AgentMemoryProposal → AgentApprovedMemory` | Proposal with evidence → approved → provably read by context assembler | Proposal rejected → never reaches runtime; approved-but-never-consumed → the `OpenclawLearning.applied`-dead-flag failure mode this must not repeat; is explicitly asserted against in a test, not just documented |

## Integration tests (dev sandbox DB, opt-in per CLAUDE.md)

- `requireAgentManagerOrAdmin` against real `org_members`/`ai_agents` rows in a dev sandbox — confirms the email-join-key assumption holds for actual staff records, not just fixtures.
- End-to-end directive → context-assembler → next agent run, confirming the injected instruction is present in the assembled context and `system_prompt` itself is byte-identical before and after (proves non-negotiable #4 isn't silently violated).
- Report-subscription cron firing against a seeded subscription, confirming exactly one `AgentReportRun` + one email per fire, across a simulated retry.

## E2E (Playwright, `tests/systemV2/`, one spec per journey per tests/CLAUDE.md)

- `manager-views-agent-team.spec.ts` — a manager logs in, sees only the agents in their downstream chain on the redesigned Agent Detail / manager command center, not agents outside their chain.
- `manager-sends-directive.spec.ts` — manager writes a restricting directive, confirmation card shown before commit (per the mission's mandatory-confirmation-card requirement for durable-state-creating intent), directive appears in the agent's directive history.
- `manager-reviews-memory-proposal.spec.ts` — a memory proposal with evidence is shown, approved, and the UI reflects it moved to approved state; a rejected proposal never appears as agent-known-fact anywhere in the UI.
- `unrelated-admin-blocked.spec.ts` — an admin with no reports-to relationship to an agent is blocked from manager-only actions (403 asserted at the network layer, not just hidden nav) — directly testing the mission's stop condition on unrelated admins issuing directives.

## Baseline (this checkpoint)

Actual commands run and actual results are in `BASELINE_TEST_RESULTS.md` — no test above is run yet; this document is the plan for checkpoints that haven't started.
