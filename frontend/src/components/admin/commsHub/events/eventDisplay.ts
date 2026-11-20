import type { HubEvent, HubEventStatus, HubEventType } from '../../../../services/commsHubApi';

/**
 * Pure display helpers for the Events tab (CH3.1). Every date is shown on the Central clock with the
 * zone written out, computed from the instant the server returns, never from a typed string.
 */
const TZ = 'America/Chicago';

export const TYPE_LABEL: Record<HubEventType, string> = {
  session: 'Live session', open_house: 'Open house', office_hours: 'Office hours', workshop: 'Workshop', other: 'Event',
};

/** Status is told by its words and an icon, never by colour alone. */
export const STATUS_META: Record<HubEventStatus, { label: string; icon: string; tone: 'neutral' | 'info' | 'danger' | 'success' | 'muted' }> = {
  draft: { label: 'Draft', icon: 'draft-line', tone: 'neutral' },
  scheduled: { label: 'Scheduled', icon: 'calendar-check-line', tone: 'info' },
  live: { label: 'Live now', icon: 'live-line', tone: 'danger' },
  ended: { label: 'Ended', icon: 'checkbox-circle-line', tone: 'success' },
  cancelled: { label: 'Cancelled', icon: 'close-circle-line', tone: 'muted' },
};

/** The moment the card is about: the next occurrence, or the first one for a past or cancelled event. */
export function focusInstant(ev: Pick<HubEvent, 'next_occurrence_at' | 'starts_at'>): Date {
  return new Date(ev.next_occurrence_at ?? ev.starts_at);
}

export function dateChip(at: Date): { day: string; month: string } {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: TZ, day: 'numeric' }).format(at);
  const month = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short' }).format(at).toUpperCase();
  return { day, month };
}

const REPEAT_WORD: Record<string, string> = { weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly' };

/** "Tue, Nov 24 · 6:00 PM CST · weekly" */
export function whenLabel(ev: Pick<HubEvent, 'next_occurrence_at' | 'starts_at' | 'repeat_rule'>): string {
  const at = focusInstant(ev);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(at);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(at);
  const parts = [day, time];
  if (ev.repeat_rule) parts.push(REPEAT_WORD[ev.repeat_rule.freq]);
  return parts.join(' · ');
}

export function audienceLabel(ev: Pick<HubEvent, 'audience'>): string {
  if (ev.audience.kind === 'all_members') return 'All open cohorts';
  const n = ev.audience.cohort_ids.length;
  return n === 1 ? '1 cohort' : `${n} cohorts`;
}

/** Notes the organizer should act on, shown beside the status. */
export function attentionNotes(ev: Pick<HubEvent, 'status' | 'thumbnail_id' | 'next_occurrence_at'>): string[] {
  const notes: string[] = [];
  const active = ev.status === 'scheduled' || ev.status === 'live' || ev.status === 'draft';
  if (active && ev.next_occurrence_at && !ev.thumbnail_id) notes.push('Needs a thumbnail');
  if (ev.status === 'draft') notes.push('Not on the platform yet');
  return notes;
}
