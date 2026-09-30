import { PendingReliabilityConfirmation } from '../models/AgentManagerConversation';
import { declareReliabilityChange, getReliabilityStatus, restoreMetric } from './metricReliabilityService';
import { createTicket, updateTicketStatus, addTicketComment } from './ticketService';

/**
 * managerReliabilityIntentService — Reese Agentic AI Employee mission,
 * Checkpoint B's manager confirmation workflow. Scoped narrowly: detecting
 * ONLY reliability-declaration intent (QUARANTINE_METRIC/RESTORE_METRIC),
 * not the mission's full 12-intent classifier (ASK/INSTRUCT/CORRECT/
 * APPROVE/REJECT/COACH/SCHEDULE/ASSIGN_WORK/CHANGE_GOAL/...) — that's real,
 * separate, later scope (Capability 8), same deferral
 * agentManagerConversationService.ts's own header comment already names.
 *
 * Deliberately keyword-based, not an LLM classifier: false positives here
 * are harmless (they only ever produce a confirmation CARD, never a write —
 * a manager who didn't mean it just declines or ignores it), so a loose,
 * fast, fully deterministic and unit-testable heuristic is the right
 * tradeoff, not a liability. False negatives just mean the manager falls
 * back to whatever the eventual direct reliability-management UI offers —
 * not a safety gap, since nothing here is the ONLY path to declaring a
 * quarantine.
 *
 * Only `attendance` has a validated real keyword vocabulary today, because
 * it's the one source this checkpoint actually wired to the reliability
 * gate (learnerContextService.ts). Adding another real source here once it
 * has its own real consumer is a small, mechanical, low-risk follow-up —
 * not attempted here to avoid guessing at language patterns with no real
 * precedent to ground them in.
 */

interface SourceSystemDefinition {
  metricKey: string;
  keywords: string[];
}

const KNOWN_SOURCE_SYSTEMS: Record<string, SourceSystemDefinition> = {
  attendance: { metricKey: 'attendance.*', keywords: ['attendance', 'check-in', 'check in', 'checkin', 'check-ins'] },
};

const QUARANTINE_TRIGGER_PHRASES = [
  'is broken', "isn't working", 'is not working', "don't trust", 'do not trust', 'is unreliable',
  'is wrong', 'is incorrect', 'is down', 'is failing', 'has been missing', 'stopped working', 'quarantine',
];

const RESTORE_TRIGGER_PHRASES = [
  'is fixed', 'has been fixed', 'is working again', 'is back', 'is restored', 'is resolved', 'has been resolved', 'restore',
];

export interface DetectedReliabilityIntent {
  direction: 'quarantine' | 'restore';
  sourceSystem: string;
  metricKey: string;
  reason: string;
}

/** Pure, deterministic. Returns null when no known source-system keyword AND
 * directional trigger phrase both appear in the message. */
export function detectReliabilityIntent(messageText: string): DetectedReliabilityIntent | null {
  const lower = messageText.toLowerCase();

  for (const [sourceSystem, def] of Object.entries(KNOWN_SOURCE_SYSTEMS)) {
    const mentionsSource = def.keywords.some((kw) => lower.includes(kw));
    if (!mentionsSource) continue;

    if (QUARANTINE_TRIGGER_PHRASES.some((p) => lower.includes(p))) {
      return { direction: 'quarantine', sourceSystem, metricKey: def.metricKey, reason: messageText.trim() };
    }
    if (RESTORE_TRIGGER_PHRASES.some((p) => lower.includes(p))) {
      return { direction: 'restore', sourceSystem, metricKey: def.metricKey, reason: messageText.trim() };
    }
  }

  return null;
}

/**
 * The confirmation card text itself — restates what Reese understood,
 * defaults to global scope and says so explicitly (mission's "ask only for
 * materially missing scope" — the manager can correct scope in their next
 * message instead of a separate scope-negotiation turn), and states the
 * real effect before anything is written.
 */
export function buildConfirmationCardText(detected: DetectedReliabilityIntent): string {
  const action = detected.direction === 'quarantine' ? 'quarantine' : 'restore';
  const verb = detected.direction === 'quarantine' ? 'stop using' : 'resume using';
  return (
    `I understood: ${detected.sourceSystem} data reliability has changed — you said "${detected.reason}"\n\n` +
    `Here's what I'd do: ${action} the "${detected.sourceSystem}" metric, scoped globally (all cohorts/students) unless you tell me otherwise. ` +
    `Once confirmed, I'll ${verb} it in every assessment and message I generate until you tell me it's ${detected.direction === 'quarantine' ? 'fixed' : 'broken again'}.\n\n` +
    `Reply "confirm" to proceed, or tell me more (e.g. a specific cohort) and I'll ask again with the right scope.`
  );
}

export function toPendingConfirmation(detected: DetectedReliabilityIntent): PendingReliabilityConfirmation {
  return {
    direction: detected.direction,
    sourceSystem: detected.sourceSystem,
    metricKey: detected.metricKey,
    scopeType: 'global',
    scopeValue: null,
    reason: detected.reason,
    detectedAt: new Date().toISOString(),
  };
}

