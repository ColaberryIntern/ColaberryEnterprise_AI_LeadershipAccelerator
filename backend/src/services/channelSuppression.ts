/**
 * Per-channel suppression. Plan §35 D-4.
 *
 * THE DEFECT. `processOptOut` accepts a channel and then suppresses GLOBALLY:
 * it sets `Lead.status = 'unsubscribed'` and every `CampaignLead` to `dnd`
 * whatever the channel was, and `checkLeadSendable` blocks on the mere
 * EXISTENCE of an `unsubscribe_events` row — ignoring its `channel` column
 * entirely, despite the table carrying a `(lead_id, channel)` index. So one SMS
 * STOP permanently ends that person's email too.
 *
 * That is backwards under the rule we operate on: consent is required for phone
 * and SMS, and email is permitted to everyone under CAN-SPAM's opt-out default.
 * Someone declining texts has not declined email, and today we treat them as if
 * they had.
 *
 * FORWARD-ONLY, AND THAT IS THE WHOLE SAFETY ARGUMENT. Existing rows were
 * written under global semantics: a person who texted STOP in June has a row
 * with `channel='sms'` and has been treated as fully unsubscribed ever since.
 * Reading those rows per-channel would silently make them email-eligible again
 * — re-opening a door someone closed, without asking, and at scale. §35 D-4 is
 * explicit: "only for opt-outs recorded after the change. Never retroactively
 * un-suppress anyone."
 *
 * So the cutoff below is not a tidiness detail. It is the difference between
 * fixing a bug and mailing people who told us to stop.
 */

export type SuppressibleChannel = 'email' | 'sms' | 'voice';

/**
 * Rows at or after this instant carry per-channel meaning. Rows before it are
 * read as global, exactly as they were written and exactly as they have been
 * enforced ever since.
 *
 * Set to the moment this shipped. NEVER move it earlier — that would
 * retroactively narrow historical opt-outs, which is the one thing D-4 forbids.
 */
export const PER_CHANNEL_SUPPRESSION_CUTOFF = new Date('2026-09-09T00:00:00Z');

/** An unsubscribe row, reduced to what the decision needs. */
export interface SuppressionEvent {
  channel: string | null;
  created_at: Date | string;
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

/**
 * A row written before the cutoff means "suppressed everywhere", whatever its
 * channel column says, because that is what it meant when it was written and
 * what the send path has enforced since.
 */
export function isLegacyGlobalEvent(
  event: SuppressionEvent,
  cutoff: Date = PER_CHANNEL_SUPPRESSION_CUTOFF,
): boolean {
  const at = toDate(event.created_at);
  // An unparseable timestamp is treated as legacy — the conservative reading,
  // since the alternative is narrowing a suppression we cannot date.
  if (Number.isNaN(at.getTime())) return true;
  return at.getTime() < cutoff.getTime();
}

/**
 * Channel values that have always meant "everything".
 *
 * `processOptOut` is called with an assortment of values, and anything it does
 * not recognise as a specific channel has always been recorded as-is. Treating
 * an unrecognised value as global is the safe reading: the alternative narrows a
 * suppression on the strength of a string nobody validated.
 */
const GLOBAL_CHANNELS = new Set(['all', 'any', '', 'global', 'unknown']);

export function isGlobalChannel(channel: string | null | undefined): boolean {
  const c = (channel ?? '').trim().toLowerCase();
  if (GLOBAL_CHANNELS.has(c)) return true;
  return !['email', 'sms', 'voice'].includes(c);
}

/**
 * Does this set of unsubscribe events block a send on `channel`?
 *
 * `channel` undefined means the caller did not say — every existing caller of
 * `checkLeadSendable` is in that position — and it keeps the old behaviour
 * exactly: ANY event blocks. Callers opt in to the narrower rule by naming a
 * channel, so nothing changes for a path that has not been reviewed.
 */
export function isSuppressedForChannel(
  events: readonly SuppressionEvent[],
  channel?: SuppressibleChannel,
  cutoff: Date = PER_CHANNEL_SUPPRESSION_CUTOFF,
): { suppressed: boolean; reason?: string } {
  if (events.length === 0) return { suppressed: false };

  // No channel named: the pre-existing contract. Any event blocks.
  if (!channel) {
    return { suppressed: true, reason: 'unsubscribe_event_exists' };
  }

  for (const event of events) {
    if (isLegacyGlobalEvent(event, cutoff)) {
      return { suppressed: true, reason: 'unsubscribe_event_exists_legacy_global' };
    }
    if (isGlobalChannel(event.channel)) {
      return { suppressed: true, reason: 'unsubscribe_event_all_channels' };
    }
    if ((event.channel ?? '').trim().toLowerCase() === channel) {
      return { suppressed: true, reason: `unsubscribe_event_${channel}` };
    }
  }

  return { suppressed: false };
}

/**
 * Should an opt-out on this channel set the GLOBAL lead status?
 *
 * Email and any global value: yes, unchanged — an email unsubscribe is the
 * primary meaning of `Lead.status = 'unsubscribed'` and narrowing it would be a
 * behaviour change nobody asked for.
 *
 * SMS and voice: no. That is the entire point. Their opt-out is recorded as an
 * event and revoked in the consent ledger, both of which are already
 * per-channel, and the person stays emailable.
 */
export function optOutSuppressesGlobally(channel: string | null | undefined): boolean {
  const c = (channel ?? '').trim().toLowerCase();
  if (c === 'sms' || c === 'voice') return false;
  return true;
}
