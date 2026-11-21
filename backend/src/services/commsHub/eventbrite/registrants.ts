import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { unwrapCcppEmail } from '../../publicEventsService';
import { centralWallClockToInstant } from '../../centralDate';
import { listOpenHouseRegistrations } from '../../openHouseRegistrationStore';
import { cleanEventbriteValue } from '../../../utils/eventbriteSanitize';
import { activeSource, NotConfiguredError, type EventbriteSource } from './eventbriteSource';
import { listEventbriteEvents, type EventbriteEventView, type EventbriteListStatus } from './eventbriteEvents';

/**
 * Who registered for one Eventbrite event (CH9.3): the CCPP attendee mirror plus the people who
 * registered on our own site (`open_house_registrations`), one row per person.
 *
 * ONLY PUBLIC EVENTS. The id must be on the hub's Eventbrite list (upcoming, or the past 90 days),
 * the same events /portal/events shows. Without this, anyone with the hub could read the attendee
 * list of any CCPP event, internal bootcamp sessions included. Unknown id: RegistrantsNotFound.
 *
 * MERGE. CCPP stores emails as `'x@y',` on most 2026 rows; `unwrapCcppEmail` (the same cleaner the
 * portal's registered count uses) makes them comparable with our lowercased emails. One person is
 * one row: the earliest registration time, every source they came through, the first non-empty
 * name, and the first non-empty phone. Rows are sorted by time then email, so the same data always
 * gives the same list (and the same CSV bytes).
 *
 * FAILURE. Eventbrite failing still returns our own registrations, marked `eventbrite:
 * 'unavailable'` so the screen says the list is partial; the two are never merged silently. Our own
 * table failing throws (the route answers 500): there is nothing honest to show then.
 *
 * PII. Phone numbers travel only to the CSV (`Registrant.phone`); the on-screen view drops them.
 * Nothing here logs a name, email or phone.
 */
export type RegistrantSource = 'eventbrite' | 'site';

export interface Registrant {
  name: string;
  email: string;
  phone: string;
  /** Earliest registration, ISO; null when no source said when. */
  registered_at: string | null;
  sources: RegistrantSource[];
  has_account: boolean;
}

export interface RegistrantList {
  event: Pick<EventbriteEventView, 'ccpp_event_id' | 'title' | 'starts_at'>;
  /** Whether the Eventbrite half of the list could be read. */
  eventbrite: EventbriteListStatus;
  rows: Registrant[];
}

export class RegistrantsNotFound extends Error {
  constructor() { super('That event is not on the public Eventbrite list.'); this.name = 'RegistrantsNotFound'; }
}

interface Deps { source?: EventbriteSource; findEvent?: (id: string) => Promise<EventbriteEventView | null | 'unavailable'> }

/** The public event with this id, from the hub's own list; 'unavailable' when that list cannot be read. */
export async function findPublicEvent(id: string): Promise<EventbriteEventView | null | 'unavailable'> {
  let sawFailure = false;
  for (const w of ['upcoming', 'past'] as const) {
    // eslint-disable-next-line no-await-in-loop
    const list = await listEventbriteEvents(w);
    if (list.status !== 'ok') { sawFailure = true; continue; }
    const hit = list.events.find((e) => e.ccpp_event_id === id);
    if (hit) return hit;
  }
  return sawFailure ? 'unavailable' : null;
}

function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

