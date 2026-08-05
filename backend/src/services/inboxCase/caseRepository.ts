import { randomUUID } from 'crypto';
import InboxCase from '../../models/InboxCase';
import InboxCaseItem from '../../models/InboxCaseItem';
import InboxCaseQuestion from '../../models/InboxCaseQuestion';
import InboxCaseAction from '../../models/InboxCaseAction';
import { CaseMode, CaseState } from '../../types/inboxCase';
import { assertTransition, assertReopen } from './caseStateMachine';
import { logCaseEvent } from './caseEventLog';
import { ensureCaseTicket, syncTicketForCase } from './caseTicketService';

// Thin persistence + transition-safe mutation layer shared by every case
// service/controller. Nothing here talks to Gmail/Basecamp/AI — this is
// pure Postgres access plus state-machine enforcement, so it can be unit
// tested without mocking any external provider.

export interface OpenCaseInput {
  title: string;
  mode: CaseMode;
  normalized_query: string;
  source_query: Record<string, unknown>;
  opened_by: string;
}

export async function openCase(input: OpenCaseInput): Promise<InboxCase> {
  const correlation_id = randomUUID();
  const created = await InboxCase.create({
    title: input.title,
    mode: input.mode,
    normalized_query: input.normalized_query,
    state: 'DISCOVERING',
    source_query: input.source_query,
    opened_by: input.opened_by,
    opened_at: new Date(),
    reopen_count: 0,
    correlation_id,
  } as any);

  await logCaseEvent({
    case_id: created.id,
    event_type: 'case_discovery_started',
    actor_type: 'admin',
    actor_id: input.opened_by,
    new_state: 'DISCOVERING',
    details: { mode: input.mode, query: input.normalized_query },
    correlation_id,
  });

  // Best-effort — a ticket-board sync failure must never block opening a
  // case. Ali: "All work should be done in a ticket by the agents."
  await ensureCaseTicket(created.id, input.title, input.mode, input.opened_by);

  return created;
}

export async function getCaseOrThrow(caseId: string): Promise<InboxCase> {
  const found = await InboxCase.findByPk(caseId);
  if (!found) {
    const err: any = new Error(`Case ${caseId} not found`);
    err.error_class = 'CaseNotFoundError';
    err.statusCode = 404;
    throw err;
  }
  return found;
}

export async function getCaseWithChildren(caseId: string) {
  const found = await getCaseOrThrow(caseId);
  const [items, questions, actions] = await Promise.all([
    InboxCaseItem.findAll({ where: { case_id: caseId }, order: [['occurred_at', 'DESC']] }),
    InboxCaseQuestion.findAll({ where: { case_id: caseId }, order: [['created_at', 'ASC']] }),
    InboxCaseAction.findAll({ where: { case_id: caseId }, order: [['created_at', 'ASC']] }),
  ]);
  return { case: found, items, questions, actions };
}

export interface TransitionOptions {
  actor_type: 'admin' | 'system' | 'ai';
  actor_id: string;
  event_type: string;
  details?: Record<string, unknown>;
}

// The ONLY function allowed to write InboxCase.state. Every caller goes
// through this so an invalid transition is always a 409 + audit event
// instead of a silent state write.
export async function transitionCase(caseId: string, to: CaseState, opts: TransitionOptions): Promise<InboxCase> {
  const found = await getCaseOrThrow(caseId);
  const from = found.state;
  assertTransition(from, to);

  await found.update({ state: to, updated_at: new Date() });

  await logCaseEvent({
    case_id: caseId,
    event_type: opts.event_type,
    actor_type: opts.actor_type,
    actor_id: opts.actor_id,
    previous_state: from,
    new_state: to,
    details: opts.details ?? {},
    correlation_id: found.correlation_id,
  });

  // Best-effort — keeps the Tickets board in sync with every case state
  // change, from whichever service triggered it, without each of those
  // services needing to know tickets exist at all.
  await syncTicketForCase(caseId, to);

  return found;
}

// Answering an individual question (inboxCaseActionController.ts::handleAnswerQuestion)
// never itself decides case state — it only ever updates the question. Without
// this check, the LAST open question being answered would leave the case
// stuck in NEEDS_ALI forever (nothing else re-evaluates "are there still
// blocking questions?"), so the case would never surface a Plan step and any
// Close attempt would fail with no visible next action. Call this right
// after marking a question ANSWERED.
export async function maybeAdvanceFromNeedsAli(caseId: string, actorId: string): Promise<void> {
  const found = await getCaseOrThrow(caseId);
  if (found.state !== 'NEEDS_ALI') return;

  const stillOpen = await InboxCaseQuestion.count({ where: { case_id: caseId, status: 'OPEN' } });
  if (stillOpen > 0) return;

  await transitionCase(caseId, 'READY_TO_PLAN', {
    actor_type: 'system',
    actor_id: actorId,
    event_type: 'case_ready_to_plan_after_last_question_answered',
  });
}

export async function reopenCase(caseId: string, opts: TransitionOptions & { reason: string }): Promise<InboxCase> {
  const found = await getCaseOrThrow(caseId);
  const from = found.state;
  assertReopen(from);

  await found.update({
    state: 'REOPENED',
    reopen_count: found.reopen_count + 1,
    closed_at: null,
    updated_at: new Date(),
  });

  await logCaseEvent({
    case_id: caseId,
    event_type: 'case_reopened',
    actor_type: opts.actor_type,
    actor_id: opts.actor_id,
    previous_state: from,
    new_state: 'REOPENED',
    details: { reason: opts.reason, ...opts.details },
    correlation_id: found.correlation_id,
  });

  // The prior ticket may already be terminal (`done`) — createTicket's own
  // dedup only matches non-terminal tickets, so this opens a FRESH ticket
  // for the reopened work rather than trying to un-terminate the old one.
  await ensureCaseTicket(caseId, found.title, found.mode, opts.actor_id);

  // Reopen always lands the case back in ASSESSING — the prior assessment
  // is stale by definition once new activity triggered the reopen.
  return transitionCase(caseId, 'ASSESSING', {
    actor_type: 'system',
    actor_id: 'case_reopen_flow',
    event_type: 'case_reassessing_after_reopen',
  });
}
