import type { DecisionRowView, HandoffTrigger } from './types';

/**
 * The packet's `escalation_reason`: EVERY trigger that asked for this handoff
 * (Phase 5 T501, the Phase 5 packet's 8A). PURE.
 *
 * A handoff row is one per person per brand while open, so a second trigger —
 * the human-review deferral beside a commercial one in the same decision, a
 * reply, an operator's routing rule — lands on the row that is already there.
 * In Phase 4 that second reason survived only as an overlay somewhere else in
 * the packet; the person reading it could not see that a review was also asked
 * for. Now each trigger is an entry here, deduplicated on (source, queue,
 * reason): the same trigger replayed is one entry, and two different triggers
 * that happen to share a reason string are still two.
 *
 * Ids and reason strings only — never an address, never a message body. The
 * writer re-runs `assertPacketCarriesNoAddress` on every merged packet.
 */

export interface EscalationTrigger {
  source: string;
  /** The queue the trigger ASKED for; the row keeps the queue it was opened in. */
  queue: string;
  reason: string;
  decision_id: string | null;
  decision_reason: string | null;
  at: string;
}

export function escalationEntry(trigger: HandoffTrigger, decision: DecisionRowView | null, at: Date): EscalationTrigger {
  return {
    source: trigger.source,
    queue: trigger.owner_queue,
    reason: trigger.reason,
    decision_id: decision?.id ?? null,
    decision_reason: decision?.reason ?? null,
    at: at.toISOString(),
  };
}

const sameTrigger = (a: EscalationTrigger, b: EscalationTrigger): boolean =>
  a.source === b.source && a.queue === b.queue && a.reason === b.reason;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * A packet's triggers as a list. A Phase 4 packet carried ONE object, not a
 * list; it is read as that list's single entry (its queue is the row's queue,
 * its time the packet's build time), so a row written before T501 still
 * accepts a second trigger without losing its first.
 */
export function escalationTriggersOf(packet: Record<string, unknown>): EscalationTrigger[] {
  const raw = packet.escalation_reason;
  if (Array.isArray(raw)) return raw as EscalationTrigger[];
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return [{
      source: str(o.source) ?? 'unknown',
      queue: str(packet.owner_queue) ?? 'unknown',
      reason: str(o.reason) ?? 'unknown',
      decision_id: str(o.decision_id),
      decision_reason: str(o.decision_reason),
      at: str(packet.built_at) ?? '',
    }];
  }
  return [];
}

export interface WithTriggerResult {
  packet: Record<string, unknown>;
  appended: boolean;
  count: number;
}

/** The packet with `entry` recorded, or the packet untouched when that trigger is already on it. */
export function withEscalationTrigger(packet: Record<string, unknown>, entry: EscalationTrigger): WithTriggerResult {
  const current = escalationTriggersOf(packet);
  if (current.some((t) => sameTrigger(t, entry))) return { packet, appended: false, count: current.length };
  const next = [...current, entry];
  return { packet: { ...packet, escalation_reason: next }, appended: true, count: next.length };
}
