/**
 * Cory Strategic Initiative Service
 *
 * Creates and manages strategic initiatives that are tracked through
 * the ticket system. Each initiative generates a parent ticket with
 * automatic subtask creation.
 */

import { randomBytes } from 'crypto';
import StrategicInitiative, { type InitiativeType, type InitiativeStatus } from '../../models/StrategicInitiative';
import { createTicket, createSubTasks, updateTicketStatus, addTicketComment } from '../ticketService';
import AgentTask from '../../models/AgentTask';
import { logAiEvent } from '../aiEventService';
import { Op } from 'sequelize';
import { getTicketCreatorAdminUserId } from '../agentBlueprint/ticketCreatorIdentitySeed';
import { sendTicketApprovalEmail } from '../emailService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateInitiativeInput {
  title: string;
  description: string;
  initiative_type: InitiativeType;
  priority?: string;
  source_decision_id?: string;
  involved_departments?: string[];
  involved_agents?: string[];
  strategic_priority?: string;
  expected_impact?: Record<string, any>;
  subtasks?: Array<{ title: string; effort?: string }>;
}

/**
 * Normalizes a strategic-initiative title for dedup comparison so a volatile embedded
 * number (a duration, a percentage, a count) never defeats the dedup check below and
 * spawns a fresh row forever for the SAME underlying condition. Root cause: several of
 * coryEvolution.ts's finding-generators bake a live-changing measurement directly into
 * the title string — detectAgentPerformanceIssues()'s `"${agent} is slow
 * (${ms/1000}s avg)"` and `"${agent} has ${rate}% error rate"`, and
 * detectWorkflowInefficiencies()'s `"${dept} department triggered ${count} alerts in
 * 24h"` and `"${n} agent tasks stale for 48+ hours"` — so an exact-title match (the
 * dedup's only comparison before this fix) never matches two observations of the same
 * still-true condition taken hours or days apart. Confirmed live in production
 * (2026-08-15): 282 of 350 stuck `proposed` rows were exactly this — 201
 * "CampaignQAAgent is slow" rows differing only by the reported duration, 54
 * "OpenclawLearningOptimizationAgent has N% error rate" rows differing only by the
 * percentage, and 27 more across 8 "N department triggered N alerts"/"is in error
 * state" clusters.
 *
 * Deliberately targeted, not generic NLP: each replacement below corresponds to one
 * specific, verified volatile-number pattern in this codebase's actual title
 * templates, not a speculative catch-all. A title with none of these patterns
 * (the common case — most findings have static titles) is returned unchanged, so two
 * genuinely different findings never collide just because they both contain a number.
 */
export function normalizeInitiativeDedupTitle(title: string): string {
  return title
    .replace(/\d+(\.\d+)?s avg/gi, 'Ns avg')
    .replace(/\d+%/g, 'N%')
    .replace(/\d+ alerts/gi, 'N alerts')
    .replace(/\d+ agent tasks/gi, 'N agent tasks');
}