/** Pure: merge the two rosters into one row per person, deterministically ordered. */
export function mergeRegistrants(
  ccpp: Array<{ AttendeeName: string | null; Email: string | null; PhoneNumber: string | null; CreatedDate: Date | null }>,
  ours: Array<{ email_lower: string; name: string | null; enrollment_id: string | null; created_at: Date | string }>,
): Array<Omit<Registrant, 'has_account'> & { enrollment_linked: boolean }> {
  const byEmail = new Map<string, Omit<Registrant, 'has_account'> & { enrollment_linked: boolean }>();
  const add = (email: string, name: string, phone: string, at: string | null, source: RegistrantSource, linked: boolean): void => {
    if (!email || !email.includes('@')) return;
    const cur = byEmail.get(email);
    if (!cur) { byEmail.set(email, { name, email, phone, registered_at: at, sources: [source], enrollment_linked: linked }); return; }
    cur.name = cur.name || name;
    cur.phone = cur.phone || phone;
    cur.registered_at = earliest(cur.registered_at, at);
    if (!cur.sources.includes(source)) cur.sources.push(source);
    cur.enrollment_linked = cur.enrollment_linked || linked;
  };
  for (const r of ccpp) {
    // CCPP times are Central wall-clock read as UTC, like EventBrite_Events (centralDate.ts).
    const at = r.CreatedDate ? centralWallClockToInstant(new Date(r.CreatedDate)).toISOString() : null;
    add(unwrapCcppEmail(r.Email), cleanEventbriteValue(r.AttendeeName), cleanEventbriteValue(r.PhoneNumber), at, 'eventbrite', false);
  }
  for (const r of ours) {
    add(String(r.email_lower ?? '').trim().toLowerCase(), cleanEventbriteValue(r.name), '', new Date(r.created_at).toISOString(), 'site', !!r.enrollment_id);
  }
  return [...byEmail.values()]
    .map((r) => ({ ...r, sources: [...r.sources].sort() as RegistrantSource[] }))
    .sort((a, b) => (a.registered_at ?? '9').localeCompare(b.registered_at ?? '9') || a.email.localeCompare(b.email));
}

/** Which of these emails belong to someone with a platform account (an enrollment). */
async function emailsWithAccounts(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const rows = await sequelize.query<{ e: string }>(
    'SELECT DISTINCT LOWER(TRIM(email)) AS e FROM enrollments WHERE LOWER(TRIM(email)) IN (:emails)',
    { replacements: { emails }, type: QueryTypes.SELECT },
  );
  return new Set(rows.map((r) => r.e));
}

export async function listRegistrants(ccppEventId: string, deps: Deps = {}): Promise<RegistrantList> {
  const found = await (deps.findEvent ?? findPublicEvent)(ccppEventId);
  if (found === null) throw new RegistrantsNotFound();
  const source = deps.source ?? activeSource();

  let eventbrite: EventbriteListStatus = 'ok';
  let ccppRows: Awaited<ReturnType<EventbriteSource['listAttendees']>> = [];
  if (found === 'unavailable') {
    eventbrite = 'unavailable';
  } else {
    try {
      ccppRows = await source.listAttendees(ccppEventId);
    } catch (err) {
      eventbrite = err instanceof NotConfiguredError ? 'not_configured' : 'unavailable';
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'warn', service: 'comms_hub', event: 'comms_hub_registrants_eventbrite_failed',
        outcome: 'partial', error_class: eventbrite === 'not_configured' ? 'NotConfigured' : 'UpstreamUnavailable',
        context: { ccpp_event_id: ccppEventId, message: String((err as Error)?.message ?? err).slice(0, 200) },
      }));
    }
  }
  // Our own table: a failure here throws to the route (500), on purpose.
  const ours = await listOpenHouseRegistrations(ccppEventId, 5000);
  const merged = mergeRegistrants(ccppRows, ours);
  const accounts = await emailsWithAccounts(merged.map((r) => r.email));
  const rows = merged.map(({ enrollment_linked, ...r }) => ({ ...r, has_account: enrollment_linked || accounts.has(r.email) }));
  const event = found === 'unavailable'
    ? { ccpp_event_id: ccppEventId, title: `Eventbrite event ${ccppEventId}`, starts_at: '' }
    : { ccpp_event_id: found.ccpp_event_id, title: found.title, starts_at: found.starts_at };
  return { event, eventbrite, rows };
}