export type ConfirmationReplyVerdict = 'confirm' | 'cancel' | 'ambiguous';

const CONFIRM_WORDS = ['confirm', 'confirmed', 'yes', 'yep', 'yeah', 'correct', 'do it', "that's right", 'go ahead', 'proceed'];
const CANCEL_WORDS = ['cancel', 'no', 'nope', 'never mind', 'nevermind', 'stop', 'don\'t', 'do not'];

/** Pure, deterministic. A short reply matching a known confirm/cancel word
 * wins; anything else (including a longer message that changes the subject)
 * is ambiguous — the caller's job to decide what "ambiguous" means (this
 * slice treats it as an implicit cancel; see managerConversationReliabilityBridge). */
export function detectConfirmationReply(messageText: string): ConfirmationReplyVerdict {
  const lower = messageText.trim().toLowerCase();
  if (CONFIRM_WORDS.some((w) => lower === w || lower.startsWith(w + ' ') || lower.startsWith(w + '.') || lower.startsWith(w + '!'))) {
    return 'confirm';
  }
  if (CANCEL_WORDS.some((w) => lower === w || lower.startsWith(w + ' ') || lower.startsWith(w + '.') || lower.startsWith(w + '!'))) {
    return 'cancel';
  }
  return 'ambiguous';
}

/**
 * Real ProofDesk incident linkage — mission requirement: "Create/link an
 * operational incident or ProofDesk ticket." Created with
 * created_by_type:'human' (the confirming manager's real email as the
 * actor id, matching the "email is the reliable identity" convention this
 * whole conversation surface already uses), so enforceReportsToGate()
 * bypasses the chain-of-command check entirely — a human filing a
 * governance ticket needs no agent reports-to resolution. Starts
 * 'in_progress' (not the default 'backlog') so a later direct transition
 * to 'done' on restoration is a real, valid state-machine move
 * (backlog -> done is not).
 */
async function createIncidentTicket(pending: PendingReliabilityConfirmation, confirmedByEmail: string): Promise<string> {
  const ticket = await createTicket({
    title: `Data reliability: ${pending.sourceSystem} quarantined`,
    description: pending.reason,
    type: 'data_reliability_incident',
    status: 'in_progress',
    priority: 'high',
    source: 'manager_report',
    created_by_type: 'human',
    created_by_id: confirmedByEmail,
    entity_type: 'metric_reliability',
    entity_id: `${pending.sourceSystem}:${pending.metricKey}:${pending.scopeType}:${pending.scopeValue ?? 'global'}`,
  });
  return ticket.id;
}

/**
 * Executes a confirmed pending declaration for real — the one place this
 * whole flow actually writes durable state. Restoration requires a real
 * evidence sentence; since a confirmed conversational restore has no
 * separate "recovery evidence" field, the pending record's own reason
 * (the manager's confirming message context) is reused as that evidence,
 * consistent with restoreMetric()'s own required-evidence contract.
 */
export async function applyConfirmedReliabilityChange(
  pending: PendingReliabilityConfirmation,
  confirmedByEmail: string,
): Promise<{ summary: string }> {
  const scope = { scopeType: pending.scopeType, scopeValue: pending.scopeValue };

  if (pending.direction === 'quarantine') {
    const incidentTicketId = await createIncidentTicket(pending, confirmedByEmail);
    await declareReliabilityChange({
      sourceSystem: pending.sourceSystem,
      metricKey: pending.metricKey,
      scope,
      status: 'quarantined',
      severity: 'high',
      reason: pending.reason,
      declaredBySource: 'manager_report',
      declaredByEmail: confirmedByEmail,
      incidentTicketId,
    });
    return { summary: `Done. ${pending.sourceSystem} is now quarantined — I'll exclude it from assessments and messages until you tell me it's restored. Tracking as a real ProofDesk ticket.` };
  }

  // Look up the existing record's real linked incident BEFORE restoreMetric()
  // mutates the row — there is no separate "which incident does this restore"
  // input from the conversation, so the registry's own current state is the
  // only honest source for it.
  const before = await getReliabilityStatus(pending.sourceSystem, pending.metricKey, scope);
  await restoreMetric({
    sourceSystem: pending.sourceSystem,
    metricKey: pending.metricKey,
    scope,
    recoveryEvidence: pending.reason,
    restoredByEmail: confirmedByEmail,
  });

  if (before.incidentTicketId) {
    try {
      await addTicketComment(before.incidentTicketId, `Restored: ${pending.reason}`, 'human', confirmedByEmail);
      await updateTicketStatus(before.incidentTicketId, 'done', 'human', confirmedByEmail);
    } catch {
      // A ticket-closure failure must never block the real reliability
      // restoration that already succeeded above — the registry state is
      // the source of truth; the ticket is a linked record of it, not the
      // other way around.
    }
  }

  return { summary: `Done. ${pending.sourceSystem} is restored — I'll use it normally again going forward.` };
}