export interface InitiativeSummary {
  id: string;
  title: string;
  initiative_type: InitiativeType;
  priority: string;
  status: InitiativeStatus;
  ticket_id: string | null;
  involved_departments: string[] | null;
  involved_agents: string[] | null;
  created_by: string;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Create Initiative + Ticket
// ---------------------------------------------------------------------------

/**
 * Create a strategic initiative and its tracking ticket with subtasks.
 * This is the primary integration point between CoryBrain and the ticket system.
 */
export async function createStrategicInitiative(input: CreateInitiativeInput): Promise<StrategicInitiative> {
  // Dedup: compare against every currently-ACTIVE initiative's NORMALIZED title, not
  // an exact string match (see normalizeInitiativeDedupTitle() above for why). The
  // active-row set is inherently small — the terminal-state fix (this same file,
  // approveInitiative/rejectInitiative/completeInitiative + ticketReplyService.ts's
  // syncInitiative()) plus the one-time historical consolidation this fix shipped
  // alongside keep it bounded to roughly the genuinely-distinct conditions, not an
  // unbounded backlog — so one findAll + an in-process comparison stays simple and
  // fully unit-testable instead of adding a DB-side normalized/indexed column for a
  // targeted fix at this scope.
  const activeInitiatives = await StrategicInitiative.findAll({
    where: { status: { [Op.notIn]: ['completed', 'cancelled'] } },
  });
  const normalizedInputTitle = normalizeInitiativeDedupTitle(input.title);
  const existing = activeInitiatives.find(
    (i) => normalizeInitiativeDedupTitle(i.title) === normalizedInputTitle,
  );
  if (existing) return existing;

  // 1. Create the strategic initiative record FIRST — ticket_id is filled in once the
  // ticket exists below. Creating the initiative before its ticket lets the ticket
  // carry a real entity_type/entity_id back to this row, the same linkage
  // workforceAgentRuntime.ts's mirrorTicket() already uses for the AI Workforce's
  // proposed_agent_action tickets — and what ticketReplyService.ts's syncInitiative()
  // reads on the way back once a human replies to the approval email below.
  const initiative = await StrategicInitiative.create({
    title: input.title,
    description: input.description,
    initiative_type: input.initiative_type,
    priority: input.priority || 'medium',
    source_decision_id: input.source_decision_id || null,
    involved_departments: input.involved_departments || null,
    involved_agents: input.involved_agents || null,
    ticket_id: null,
    created_by: 'CoryBrain',
    status: 'proposed',
    strategic_priority: input.strategic_priority || null,
    expected_impact: input.expected_impact || null,
  });

  // 2. Create the parent ticket in the ticket system. Starts at 'in_review' (not the
  // previous 'backlog') carrying a one-time reply token in metadata — CoryBrain's
  // strategic initiatives now go through the same real human-in-the-loop path the AI
  // Workforce Marketing director already uses in production (runDirectorProposal /
  // mirrorTicket in workforceAgentRuntime.ts): a human approves or rejects by
  // replying to the approval email sent below, and THAT reply is what finally lets
  // this initiative reach a terminal state (completed/cancelled) via
  // ticketReplyService.ts's syncInitiative(). Before this fix, nothing in the
  // codebase ever moved a strategic_initiatives row to completed/cancelled, so the
  // dedup check above blocked the same finding from ever being re-raised, forever,
  // once it had fired once.
  // Agent Alias & Identity Fix (forward-fix) — stamp CoryBrain's real AdminUser
  // identity on the assignee fields going forward, without touching
  // created_by_type/created_by_id.
  const coryBrainAdminUserId = await getTicketCreatorAdminUserId('CoryBrain');
  const replyToken = randomBytes(4).toString('hex');
  // Compensating action, not a transaction: the initiative row above is already
  // committed by the time this runs. If createTicket() (a real DB write) or the
  // ticket_id backfill below throws, an untouched initiative would be left forever
  // at status:'proposed'/ticket_id:null — invisible (no ticket, no email) yet still
  // blocking the dedup check at the top of this function exactly like the bug this
  // whole fix exists to close. Cancelling it here on failure means the SAME finding
  // is retryable on the next evolution cycle instead of silently wedged. The caller
  // (coryEvolution.ts's runEvolutionCycle) already treats a thrown error here as
  // non-fatal for one finding and continues to the next, so rethrowing is safe.
  let ticket;
  try {
    ticket = await createTicket({
      title: `[Initiative] ${input.title}`,
      description: input.description,
      status: 'in_review',
      type: input.initiative_type as any, // Extended ticket types
      priority: (input.priority as any) || 'medium',
      source: 'cory:evolution',
      created_by_type: 'cory',
      created_by_id: 'CoryBrain',
      entity_type: 'strategic_initiative',
      entity_id: initiative.id,
      ...(coryBrainAdminUserId ? { assigned_to_type: 'ai_staff' as const, assigned_to_id: coryBrainAdminUserId } : {}),
      metadata: {
        initiative_type: input.initiative_type,
        involved_departments: input.involved_departments || [],
        involved_agents: input.involved_agents || [],
        strategic_priority: input.strategic_priority || input.priority || 'medium',
        created_by: 'cory',
        reply_token: replyToken,
      },
      confidence: 0.8,
      estimated_effort: 'large',
    });
    await initiative.update({ ticket_id: ticket.id });
  } catch (err) {
    console.warn(
      `[coryInitiatives] Ticket creation failed for initiative ${initiative.id} — cancelling it so "${input.title}" is retryable on the next evolution cycle instead of stuck forever:`,
      (err as Error).message,
    );
    await initiative.update({ status: 'cancelled' }).catch(() => {
      // Genuinely nothing more this function can do if even the compensating write
      // fails — logged above with enough context (initiative id, title) for manual
      // recovery. Rethrowing the original error below still surfaces the failure.
    });
    throw err;
  }

  // Best-effort — a failed email must never block the initiative/ticket/subtasks
  // that are already real and complete by this point. Matches mirrorTicket()'s own
  // contract in workforceAgentRuntime.ts: the ticket still exists and sits visibly at
  // 'in_review' on the board even if this notification side-channel fails; there is
  // no retry queue for it, same as the proven precedent.
  try {
    await sendTicketApprovalEmail({
      ticketId: ticket.id,
      replyToken,
      title: input.title,
      description: input.description,
      directorName: 'CoryBrain',
    });
  } catch (err) {
    console.warn(
      `[coryInitiatives] Approval email failed for initiative ${initiative.id} / ticket ${ticket.id}:`,
      (err as Error).message,
    );
  }

  // 3. Create subtask tickets
  if (input.subtasks && input.subtasks.length > 0) {
    // Agent Quality Cleanup, Item 4 — some subtask tickets shipped with
    // literally no description body, just a bare hardcoded title ("Validate
    // resolution", "Implement fix or optimization") with zero text
    // connecting it to what's actually being validated/implemented. The real
    // parent finding is already on hand right here as input.title/
    // input.description (the initiative this subtask belongs to) — grounded,
    // not fabricated: if that's the only real context available, the
    // description says exactly that ("this subtask belongs to investigation
    // X, which found Y"), nothing invented beyond it.
    await createSubTasks(
      ticket.id,
      input.subtasks.map(st => ({
        title: st.title,
        description: `Subtask of investigation: ${input.title}\n\n${input.description}`,
        type: 'task' as any,
        priority: (input.priority as any) || 'medium',
        source: 'cory:evolution',
        created_by_type: 'cory' as const,
        created_by_id: 'CoryBrain',
        estimated_effort: st.effort || 'medium',
        metadata: {
          initiative_id: initiative.id,
          initiative_type: input.initiative_type,
        },
      })),
    );
  }

  await logAiEvent('CoryBrain', 'INITIATIVE_CREATED', 'strategic_initiatives', initiative.id, {
    title: input.title,
    type: input.initiative_type,
    ticket_id: ticket.id,
    subtasks: input.subtasks?.length || 0,
    departments: input.involved_departments,
    agents: input.involved_agents,
  }).catch(() => {});

  return initiative;
}

// ---------------------------------------------------------------------------
// Initiative Management
// ---------------------------------------------------------------------------

export async function approveInitiative(initiativeId: string, reviewedBy: string): Promise<StrategicInitiative> {
  const initiative = await StrategicInitiative.findByPk(initiativeId);
  if (!initiative) throw new Error(`Initiative ${initiativeId} not found`);
  if (initiative.status !== 'proposed') throw new Error(`Initiative already ${initiative.status}`);

  await initiative.update({
    status: 'approved',
    updated_at: new Date(),
  });

  // Move parent ticket to in_progress. NOT 'todo': the ticket now starts life at
  // 'in_review' (see createStrategicInitiative above), and in_review -> todo is not a
  // valid transition in ticketService.ts's VALID_TRANSITIONS state machine (it would
  // throw "Invalid transition: in_review -> todo"). in_review -> in_progress is valid
  // and is also the more accurate status for "a human approved this, work proceeds."
  if (initiative.ticket_id) {
    await updateTicketStatus(initiative.ticket_id, 'in_progress', 'human', reviewedBy);
    await addTicketComment(initiative.ticket_id, `Initiative approved by ${reviewedBy}`, 'human', reviewedBy);
  }

  await logAiEvent('CoryBrain', 'INITIATIVE_APPROVED', 'strategic_initiatives', initiativeId, {
    reviewed_by: reviewedBy,
  }).catch(() => {});

  return initiative;
}

export async function rejectInitiative(initiativeId: string, reviewedBy: string, reason?: string): Promise<StrategicInitiative> {
  const initiative = await StrategicInitiative.findByPk(initiativeId);
  if (!initiative) throw new Error(`Initiative ${initiativeId} not found`);
  if (initiative.status !== 'proposed') throw new Error(`Initiative already ${initiative.status}`);

  await initiative.update({
    status: 'cancelled',
    updated_at: new Date(),
  });

  // Cancel parent ticket
  if (initiative.ticket_id) {
    await updateTicketStatus(initiative.ticket_id, 'cancelled', 'human', reviewedBy);
    if (reason) {
      await addTicketComment(initiative.ticket_id, `Rejected: ${reason}`, 'human', reviewedBy);
    }
  }

  return initiative;
}

export async function startInitiative(initiativeId: string): Promise<StrategicInitiative> {
  const initiative = await StrategicInitiative.findByPk(initiativeId);
  if (!initiative) throw new Error(`Initiative ${initiativeId} not found`);

  await initiative.update({
    status: 'in_progress',
    updated_at: new Date(),
  });

  // Move ticket to in_progress
  if (initiative.ticket_id) {
    await updateTicketStatus(initiative.ticket_id, 'in_progress', 'cory', 'CoryBrain').catch(() => {});
  }

  return initiative;
}

export async function completeInitiative(initiativeId: string): Promise<StrategicInitiative> {
  const initiative = await StrategicInitiative.findByPk(initiativeId);
  if (!initiative) throw new Error(`Initiative ${initiativeId} not found`);

  await initiative.update({
    status: 'completed',
    updated_at: new Date(),
  });

  // Mark ticket done
  if (initiative.ticket_id) {
    await updateTicketStatus(initiative.ticket_id, 'done', 'cory', 'CoryBrain').catch(() => {});
  }

  return initiative;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getActiveInitiatives(): Promise<StrategicInitiative[]> {
  return StrategicInitiative.findAll({
    where: { status: { [Op.notIn]: ['completed', 'cancelled'] } },
    order: [['created_at', 'DESC']],
    limit: 50,
  });
}

export async function getInitiativesByStatus(status: InitiativeStatus): Promise<StrategicInitiative[]> {
  return StrategicInitiative.findAll({
    where: { status },
    order: [['created_at', 'DESC']],
    limit: 50,
  });
}

export async function getInitiativeStats(): Promise<{
  total: number;
  proposed: number;
  approved: number;
  in_progress: number;
  completed: number;
  cancelled: number;
}> {
  // Use SQL GROUP BY instead of loading all rows into memory
  const rows = await StrategicInitiative.findAll({
    attributes: [
      'status',
      [StrategicInitiative.sequelize!.fn('COUNT', StrategicInitiative.sequelize!.col('id')), 'count'],
    ],
    group: ['status'],
    raw: true,
  }) as unknown as { status: string; count: string }[];

  const counts = { total: 0, proposed: 0, approved: 0, in_progress: 0, completed: 0, cancelled: 0 };
  for (const row of rows) {
    const n = parseInt(row.count, 10);
    counts.total += n;
    if (row.status in counts) (counts as any)[row.status] = n;
  }
  return counts;
}

export async function getRecentInitiatives(limit = 20): Promise<InitiativeSummary[]> {
  const initiatives = await StrategicInitiative.findAll({
    order: [['created_at', 'DESC']],
    limit,
  });

  return initiatives.map(i => ({
    id: i.id,
    title: i.title,
    initiative_type: i.initiative_type,
    priority: i.priority,
    status: i.status,
    ticket_id: i.ticket_id,
    involved_departments: i.involved_departments,
    involved_agents: i.involved_agents,
    created_by: i.created_by,
    created_at: i.created_at,
  }));
}
