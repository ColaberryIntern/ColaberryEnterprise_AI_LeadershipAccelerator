import { getUpcomingPublicEvents, getRegisteredEventIds } from '../publicEventsService';

/**
 * Explorer Growth OS — EPIC 7. Event state for one learner.
 *
 * WHAT THIS REPLACES. EPIC 3 wired `event_registered` / `event_attended` signals
 * end to end — the reader maps them from `student_points_events` rows typed
 * `open_house_rsvp%` / `open_house_attended%`, and the state machine derives
 * overlays from them. Measured on production: **that table has ZERO such rows.**
 * The plumbing was complete and carried no water, so the event overlays could
 * never fire for anyone.
 *
 * The real registration record lives in CCPP `EventBrite_EventAttendees` —
 * 4,455 signups in the last 90 days. This service reads it.
 *
 * IT REUSES `getRegisteredEventIds` RATHER THAN QUERYING CCPP ITSELF. That
 * function carries a fix without which this feature silently returns nothing:
 * 100% of 2026 registration emails are stored as `'someone@example.com',` —
 * delimiters and all — so an exact match finds no one. A second query here would
 * reproduce the bug in a second place, which is the drift this programme keeps
 * paying for.
 *
 * ─── ATTENDANCE IS NOT AVAILABLE, AND THIS SERVICE DOES NOT PRETEND ─────────
 *
 * `EVENT_ATTENDED` and `EVENT_NO_SHOW` are NOT derived here, and the reason is
 * not that the work is unfinished:
 *
 *   - Eventbrite records attendance via `barcode.checked_in`, which fires when a
 *     ticket is SCANNED AT A DOOR.
 *   - All 549 events in the last 90 days are `Online_event = True`.
 *   - Zero check-ins have been possible since 2022; the 88 historical ones are
 *     from an era of in-person events.
 *
 * So nobody can be marked attended, and therefore **nobody can be marked a
 * no-show** — no-show is registered-minus-attended. Inferring it from "no
 * engagement afterwards" would manufacture a fact about a real person and then
 * act on it: someone who attended would receive "sorry we missed you". That is
 * the same failure as absence-read-as-a-decision, and this programme has paid
 * for it enough times.
 *
 * If attendance is ever wanted for online events it has to come from Zoom, not
 * Eventbrite. `attendanceAvailable` is returned as `false` so a consumer can
 * tell "did not attend" apart from "we do not know", which are different facts.
 */

export interface ExplorerEventState {
  /** Upcoming public events this learner has registered for. */
  registeredUpcomingCount: number;
  /** Upcoming public events at all, whether or not they registered. */
  upcomingEventCount: number;
  /**
   * FALSE, always, today. Not a placeholder for unfinished work — see above.
   * A consumer must never read `attended: false`; it must read "unknown".
   */
  attendanceAvailable: false;
}

/** Nothing known. Returned on any failure, so a CCPP blip cannot fabricate state. */
const UNKNOWN: ExplorerEventState = {
  registeredUpcomingCount: 0,
  upcomingEventCount: 0,
  attendanceAvailable: false,
};

/**
 * How far ahead an event counts as "upcoming" for overlay purposes.
 *
 * 30 days rather than the calendar's full 90: an event two months out is not a
 * reason to nudge someone this week, and `EVENT_READY` exists to prompt a
 * timely action.
 */
export const UPCOMING_WINDOW_DAYS = 30;

/**
 * Resolve event state for one learner.
 *
 * FAILS SOFT to "nothing known". A CCPP outage must not invent an overlay, and
 * it must not remove one either — the caller treats an absent state as "no
 * event evidence", which is what an outage actually means.
 */
export async function getExplorerEventState(
  email: string | null | undefined,
): Promise<ExplorerEventState> {
  if (!email) return UNKNOWN;

  try {
    const upcoming = await getUpcomingPublicEvents(UPCOMING_WINDOW_DAYS);
    if (upcoming.length === 0) return UNKNOWN;

    const registered = await getRegisteredEventIds(email, upcoming.map((e) => e.id));
    return {
      registeredUpcomingCount: registered.size,
      upcomingEventCount: upcoming.length,
      attendanceAvailable: false,
    };
  } catch (err: any) {
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'explorer_event_state_failed',
        outcome: 'partial',
        error_class: err?.constructor?.name ?? 'Error',
        context: { message: err?.message },
      }),
    );
    return UNKNOWN;
  }
}
