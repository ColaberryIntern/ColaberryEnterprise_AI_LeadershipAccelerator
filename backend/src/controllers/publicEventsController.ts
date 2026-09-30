import { Request, Response } from 'express';
import { getUpcomingPublicEvents } from '../services/publicEventsService';
import { OpenHouseView } from '../services/openHouseTypes';

/**
 * The public events list, for the marketing site.
 *
 * WHY THIS EXISTS. The portal's Events page reads `/api/portal/events`, which sits behind
 * `requireParticipant` — a signed-in learner. training.colaberry.com serves anonymous
 * visitors and so cannot call it, and its `/events` page has therefore been rendering a
 * hardcoded snapshot (`FALLBACK_EVENTS`, four undated placeholders) while the portal shows
 * the real CCPP feed. The training repo's own `getStaticProps` names this endpoint in a
 * TODO; this is that endpoint.
 *
 * Public and unauthenticated, matching `/api/v1/open-house/event` rather than the
 * token-gated `/api/v1/leads`. The distinction is not laziness: this returns the same
 * event listings Eventbrite already publishes to the open internet, so a token would
 * protect nothing while adding a way for the marketing site to break. Everything on this
 * route is already public by construction.
 */

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  outcome: 'success' | 'failure' | 'partial',
  context: Record<string, unknown> = {}
): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'public-events', event, outcome, ...context }) + '\n'
  );
}

/** Matches the portal Events page, so both surfaces show the same horizon. */
export const DEFAULT_WINDOW_DAYS = 90;
const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 365;

/** The wire shape. `OpenHouseView` minus the one field that cannot be true here. */
export type PublicEventDto = Omit<OpenHouseView, 'is_registered' | 'starts_at' | 'ends_at'> & {
  starts_at: string;
  ends_at: string | null;
};

/**
 * Drop `is_registered` rather than sending `false`.
 *
 * It means "this viewer has registered", and an unauthenticated request has no viewer.
 * Sending `false` would be indistinguishable from a real negative, so any consumer that
 * trusted it would quietly tell every visitor they are not registered for an event they
 * may well have booked. Absent is honest; false is a claim we cannot make.
 *
 * Dates go over the wire as ISO strings because JSON has no date type, and leaving them as
 * `Date` would serialise implicitly and silently change shape if the transport ever did.
 */
export function toPublicEventDto(view: OpenHouseView): PublicEventDto {
  const { is_registered: _ignored, starts_at, ends_at, ...rest } = view;
  return {
    ...rest,
    starts_at: new Date(starts_at).toISOString(),
    ends_at: ends_at ? new Date(ends_at).toISOString() : null,
  };
}

/**
 * Clamp the caller's window into something sane.
 *
 * `days` reaches us from a query string, so it can be absent, a word, negative, or 10000.
 * A missing or unparseable value takes the default; anything else is clamped rather than
 * rejected, because a marketing page asking for a silly window should still render events,
 * not a 400 that turns into an empty page.
 */
export function resolveWindowDays(raw: unknown): number {
  const first = Array.isArray(raw) ? raw[0] : raw;
  // `?days=` with no value must mean "unspecified", not "one day". Number('') is 0, not
  // NaN, so an emptiness check has to come BEFORE the finite check or an empty query
  // string clamps to the minimum and the page shows a single day of events.
  if (first === undefined || first === null || String(first).trim() === '') {
    return DEFAULT_WINDOW_DAYS;
  }
  const n = Number(first);
  if (!Number.isFinite(n)) return DEFAULT_WINDOW_DAYS;
  return Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, Math.floor(n)));
}

/**
 * GET /api/v1/events?days=90
 *
 * Never throws. A CCPP outage returns an empty list so the marketing site falls back to its
 * own copy and still renders, which is the same contract `/api/v1/open-house/event` keeps.
 * Failing loudly here would take down a public page to report a problem nobody visiting it
 * can act on.
 */
export async function handleGetPublicEventsList(req: Request, res: Response): Promise<void> {
  const days = resolveWindowDays(req.query.days);
  try {
    const events = await getUpcomingPublicEvents(days);
    res.json({ events: events.map(toPublicEventDto), window_days: days });
  } catch (err) {
    log('error', 'public_events_list_failure', 'failure', {
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      message: err instanceof Error ? err.message : String(err),
      window_days: days,
    });
    res.json({ events: [], window_days: days });
  }
}
