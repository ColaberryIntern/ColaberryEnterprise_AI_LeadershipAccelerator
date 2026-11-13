/**
 * Who is actually coming to the Open House?
 *
 * ── THE PROBLEM THIS EXISTS FOR ──
 *
 * On 2026-11-11 the Nov 19 Open House had SEVEN people registered on Eventbrite
 * and SIX registered through our own landing page, with ZERO overlap. Thirteen
 * distinct people, and no screen anywhere showed more than seven of them.
 *
 * The two rosters live in different databases and nothing joined them:
 *   - Eventbrite -> CCPP (SQL Server) `EventBrite_EventAttendees`. This is what
 *     the portal Events page counts, and what its "Sign up" button feeds, since
 *     that button is a plain link out to Eventbrite.
 *   - Our own funnel -> Postgres `open_house_registrations`. This is what the
 *     reminder sweep mails. `countOpenHouseRegistrations()` had existed for a
 *     while with zero non-test callers, so these people were invisible.
 *
 * The reminder sweep only knows the second list. Anyone running the event from
 * the Eventbrite dashboard only sees the first. This module puts both on one
 * screen and names the gap, so the discrepancy is visible before the night rather
 * than discovered during it.
 *
 * ── THE RULE THIS MODULE IS BUILT AROUND ──
 *
 * An unavailable roster is NEVER reported as an empty one. CCPP is reachable only
 * from inside the prod network, and the pre-existing `getRegisteredEventIds`
 * returns an empty Set on any failure - so "nobody registered" and "the query
 * broke" are the same answer from outside. Reconciliation is precisely the place
 * that confusion does damage: an empty roster would render as "all of your
 * registrants are missing from Eventbrite", stated with total confidence.
 *
 * So `eventbrite.status` is an explicit three-state ('ok' | 'unavailable' |
 * 'not_configured'), the counts are `null` rather than `0` when the roster could
 * not be read, and the comparison fields are omitted entirely rather than
 * computed against nothing.
 *
 * ── PRIVACY ──
 *
 * This is an admin-only surface and it returns real addresses, because the
 * operator's job here is to contact people and to spot a duplicate. It is behind
 * `requireAdmin`. Nothing in this module logs an address.
 */
import {
  listOpenHouseRegistrations,
  type OpenHouseRegistrationRow,
} from './openHouseRegistrationStore';
import { getCurrentOpenHouseEvent } from './openHouseEventService';
import { getEventAttendeeEmails } from './publicEventsService';

/** How many of our own registrations to return. Generous; the list is small. */
const MAX_REGISTRATIONS = 500;

export type RosterStatus = 'ok' | 'unavailable' | 'not_configured';

export interface ReconciledRegistrant {
  readonly email: string;
  readonly name: string | null;
  readonly source: string | null;
  readonly has_account: boolean;
  readonly registered_at: string | null;
  readonly reminded_24h: boolean;
  readonly reminded_1h: boolean;
  /**
   * Null - not false - when the Eventbrite roster could not be read. "We do not
   * know" is a different claim from "they are not on it".
   */
  readonly on_eventbrite: boolean | null;
}

export interface OpenHouseAttendeeReconciliation {
  readonly event: {
    readonly event_id: string;
    readonly name: string;
    readonly starts_at: string | null;
    readonly rsvp_url: string | null;
  } | null;
  readonly eventbrite: {
    readonly status: RosterStatus;
    /** Null whenever status is not 'ok'. Never 0 as a stand-in for unknown. */
    readonly count: number | null;
    readonly error_class?: string;
    /** On Eventbrite's roster and NOT in our table. Empty array when unknown. */
    readonly only_on_eventbrite: readonly string[];
  };
  readonly ours: {
    readonly count: number;
    readonly registrants: readonly ReconciledRegistrant[];
  };
  readonly summary: {
    /** Null when either side is unknown, so the headline can never be wrong. */
    readonly distinct_people: number | null;
    readonly overlap: number | null;
    readonly only_in_our_funnel: number;
  };
}

/** Normalise exactly once, and use it on BOTH sides of every comparison. */
function norm(email: string | null | undefined): string {
  return String(email ?? '').trim().toLowerCase();
}

function toRegistrant(row: OpenHouseRegistrationRow, eventbrite: Set<string> | null): ReconciledRegistrant {
  const email = norm(row.email_lower);
  return {
    email,
    name: row.name ?? null,
    source: row.source ?? null,
    has_account: Boolean(row.enrollment_id),
    registered_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    // Real fields on the row, not a cast: the store's SELECT was extended to
    // fetch these in the same change. Casting an absent column to a boolean would
    // have rendered every registrant as "not reminded" forever, and looked right.
    reminded_24h: Boolean(row.reminder_24h_sent_at),
    reminded_1h: Boolean(row.reminder_1h_sent_at),
    on_eventbrite: eventbrite ? eventbrite.has(email) : null,
  };
}

/**
 * Reconcile both rosters for the current Open House.
 *
 * Never throws for a CCPP failure - that is reported as `status: 'unavailable'`
 * so the page still shows our own registrants, which are the ones the operator
 * can actually act on. It does propagate a Postgres failure, because without our
 * own list there is nothing worth rendering.
 */
export async function reconcileOpenHouseAttendees(): Promise<OpenHouseAttendeeReconciliation> {
  const event = await getCurrentOpenHouseEvent();

  if (!event || !event.announced || !event.event_id) {
    return {
      event: null,
      eventbrite: { status: 'not_configured', count: null, only_on_eventbrite: [] },
      ours: { count: 0, registrants: [] },
      summary: { distinct_people: null, overlap: null, only_in_our_funnel: 0 },
    };
  }

  const eventId = String(event.event_id);
  const rows = await listOpenHouseRegistrations(eventId, MAX_REGISTRATIONS);
  const ourEmails = new Set(rows.map((r) => norm(r.email_lower)));

  let roster: Set<string> | null = null;
  let status: RosterStatus = 'unavailable';
  let errorClass: string | undefined;

  try {
    const emails = await getEventAttendeeEmails(eventId);
    roster = new Set(emails.map(norm));
    status = 'ok';
  } catch (err) {
    // Deliberately not rethrown: our own registrants are still worth showing, and
    // they are the half the operator can act on. But the status says so plainly.
    status = 'unavailable';
    errorClass = err instanceof Error ? err.constructor.name : 'UnknownError';
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'open_house_eventbrite_roster_unavailable',
      outcome: 'partial',
      error_class: errorClass,
      context: { event_id: eventId, message: err instanceof Error ? err.message : String(err) },
    }));
  }

  const registrants = rows.map((r) => toRegistrant(r, roster));
  const overlap = roster ? [...ourEmails].filter((e) => roster!.has(e)).length : null;
  const onlyOnEventbrite = roster ? [...roster].filter((e) => !ourEmails.has(e)) : [];

  return {
    event: {
      event_id: eventId,
      name: event.name ?? 'Open House',
      starts_at: event.starts_at ?? null,
      rsvp_url: event.rsvp_url ?? null,
    },
    eventbrite: {
      status,
      count: roster ? roster.size : null,
      ...(errorClass ? { error_class: errorClass } : {}),
      only_on_eventbrite: onlyOnEventbrite,
    },
    ours: { count: rows.length, registrants },
    summary: {
      // Union of the two sets. Null when one side is unknown - a headcount that
      // silently omits a whole roster is worse than no headcount.
      distinct_people: roster ? new Set([...ourEmails, ...roster]).size : null,
      overlap,
      only_in_our_funnel: roster ? [...ourEmails].filter((e) => !roster!.has(e)).length : rows.length,
    },
  };
}
