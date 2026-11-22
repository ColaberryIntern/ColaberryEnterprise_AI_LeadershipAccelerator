import type { BoardRow, Channel, HubMessageStatus } from '../../../../services/commsHubApi';
import { isoToCentral } from '../compose/centralTime';

/**
 * Words, icons and Central-time grouping for message rows on Today and Schedule & history (CH7.4).
 * A status is always shown as text with an icon; the colour tone only reinforces it.
 */
export type Tone = 'neutral' | 'info' | 'danger' | 'success' | 'muted' | 'warning';
export const MESSAGE_STATUS: Record<HubMessageStatus, { label: string; icon: string; tone: Tone }> = {
  draft: { label: 'Draft', icon: 'draft-line', tone: 'neutral' },
  needs_approval: { label: 'Needs approval', icon: 'error-warning-line', tone: 'warning' },
  approved: { label: 'Approved', icon: 'checkbox-circle-line', tone: 'info' },
  scheduled: { label: 'Scheduled', icon: 'time-line', tone: 'info' },
  sending: { label: 'Sending', icon: 'send-plane-line', tone: 'info' },
  sent: { label: 'Sent', icon: 'check-double-line', tone: 'success' },
  partially_failed: { label: 'Partly sent', icon: 'alert-line', tone: 'danger' },
  failed: { label: 'Failed', icon: 'close-circle-line', tone: 'danger' },
  cancelled: { label: 'Cancelled', icon: 'forbid-line', tone: 'muted' },
};
export const STATUS_ORDER = Object.keys(MESSAGE_STATUS) as HubMessageStatus[];

export const CHANNEL_LABEL: Record<Channel, string> = { community_post: 'Community feed', in_app: 'In-app notification', whatsapp: 'WhatsApp' };

/** "Community feed (November cohort), in-app notification (All members)". */
export function whereLabel(row: Pick<BoardRow, 'destinations'>): string {
  if (!row.destinations.length) return 'No recipients chosen yet';
  return row.destinations
    .map((d, i) => `${i === 0 ? CHANNEL_LABEL[d.channel] : CHANNEL_LABEL[d.channel].toLowerCase()}${d.label ? ` (${d.label})` : ''}`)
    .join(', ');
}

export function includesLabel(row: Pick<BoardRow, 'include' | 'event'>): string {
  const parts: string[] = [];
  if (row.event?.thumbnail_id && row.include.thumbnail) parts.push('thumbnail');
  if (row.include.join_link) parts.push('join link');
  if (row.include.registration_link) parts.push('registration link');
  return parts.length ? parts.join(', ') : 'text only';
}

const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric' });
const whenFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

export const timeOf = (iso: string): string => timeFmt.format(new Date(iso));
export const whenOf = (iso: string | null): string => (iso ? whenFmt.format(new Date(iso)) : 'As soon as it is approved');

export interface DayGroup { key: string; heading: string; rows: BoardRow[] }

/**
 * Rows grouped by Central day, in order. Rows with no send time go out on approval and come first,
 * under "On approval". A row due before today (held by a pause or quiet hours) is listed under today.
 */
export function groupByDay(rows: BoardRow[], now: Date = new Date()): DayGroup[] {
  const today = isoToCentral(now.toISOString()).date;
  const groups = new Map<string, DayGroup>();
  for (const r of rows) {
    let key = r.send_at ? isoToCentral(r.send_at).date : 'on-approval';
    if (key !== 'on-approval' && key < today) key = today;
    if (!groups.has(key)) {
      const heading = key === 'on-approval' ? 'On approval'
        : `${key === today ? 'Today, ' : ''}${dayFmt.format(new Date(`${key}T18:00:00Z`))}`;
      groups.set(key, { key, heading, rows: [] });
    }
    groups.get(key)!.rows.push(r);
  }
  return Array.from(groups.values()).sort((a, b) => (a.key === 'on-approval' ? -1 : b.key === 'on-approval' ? 1 : a.key.localeCompare(b.key)));
}

/** What the Retry button says: "Retry 1 recipient" for a partial failure, "Send again" when nothing went out. */
export function retryLabel(row: Pick<BoardRow, 'status' | 'deliveries'>): string | null {
  if (row.status === 'partially_failed') { const n = row.deliveries.failed || 1; return `Retry ${n} recipient${n === 1 ? '' : 's'}`; }
  if (row.status === 'failed') return 'Send again';
  return null;
}
