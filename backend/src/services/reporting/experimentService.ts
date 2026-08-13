// ─── Experiment Service ───────────────────────────────────────────────────
// Converts insights into experiment proposals and auto-creates tickets.

import { ExperimentProposal, ReportingInsight } from '../../models';
import { logEvent } from '../ledgerService';
import { createTicket } from '../ticketService';
import type { ExperimentType, ExperimentStatus, ExperimentPriority } from '../../models/ExperimentProposal';
import type { TicketPriority } from '../../models/Ticket';

// ─── Propose Experiment ───────────────────────────────────────────────────

export async function proposeExperiment(insight: any): Promise<any> {
  const proposal = await ExperimentProposal.create({
    title: `Experiment: ${insight.title}`,
    hypothesis: generateHypothesis(insight),
    proposed_by_agent: insight.source_agent || 'ExperimentRecommendationAgent',
    department: insight.department,
    entity_type: insight.entity_type,
    entity_id: insight.entity_id,
    experiment_type: inferExperimentType(insight) as ExperimentType,
    status: 'proposed',
    expected_impact: insight.evidence || {},
    success_criteria: { improvement_threshold: 0.1 },
    confidence: insight.confidence || 0.5,
    priority: inferPriority(insight.final_score) as ExperimentPriority,
  });

  await logEvent('experiment_proposed', 'ExperimentRecommendationAgent', 'experiment', proposal.id, {
    insight_id: insight.id,
    title: proposal.title,
  });

  return proposal;
}

function generateHypothesis(insight: any): string {
  switch (insight.insight_type) {
    case 'anomaly':
      return `If we address the anomaly in ${insight.entity_type}, we expect to restore performance to baseline levels.`;
    case 'pattern':
      return `If we replicate the successful pattern found in ${insight.title}, we expect similar improvements across other areas.`;
    case 'opportunity':
      return `If we pursue this opportunity, we expect to generate additional value as indicated by the evidence.`;
    default:
      return `Testing the improvement suggested by insight: ${insight.title}`;
  }
}

function inferExperimentType(insight: any): string {
  if (insight.insight_type === 'pattern') return 'ab_test';
  if (insight.insight_type === 'opportunity') return 'strategy_shift';
  if (insight.entity_type === 'campaign') return 'ab_test';
  return 'process_change';
}

function inferPriority(finalScore: number): string {
  if (finalScore >= 0.8) return 'critical';
  if (finalScore >= 0.6) return 'high';
  if (finalScore >= 0.4) return 'medium';
  return 'low';
}

// ─── Ticket Creation ──────────────────────────────────────────────────────

// ProofDesk Work Ledger (Milestone 6 audit fix, 2026-08-06): previously called
// `Ticket.create()` directly, which bypassed ticketService.createTicket()'s ledger
// emission entirely (found during the ProofDesk M6 acceptance-criteria audit —
// criterion 1's ledger-coverage check) — every experiment-driven ticket was
// permanently invisible to the work ledger, with no way to ever backfill it after
// the fact. Also fixes a second, independently-found bug in the same line: the old
// `status: 'open'` value is not a member of TicketStatus (`backlog | todo |
// in_progress | in_review | done | cancelled` — see Ticket.ts) and was only
// reachable via an `as any` cast; it silently produced tickets with an
// application-unrecognized status that ticketManagementAgent.ts's `status: 'todo'`
// auto-dispatch query would never pick up. Routing through createTicket() gets both
// the ledger emission and a valid status (`todo`, matching the auto-dispatch query
// and the original "ready for an agent to pick up" intent) for free, with identical
// dedup/priority/metadata behavior to every other real ticket-creation path in this
// repo.
export async function createExperimentTicket(proposalId: string): Promise<any> {
  const proposal = await ExperimentProposal.findByPk(proposalId);
  if (!proposal) throw new Error('Experiment proposal not found');

  const ticket = await createTicket({
    title: proposal.title,
    description: proposal.hypothesis || '',
    type: 'strategic',
    priority: proposal.priority as TicketPriority,
    status: 'todo',
    source: 'reporting_agent',
    created_by_type: 'agent',
    created_by_id: 'ExperimentRecommendationAgent',
    metadata: { experiment_proposal_id: proposal.id },
  });

  await proposal.update({ ticket_id: ticket.id });

  await logEvent('experiment_ticket_created', 'ExperimentRecommendationAgent', 'ticket', ticket.id, {
    experiment_proposal_id: proposal.id,
  });

  return ticket;
}

// ─── CRUD Operations ──────────────────────────────────────────────────────

export async function listExperiments(filters: {
  status?: string;
  department?: string;
  page?: number;
  limit?: number;
}): Promise<{ rows: any[]; count: number }> {
  const where: any = {};
  if (filters.status) where.status = filters.status;
  if (filters.department) where.department = filters.department;

  const page = filters.page || 1;
  const limit = filters.limit || 20;

  return ExperimentProposal.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });
}

export async function updateExperimentStatus(
  id: string,
  status: ExperimentStatus,
  results?: Record<string, any>,
): Promise<void> {
  const update: any = { status, updated_at: new Date() };
  if (results) update.results = results;
  await ExperimentProposal.update(update, { where: { id } });
}

export async function approveExperiment(id: string): Promise<any> {
  await updateExperimentStatus(id, 'approved');
  return createExperimentTicket(id);
}
