import api from '../utils/api';

/**
 * The Open House attendee reconciliation: both rosters, and the gap between them.
 *
 * `eventbrite.status` is three-state on purpose. `count` is null - never 0 - when
 * the roster could not be read, because an unavailable list rendered as an empty
 * one reads as a confident accusation that nobody registered.
 */
export type RosterStatus = 'ok' | 'unavailable' | 'not_configured';

export interface ReconciledRegistrant {
  email: string;
  name: string | null;
  source: string | null;
  has_account: boolean;
  registered_at: string | null;
  reminded_24h: boolean;
  reminded_1h: boolean;
  /** Null means "we could not check", which is not the same as "no". */
  on_eventbrite: boolean | null;
}

export interface OpenHouseAttendees {
  event: {
    event_id: string;
    name: string;
    starts_at: string | null;
    rsvp_url: string | null;
  } | null;
  eventbrite: {
    status: RosterStatus;
    count: number | null;
    error_class?: string;
    only_on_eventbrite: string[];
  };
  ours: {
    count: number;
    registrants: ReconciledRegistrant[];
  };
  summary: {
    distinct_people: number | null;
    overlap: number | null;
    only_in_our_funnel: number;
  };
}

export async function getOpenHouseAttendees(): Promise<OpenHouseAttendees> {
  return (await api.get('/api/admin/marketing/open-house/attendees')).data;
}

/** The server's message if it sent one, else the sentence passed in. */
export function attendeesErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: string } } })?.response?.data;
  return data?.error ?? fallback;
}
