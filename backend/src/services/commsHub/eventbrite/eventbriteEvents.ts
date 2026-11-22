import { ccppRowToView, addOwnRegistrations } from '../../publicEventsService';
import { activeSource, NotConfiguredError, type EventbriteSource, type EventbriteWindow } from './eventbriteSource';

/**
 * The Events tab's "From Eventbrite" list (CH9.2): the same events /portal/events shows (upcoming),
 * plus the last 90 days (past), read-only from the CCPP mirror.
 *
 * The registered count is the portal's: CCPP's distinct attendees, unioned with people who
 * registered on our own site (addOwnRegistrations), so the admin card and the member card agree.
 *
 * THREE OUTCOMES, never two. 'ok' with rows (possibly none); 'unavailable' when CCPP failed; and
 * 'not_configured' when this server has no CCPP connection. A failure is never shown as "no events":
 * an organizer told there are no events when there are would plan around a falsehood.
 */
export type EventbriteListStatus = 'ok' | 'unavailable' | 'not_configured';

export interface EventbriteEventView {
  ccpp_event_id: string;
  title: string;
  /** CH9.5: Eventbrite's description, copied into the hub event when it is managed there. */
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  registration_url: string | null;
  image_url: string | null;
  /** Distinct people registered (Eventbrite plus our site), or null when unknown. Never a made-up 0. */
  registered: number | null;
  /** Eventbrite's lifecycle word: live, started, completed or ended. */
  eventbrite_status: string;
}

export interface EventbriteList { status: EventbriteListStatus; window: EventbriteWindow; events: EventbriteEventView[]; fetched_at: string }

const CACHE_MS = 2 * 60 * 1000;
const cache = new Map<EventbriteWindow, { at: number; list: EventbriteList }>();

/** Clears the 2-minute cache (tests, and a future "refresh now"). */
export function clearEventbriteCache(): void { cache.clear(); }

function log(level: 'info' | 'warn', event: string, outcome: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'comms_hub', event, outcome, ...(errorClass ? { error_class: errorClass } : {}), context });
  if (level === 'warn') console.error(line); else console.log(line);
}

export async function listEventbriteEvents(window: EventbriteWindow, deps: { source?: EventbriteSource; now?: () => number } = {}): Promise<EventbriteList> {
  const now = deps.now ?? Date.now;
  const hit = cache.get(window);
  if (!deps.source && hit && now() - hit.at < CACHE_MS) return hit.list;
  const source = deps.source ?? activeSource();
  const started = now();
  try {
    const rows = await source.listEvents(window);
    const withOwn = await addOwnRegistrations(rows.map(ccppRowToView));
    const events: EventbriteEventView[] = withOwn.map((v, i) => ({
      ccpp_event_id: v.id,
      title: v.title,
      description: v.description ?? null,
      starts_at: new Date(v.starts_at).toISOString(),
      ends_at: v.ends_at ? new Date(v.ends_at).toISOString() : null,
      registration_url: v.registration_url,
      image_url: v.image_url,
      registered: v.signup_count,
      eventbrite_status: String(rows[i].Status ?? ''),
    }));
    const list: EventbriteList = { status: 'ok', window, events, fetched_at: new Date(now()).toISOString() };
    if (!deps.source) cache.set(window, { at: now(), list });
    log('info', 'comms_hub_eventbrite_listed', 'success', { window, source: source.kind, count: events.length, duration_ms: now() - started });
    return list;
  } catch (err) {
    const notConfigured = err instanceof NotConfiguredError;
    log('warn', 'comms_hub_eventbrite_list_failed', 'failure',
      { window, source: source.kind, message: String((err as Error)?.message ?? err).slice(0, 200), duration_ms: now() - started },
      notConfigured ? 'NotConfigured' : 'UpstreamUnavailable');
    // Not cached: the next load tries again.
    return { status: notConfigured ? 'not_configured' : 'unavailable', window, events: [], fetched_at: new Date(now()).toISOString() };
  }
}
