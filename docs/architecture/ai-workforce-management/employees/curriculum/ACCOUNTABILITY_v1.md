# Curriculum, Learning & Certification — Reports-to, Escalation, Handoff Contract (Phase 2, draft v1)

**Session:** CC-20260915-q9k4 (continuing CC-20260915-a1x7) · **Date:** 2026-09-15 · **Status:** **approved by Ali** (choice B, 2026-09-15 — accountability contract as drafted; employee name Dara). No `reports_to_type`/`reports_to_id` is written to any `AiAgent` row in this phase — that happens in Phase 4 via `seedAgentIdentity()`, using exactly the values specified here.

## Reports-to

**Human:** Swati Raman — `org_members.id = 5db87b51-4554-4e52-93d7-c61f9887352c`, `email = swati@colaberry.com`, `team = Operations` (confirmed by direct query against `accelerator_prod`, 2026-09-15: `SELECT id, email, team, role FROM org_members WHERE email = 'swati@colaberry.com'` → exactly this one row). Confirmed as the "Swait" identity by Ali (`HUMAN_OWNERSHIP_MAP.md`, `HANDOFF_TO_NEXT_TAB.md`).

**Wiring (Phase 4):** `reports_to_type: 'human'`, `reports_to_id: '5db87b51-4554-4e52-93d7-c61f9887352c'`, set via `seedAgentIdentity()`'s `AgentIdentityConfig` (`reportsToOrgMemberId`), mirroring `ticketCreatorIdentitySeed.ts`'s pattern for an agent that reports directly to a human rather than through another agent. This is a **direct** report — unlike Reese, who today reports through the disabled `workforce_intelligence_engine` (`REESE_STANDARD_AUDIT.md` §1 obligation 3) — deliberately, so this employee does not inherit that known gap. Verification at Phase 4/5: `resolveReportsToHuman()` (`ticketCreatorReportsToResolver.ts`) resolves Dara's chain to Swati in exactly one hop.

**Why a human, not through another agent:** Dara has no natural AI-Leadership parent today — the only two candidates are CoryBrain (Ali's own reports, unrelated domain) and `workforce_intelligence_engine` (already disabled, already Reese's known gap). A direct human report is both simpler and avoids duplicating that exact problem in a second employee.

## Manager access (repeats `MANAGER_ACCESS_PLAN.md`, cited for completeness)

Swati has no `admin_users` login today, so she cannot yet open Dara's Agent Detail or Talk tab even after `reports_to` is set. Phase 4 must land, in this order:

1. **M1**: an `admin_users` row for `swati@colaberry.com` (`role: 'admin'`, `mgmt_role: 'curriculum'`), approver: Ali (Ali's Q2 = A already approves this row; it is *created*, not merely approved, in Phase 4).
2. **M2**: `['/api/admin/agents', 'program']` added to `PATH_SECTION` (`mgmtSectionGate.ts:59`) — a one-line, program-wide fix (applies to every scoped-role owner, not just Swati).

Phase 5 must verify Swati actually opens Dara's page with her own login, not just that the wiring is theoretically correct.

## Escalation policy

**The gap this deliberately avoids:** Reese's own escalation today is a ticket comment plus a status flip — it never reassigns the ticket, never changes ticket status, and sends no notification (`REESE_STANDARD_AUDIT.md` §3 gap 9, `reeseOutreachFollowUpService.ts:117-128`). Risk R8 in this employee's own risk register names this explicitly as a gap not to copy. Dara's escalation is designed differently from the start:

**Mechanism:** a real transactional email to Swati (`swati@colaberry.com`), using the same real send path already proven for a curriculum-adjacent case — `anthropicCurriculumImpactAgent.ts:160-170`'s nightly digest, which sends through `emailService.ts` today (currently to `admin_notification_emails[0]`, defaulting to Ali; Dara's version sends to Swati's real address directly, since she is Dara's actual accountable human, not a fleet-wide admin default). This is a **generic email send**, not the executive-only `alertService.ts`/`alertDeliveryService.ts` alert-subscription system (`deliverAlert`, `matchSubscriptions`) — that system's email channel reads the global `admin_notification_emails` setting and its SMS/voice channels read `executive_ghl_contact_id`/`executive_phone_number`, both scoped to Ali specifically; reusing it for a per-employee-to-manager escalation would either misfire to the wrong person or require adding Swati to an executive-scoped setting that doesn't semantically fit her role. A direct, real email is the correct-shaped mechanism, not the more elaborate one.

**When Dara escalates:** every real finding in this release, since Dara cannot act on anything alone (charter Boundaries — this release has no authorized-write capability beyond what the two Directors already do). Concretely: a curriculum-gap flag, a certification-readiness flag, and a QA-scan finding all reach Swati this way. A repeated/still-open finding does not re-escalate on a timer — it follows `alertService.ts`'s own real dedup principle (re-notify only on a real severity increase or a genuinely stale unacknowledged case), not a fixed interval, once this is actually built in Phase 3/4.

**Implementation status:** this is a **design decision for Phase 2**, not a built capability — the actual email-send wiring is Phase 3 (tool design) and Phase 4 (build) work. Phase 2 exists to name the real mechanism it will use before any code is written, per the plan's own acceptance criterion ("a mechanism that actually reaches them, not a ticket comment").

## Inter-agent handoff contract

Per the mission's minimum (Section 10 Phase 2) and the coverage contract's own domain boundaries:

| Domain that receives a handoff | What crosses the boundary | Real evidence |
|---|---|---|
| **Learner Success** (Reese) | Student-keyed evaluations and memory — `ArchitectEvaluationAgent`'s per-enrollment scoring, `LearnerMemoryDistill`'s mentor-memory writes. Dara names these findings but does not act on them. | Discovery Part 4: both classified "stays-elsewhere (Learner Success)"; both are student-keyed, not curriculum-keyed. |
| **Marketing** | `Intel_*` (×9) and `AiNewsRefresh` materialize student timeline cards — curriculum delivery content, Marketing-owned. Dara reads/subscribes per the coverage contract; does not edit or act. | Discovery 2(e): CSV places these under Marketing; they write to the learner feed. |
| **Platform** | The upstream Anthropic-monitoring crons (`AnthropicContentWatcher`, `AnthropicChangeDetector`, `AnthropicCatalogScraper`) — general product-line watching, not curriculum-specific. Dara owns only the curriculum-specific consumer of that signal (`AnthropicCurriculumImpactAgent`, deferred), which is a different row from the three watchers. | Discovery 2(a) family list; `AnthropicCurriculumImpactAgent` is the only one of the four that is curriculum-scoped and is separately deferred to this employee under the coverage contract. |
| **Executive** (owner unresolved) | `WorkforceResearchDirector`'s weekly `workforce_messages` addressed `to_slug: 'curriculum'` — Dara is the real consumer (subscribes), the director itself stays Executive-owned. | Discovery 2(e): `directorActions.ts:141-146`. |

**No handoff protocol between AI employees exists yet** because Dara is only the second employee in the program. This table names domain boundaries (what Dara does and does not act on); a real employee-to-employee handoff mechanism (e.g. a structured message one employee's tooling sends to another's inbox) is not designed here and is out of scope for Phase 2 — it becomes real, testable work once a second employee with an actual adjacent workload exists to design it against.

## Change history

| Version | Date | Change | Author |
|---|---|---|---|
| v1 (draft) | 2026-09-15 | Initial draft for Phase 2 approval | Session CC-20260915-q9k4 |
| v1 (approved) | 2026-09-15 | Ali approved choice B: accountability contract approved as drafted; employee name **Dara** (was drafted as Marin) | Session CC-20260915-q9k4 |
