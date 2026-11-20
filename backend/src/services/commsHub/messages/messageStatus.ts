import { createHash } from 'crypto';
import type { CommsHubMessageStatus } from '../../../models/CommsHubMessage';

/**
 * The message status machine and the approval hash (CH6.2). PURE: no I/O, no clock, no throw.
 *
 * STATUSES (the brief's eight, plus needs_approval: an AI draft ready for the organizer):
 *   draft -> needs_approval        submitted for approval
 *   needs_approval -> approved     approved (the hash of exactly what was approved is recorded)
 *   needs_approval -> draft        rejected: back to editing
 *   approved -> scheduled          given a send time ("send now" is a send time of now)
 *   approved | scheduled -> needs_approval   the approval was undone, or VOIDED by a change to a
 *                                  draft, a destination or the send time
 *   scheduled -> sending           the delivery worker claimed it
 *   sending -> sent | partially_failed | failed   the worker's result across destinations
 *   partially_failed | failed -> sending          retry (only the destinations that did not succeed)
 *   partially_failed | failed -> needs_approval   edited after a failed send: the approval is voided and
 *                                  the changed message is approved again before any retry
 *   any not-yet-finished status -> cancelled      (not while sending: the worker finishes the attempt)
 * sent and cancelled are final. A status to itself is not a transition and is refused, so a caller
 * can never mistake a no-op for progress.
 */
export const MESSAGE_STATUSES: readonly CommsHubMessageStatus[] = ['draft', 'needs_approval', 'approved', 'scheduled', 'sending', 'sent', 'partially_failed', 'failed', 'cancelled'];

const ALLOWED: Readonly<Record<CommsHubMessageStatus, readonly CommsHubMessageStatus[]>> = {
  draft: ['needs_approval', 'cancelled'],
  needs_approval: ['approved', 'draft', 'cancelled'],
  approved: ['scheduled', 'needs_approval', 'cancelled'],
  scheduled: ['sending', 'needs_approval', 'cancelled'],
  sending: ['sent', 'partially_failed', 'failed'],
  partially_failed: ['sending', 'needs_approval', 'cancelled'],
  failed: ['sending', 'needs_approval', 'cancelled'],
  sent: [],
  cancelled: [],
};

export type TransitionResult = { ok: true } | { ok: false; reason: string };

export function transition(from: CommsHubMessageStatus, to: CommsHubMessageStatus): TransitionResult {
  if (!ALLOWED[from]) return { ok: false, reason: `unknown status "${from}"` };
  if (!(MESSAGE_STATUSES as readonly string[]).includes(to)) return { ok: false, reason: `unknown status "${to}"` };
  if (from === to) return { ok: false, reason: `already ${from}` };
  if (ALLOWED[from].includes(to)) return { ok: true };
  if (ALLOWED[from].length === 0) return { ok: false, reason: `a ${from} message cannot change` };
  return { ok: false, reason: `a ${from} message cannot become ${to}` };
}

/**
 * Statuses in which an approval is in force, so a change to the content voids it: approved and
 * scheduled, and after a failed or partly failed send (a retry runs under that approval). Not while
 * sending: the worker finishes the attempt first.
 */
export const APPROVED_STATUSES: readonly CommsHubMessageStatus[] = ['approved', 'scheduled', 'partially_failed', 'failed'];

/** What an approval covers: the exact drafts, destinations and send time. */
export interface ApprovalContent {
  drafts: Array<{ channel: string; title: string | null; body: string }>;
  destinations: Array<{ channel: string; target_type: string; target_id: string }>;
  /**
   * The send time, or null for "send now" (as soon as approved). CONVENTION: "send now" keeps send_at
   * NULL for the life of the message (the worker treats null as due); scheduling never writes it
   * (approvals.scheduleMessage), so an approval cannot void itself.
   */
  send_at: Date | null;
}

/**
 * SHA-256 over a canonical form of the content: drafts and destinations sorted, so neither the
 * order rows were read in nor key order can change the hash; text exactly as written (a changed
 * space is a changed message); the send time to the minute (the worker sends on minute ticks).
 */
export function approvalHash(c: ApprovalContent): string {
  const drafts = [...c.drafts]
    .map((d) => [d.channel, d.title ?? '', d.body])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const destinations = [...c.destinations]
    .map((d) => [d.channel, d.target_type, d.target_id].join('|'))
    .sort();
  const sendAt = c.send_at ? new Date(Math.floor(c.send_at.getTime() / 60_000) * 60_000).toISOString() : 'on-approval';
  return createHash('sha256').update(JSON.stringify({ v: 1, drafts, destinations, send_at: sendAt })).digest('hex');
}

/** Why an approval in force was voided (recorded on the approval row). */
export type VoidReason = 'draft_changed' | 'destinations_changed' | 'send_time_changed' | 'undone' | 'cancelled';
