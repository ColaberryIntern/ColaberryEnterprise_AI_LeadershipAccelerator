import { Ticket } from '../../models';
import type { TicketType } from '../../models/Ticket';

// Ticket Board Honesty fix (2026-08-16, session CC-20260816-q4mz). Visual Proof / Work
// Graph / Decisions tabs currently show the SAME "no evidence captured" text on every
// ticket, regardless of whether that category of ticket could ever plausibly have one.
// Confirmed by a real writer-path audit at fix time (grep for every real caller of
// recordEvidenceArtifact()/createWorkUnit()/recordDecision() across backend/src):
//   - evidence_artifacts: the ONLY real production writer is
//     services/reese/reeseOutreachFollowUpService.ts's closeWithEvidence(), tied to
//     reese_autonomous_outreach tickets.
//   - ticket_work_units: zero automated writers — createWorkUnit() is only ever called
//     from the admin API route (human/manual) and its own test.
//   - decision_records: zero automated writers — recordDecision() (evidence domain) is
//     only ever called from the admin API's POST /decisions route (human, via the
//     DecisionsTab "Record" button).
// So most of the 16,070 tickets were never going to have any of these three by design,
// not by defect — but the UI couldn't tell the difference, which is exactly what made
// the founder distrust the board. This module classifies PER CATEGORY (ticket type +
// creator), not per ticket, so the logic is auditable and consistent — never a guess
// made ticket-by-ticket.
//
// See `.loop-architect/runs/20260816T000000Z-ticket-tab-honesty/execution-contract.md`
// section B3 for the full grounding table (file:line citations per ticket type).

export type EvidenceExpectation = 'expected' | 'not_applicable';

export interface TicketEvidenceExpectations {
  visualProof: EvidenceExpectation;
  workGraph: EvidenceExpectation;
  decisions: EvidenceExpectation;
}

interface ClassifiableTicket {
  type: string;
  source?: string | null;
  created_by_type: string;
}

const EXPECTED: EvidenceExpectation = 'expected';
const NOT_APPLICABLE: EvidenceExpectation = 'not_applicable';

/**
 * Per-`type` default classification (before the cross-cutting overrides below are
 * applied). Every key is a real `TicketType` enum value from `models/Ticket.ts`, kept
 * in the exact same order as that union so a diff against it is easy to eyeball. A
 * type intentionally NOT in this table (a future addition to the enum) falls through
 * to the conservative all-`not_applicable` default in `getEvidenceExpectations()` —
 * see that function's own comment for why that default direction was chosen.
 */
const TYPE_DEFAULTS: Record<TicketType, TicketEvidenceExpectations> = {
  // Generic/default type, created by many heterogeneous paths (CoryBrain subtasks,
  // the DB-level default). Too heterogeneous for a defensible type-level default
  // beyond "not applicable unless a human filed it" (see the human override below).
  task: { visualProof: NOT_APPLICABLE, workGraph: NOT_APPLICABLE, decisions: NOT_APPLICABLE },

  // Human/product bug reports are exactly what this repo's own screenshot-review
  // skill covers (CLAUDE.md "Screenshot Capture + Review HTML"). Automated
  // security-scan findings also use type:'bug' but are excluded by the
  // source==='security' override below, since a source-code finding has no visual
  // dimension.
  bug: { visualProof: EXPECTED, workGraph: NOT_APPLICABLE, decisions: NOT_APPLICABLE },

  // Same screenshot-review rationale as 'bug'. No confirmed automated creator found
  // for this type — in practice this only fires for human-filed tickets today,
  // which the human override below covers doubly.
  feature: { visualProof: EXPECTED, workGraph: NOT_APPLICABLE, decisions: NOT_APPLICABLE },

  // Curriculum content-authoring tickets (curriculumArchitectAgent.ts,
  // curriculumOptimizerAgent.ts). No screenshot pipeline, decision-approval flow, or
  // work-graph usage connected today.
  curriculum: { visualProof: NOT_APPLICABLE, workGraph: NOT_APPLICABLE, decisions: NOT_APPLICABLE },

  // cory-engine's ExecutionAgent single autonomous actions (autonomousEngine.ts) —
  // routine, single-action, no connected evidence mechanism.
  agent_action: { visualProof: NOT_APPLICABLE, workGraph: NOT_APPLICABLE, decisions: NOT_APPLICABLE },

  // Cory-originated strategic tickets — human-judgment tickets by name; no confirmed
  // subtask/work-graph usage for this specific type (vs. strategic_initiative below,
  // which explicitly does).
  strategic: { visualProof: NOT_APPLICABLE, workGraph: NOT_APPLICABLE, decisions: EXPECTED },

  // All six created through coryInitiatives.ts's createStrategicInitiative (directly
  // for strategic_initiative; via coryEvolution.ts's proposeAgentMerge/
  // proposeAgentCreation/proposeArchitectureChange and runEvolutionCycle()'s typeMap
  // for the other five) — sets status:'in_review' and sends a human approval email
  // (decision-gated by design) and creates subtasks via createSubTasks (multi-step,
  // work-graph-shaped).
  strategic_initiative: { visualProof: NOT_APPLICABLE, workGraph: EXPECTED, decisions: EXPECTED },
  ai_optimization: { visualProof: NOT_APPLICABLE, workGraph: EXPECTED, decisions: EXPECTED },
  agent_restructure: { visualProof: NOT_APPLICABLE, workGraph: EXPECTED, decisions: EXPECTED },
  agent_creation: { visualProof: NOT_APPLICABLE, workGraph: EXPECTED, decisions: EXPECTED },
  workflow_redesign: { visualProof: NOT_APPLICABLE, workGraph: EXPECTED, decisions: EXPECTED },
  system_automation: { visualProof: NOT_APPLICABLE, workGraph: EXPECTED, decisions: EXPECTED },

  // CEO directive, human-reviewed by design (ticketOrchestrator.createDirectiveTicket).
  company_directive: { visualProof: NOT_APPLICABLE, workGraph: NOT_APPLICABLE, decisions: EXPECTED },

  // Literally named "decision" (ticketOrchestrator.createWorkforceTicket).
  // workforceTicketAutoResolver auto-closes on a re-checked metric, but a human can
  // still override.
  workforce_decision: { visualProof: NOT_APPLICABLE, workGraph: NOT_APPLICABLE, decisions: EXPECTED },

  // Explicit multi-stage build-step tracking (ticketOrchestrator.createBPOSTicket's
  // own stage/componentId fields) — auto status-transitioned by the orchestrator, not
  // human-approval-gated.
  bpos_execution: { visualProof: NOT_APPLICABLE, workGraph: EXPECTED, decisions: NOT_APPLICABLE },

  // Reese Phase 1 — conversational student support. No decision-recording path exists
  // for these today.
  student_support: { visualProof: NOT_APPLICABLE, workGraph: NOT_APPLICABLE, decisions: NOT_APPLICABLE },

  // Reese Phase 2 — the ONE real, confirmed evidence_artifacts writer today
  // (reeseOutreachFollowUpService.closeWithEvidence, artifact types 'receipt'/'log').
  reese_autonomous_outreach: { visualProof: EXPECTED, workGraph: NOT_APPLICABLE, decisions: NOT_APPLICABLE },
};

