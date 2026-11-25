/**
 * selfHealingBrief - the self-healing email-to-Ali brief (M4-T4).
 *
 * When the studio detects a defect it cannot resolve on its own (a stalled revise loop, a build
 * failure, a repeated gate failure), it composes a four-section brief for Ali - problem, why it
 * matters, the fix, what to do - and files it as a DRAFT.
 *
 * DRAFT-ONLY: the brief is enqueued through the existing outbound approval queue as
 * `pending_approval`; nothing is sent until a human approves it. This module never calls a provider.
 */
import { randomUUID } from 'crypto';
import { enqueueOutbound, type MayaOutboundQueueDeps, type OutboundEnqueueResult } from '../../maya/mayaOutboundQueue';

export interface DefectBrief {
  /** Stable key for this defect, so the same one does not draft twice (idempotency). */
  key: string;
  /** One-line defect title for the subject. */
  title: string;
  /** What is wrong. */
  problem: string;
  /** Why it matters (impact on the pursuit / the deadline / the client). */
  whyItMatters: string;
  /** The fix - what should change to resolve it. */
  fix: string;
  /** What Ali should do (the one action). */
  whatToDo: string;
  /** The gov delivery project this is about, when it is project-specific. */
  deliveryProjectId?: string | null;
}

function section(label: string, value: string | undefined): string {
  const v = (value ?? '').trim();
  return `${label}\n${v || '(not specified)'}\n`;
}

/**
 * Compose the brief. Pure: always emits all four sections (a missing field becomes "(not
 * specified)" rather than a dropped section), so a brief is never structurally incomplete.
 */
export function composeSelfHealingBrief(defect: DefectBrief): { subject: string; body: string } {
  const title = (defect.title || 'a defect in the gov proposal studio').trim();
  const subject = `[Gov Proposal Studio] Needs your call: ${title}`;
  const body = [
    section('PROBLEM', defect.problem),
    section('WHY IT MATTERS', defect.whyItMatters),
    section('THE FIX', defect.fix),
    section('WHAT TO DO', defect.whatToDo),
  ].join('\n');
  return { subject, body };
}

/**
 * File the brief as a DRAFT in the outbound approval queue (status pending_approval). Returns the
 * queue result. Idempotent on the defect key, so the same unresolved defect does not pile up drafts.
 * Nothing is sent here.
 */
export async function draftSelfHealingBrief(
  defect: DefectBrief,
  deps?: MayaOutboundQueueDeps,
): Promise<OutboundEnqueueResult> {
  const { subject, body } = composeSelfHealingBrief(defect);
  return enqueueOutbound({
    recipientRef: 'owner-ali',
    recipientAddress: 'ali@colaberry.com',
    recipientDisplay: 'Ali Muwwakkil',
    channel: 'email',
    subject,
    body,
    composedBy: 'gov-proposal-studio-self-heal',
    capability: 'gov_proposal_self_healing_brief',
    correlationId: randomUUID(),
    idempotencyKey: `gov-self-heal:${defect.deliveryProjectId ?? 'global'}:${defect.key}`,
  }, deps as MayaOutboundQueueDeps);
}
