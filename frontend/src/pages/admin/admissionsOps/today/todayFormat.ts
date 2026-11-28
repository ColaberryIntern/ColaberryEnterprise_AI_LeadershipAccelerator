/**
 * Display helpers for Today (AO2.1). Pure. Times are shown in Central with the zone written out (CST or CDT, chosen
 * by the date, so daylight saving is handled by Intl rather than by us).
 */
import type { QueueItem, SourceStatus, SystemId, SystemState } from '../../../../services/admissionsOpsApi';

const CENTRAL = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const CENTRAL_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' });
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });

/** "9:42 AM CST" for today (Central), "Nov 29, 9:42 AM CST" for an earlier day, "never" for null. */
export function centralTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const sameDay = DAY_KEY.format(d) === DAY_KEY.format(now);
  return sameDay ? CENTRAL.format(d) : `${CENTRAL_DAY.format(d)}, ${CENTRAL.format(d)}`;
}

export const STATUS_LABEL: Record<SourceStatus, string> = { ok: 'Up to date', stale: 'Stale', down: 'Down', not_connected: 'Not connected' };

export function systemNames(ids: SystemId[], systems: SystemState[]): string {
  const name = new Map(systems.map((s) => [s.id, s.name]));
  const names = ids.map((id) => name.get(id) ?? id);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export const APPROVAL_LABEL: Record<QueueItem['approval'], string> = {
  read_only: 'Read only',
  needs_approval: 'Needs your approval',
  bulk_needs_approval: 'Bulk send needs your approval',
};

export type Lens = 'all' | QueueItem['section'];

/** The queue under a lens, items due today first, order otherwise kept. */
export function filterQueue(queue: QueueItem[], lens: Lens): QueueItem[] {
  const picked = lens === 'all' ? queue : queue.filter((q) => q.section === lens);
  return [...picked.filter((q) => q.when === 'today'), ...picked.filter((q) => q.when !== 'today')];
}