/**
 * Pure classification — no I/O. Precedence (first match wins):
 *   1. created_by_type === 'human' -> all three 'expected'. A human manually filing a
 *      ticket via the admin UI could reasonably attach a screenshot, need a recorded
 *      decision, or track a multi-step breakdown on ANY ticket type they create;
 *      defaulting a human-filed ticket to "not applicable" would recreate the same
 *      kind of dishonesty in the other direction.
 *   2. source === 'security' -> visualProof and workGraph forced 'not_applicable'
 *      (a source-code security finding has no visual/multi-agent-coordination
 *      dimension); decisions still computed from the type table. Grounded in all 8
 *      services/agents/security/*Agent.ts files setting source:'security' literally
 *      and consistently.
 *   3. Otherwise: TYPE_DEFAULTS[type], or all-'not_applicable' for an unrecognized
 *      type — deliberately conservative so a newly added TicketType doesn't
 *      retroactively render as a "missing evidence" gap before anyone has classified
 *      it. Revisit TYPE_DEFAULTS when a new TicketType is added.
 */
export function getEvidenceExpectations(input: ClassifiableTicket): TicketEvidenceExpectations {
  if (input.created_by_type === 'human') {
    return { visualProof: EXPECTED, workGraph: EXPECTED, decisions: EXPECTED };
  }

  const base = TYPE_DEFAULTS[input.type as TicketType] ?? {
    visualProof: NOT_APPLICABLE,
    workGraph: NOT_APPLICABLE,
    decisions: NOT_APPLICABLE,
  };

  if (input.source === 'security') {
    return { visualProof: NOT_APPLICABLE, workGraph: NOT_APPLICABLE, decisions: base.decisions };
  }

  return base;
}

/**
 * DB-backed convenience wrapper for route handlers: looks up just the 3 columns the
 * classifier needs. Throws `Ticket <id> not found` on a missing ticket — the same
 * message shape `generateTicketSummary()` already uses.
 */
export async function getTicketEvidenceExpectations(ticketId: string): Promise<TicketEvidenceExpectations> {
  const ticket = await Ticket.findByPk(ticketId, {
    attributes: ['type', 'source', 'created_by_type'],
  });
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);
  // No `any` cast needed: the `if (!ticket) throw` guard above narrows `ticket` from
  // `Ticket | null` to `Ticket`, whose class declares typed `type`/`source`/
  // `created_by_type` fields (models/Ticket.ts declare type/source/created_by_type).
  return getEvidenceExpectations({
    type: ticket.type,
    source: ticket.source,
    created_by_type: ticket.created_by_type,
  });
}
