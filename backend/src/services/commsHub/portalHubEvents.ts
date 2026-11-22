import { Op } from 'sequelize';
import CommsHubEvent from '../../models/CommsHubEvent';
import type { OpenHouseView } from '../openHouseTypes';
import { CENTRAL_TZ, centralDateKey } from '../centralDate';
import { occurrencesForEvents, type HubOccurrenceState } from './live/hubBroadcastLinks';
import { expandOccurrences } from './eventRecurrence';
import { publicThumbnailPath } from './thumbnails/thumbnailPaths';

/**
 * Hub events on the member portal's Events page (CH2.3). That page used to read only CCPP
 * (Eventbrite), so an event Jackie made in the hub was invisible there. This adds the hub's own
 * events for the viewer's audience, in the same card shape, and lets a hub event replace the CCPP
 * card that points at the same Eventbrite registration (Jackie pasted that link into the hub).
 *
 * The chosen 16:9 thumbnail (CH4.4) is image_url, served by the public thumbnail route; until one is
 * chosen the card shows the first-letter fallback EventsPage already renders for a missing image.
 */
export interface PortalEventCard extends OpenHouseView {
  source?: 'ccpp' | 'hub';
  is_live?: boolean;
  watch_url?: string | null;
  /** CH5.3: the broadcast occurrence on air for this card's date; the card's Watch live opens it in the portal player. */
  live_occurrence_id?: string | null;
  /** CH9.5: on a hub card, the Eventbrite event it manages (the same id a CCPP card carries as `id`). */
  ccpp_event_id?: string | null;
}

/** Hub events this viewer may see: published to the Events page, active, and in their audience. */
export function visibleTo(e: CommsHubEvent, cohortId: string | null): boolean {
  if (!e.placement?.events_page) return false;
  if (e.status !== 'scheduled' && e.status !== 'live') return false;
  if (e.audience.kind === 'all_members') return true;
  return cohortId !== null && e.audience.cohort_ids.includes(cohortId);
}

/** An occurrence with no end time is treated as running this long, so a live event without one stays visible. */
export const OPEN_ENDED_MS = 4 * 3_600_000;

const ON_AIR = new Set(['live', 'reconnecting']);

/**
 * A card is "live now" when the broadcast occurrence for ITS Central date is on air (CH5.3), read from
 * the occurrence itself rather than the event's status, which can lag a stream ended outside the panel.
 */
export function toCards(e: CommsHubEvent, fromMs: number, toMs: number, occurrences: HubOccurrenceState[] = []): PortalEventCard[] {
  const onAirByDate = new Map(occurrences
    .filter((x) => ON_AIR.has(x.editorial_state) && x.scheduled_start_at)
    .map((x) => [centralDateKey(x.scheduled_start_at!.getTime()), x.occurrence_id]));
  return expandOccurrences(e.starts_at, e.ends_at, e.repeat_rule)
    .map((o) => ({ o, end: o.ends_at ? o.ends_at.getTime() : o.starts_at.getTime() + OPEN_ENDED_MS }))
    .filter(({ o, end }) => o.starts_at.getTime() <= toMs && end >= fromMs)
    .map(({ o }) => ({ o, liveId: onAirByDate.get(centralDateKey(o.starts_at.getTime())) ?? null }))
    .map(({ o, liveId }) => ({
      id: `hub:${e.id}:${o.starts_at.toISOString()}`,
      title: e.title,
      description: e.description,
      starts_at: o.starts_at,
      ends_at: o.ends_at,
      timezone: CENTRAL_TZ,
      registration_url: e.registration_url,
      meeting_link: e.join_url,
      // CH9.5: an event managed from Eventbrite keeps Eventbrite's picture until a hub thumbnail is chosen.
      image_url: e.thumbnail_id ? publicThumbnailPath(e.id, e.thumbnail_id) : (e.source_image_url ?? null),
      signup_count: null,
      is_registered: false,
      source: 'hub' as const,
      is_live: liveId !== null,
      // Hub cards open the in-app player by occurrence id (live_occurrence_id); watch_url stays for other sources.
      watch_url: null,
      live_occurrence_id: liveId,
      ccpp_event_id: e.ccpp_event_id ?? null,
    }));
}

/**
 * One key per registration page, so the same Eventbrite event matches however the URL was pasted
 * (query string, trailing slash, slug text before the numeric id). Null when there is no URL.
 */
export function registrationKey(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const path = u.pathname.replace(/\/+$/, '').toLowerCase();
    const eb = /eventbrite\.[a-z.]+$/.test(host) ? /-(\d{6,})$/.exec(path) ?? /\/(\d{6,})$/.exec(path) : null;
    return eb ? `eventbrite:${eb[1]}` : `${host}${path}`;
  } catch {
    return null;
  }
}

/**
 * CCPP cards plus hub cards, the hub winning a shared registration page, sorted by start.
 *
 * CH9.5: the CCPP card a hub card replaces was already annotated for THIS viewer (is_registered) and
 * carries the signup count. Dropping it used to drop both, so a member who had registered was shown
 * Register again. Now the hub card inherits them from the card it replaces:
 *  - a hub card that MANAGES an Eventbrite event matches it by Eventbrite id (`ccpp_event_id` = the
 *    CCPP card's `id`). Not by date: when Eventbrite moves the event, the CCPP card carries the new date
 *    before the hub's sync catches up, and a date match would miss it in that window;
 *  - any other hub card that shares a registration link matches on that link AND the same Central
 *    date, so one Eventbrite event's registration never spreads across every date of a recurring
 *    hub series that happens to share the link.
 */
export function mergeCards(ccpp: PortalEventCard[], hub: PortalEventCard[]): PortalEventCard[] {
  const hubKeys = new Set(hub.map((h) => registrationKey(h.registration_url)).filter((k): k is string => k !== null));
  const managedIds = new Set(hub.map((h) => h.ccpp_event_id).filter((x): x is string => !!x));
  const replacedByKey = new Map<string, PortalEventCard>();
  const replacedById = new Map<string, PortalEventCard>();
  const kept: PortalEventCard[] = [];
  for (const c of ccpp) {
    const k = registrationKey(c.registration_url);
    const managed = managedIds.has(String(c.id));
    if (!managed && (k === null || !hubKeys.has(k))) { kept.push({ ...c, source: 'ccpp' as const }); continue; }
    if (managed) replacedById.set(String(c.id), c);
    if (k !== null) replacedByKey.set(`${k}|${centralDateKey(new Date(c.starts_at).getTime())}`, c);
  }
  const hubCards = hub.map((h) => {
    const k = registrationKey(h.registration_url);
    const from = h.ccpp_event_id
      ? replacedById.get(h.ccpp_event_id)
      : (k ? replacedByKey.get(`${k}|${centralDateKey(new Date(h.starts_at).getTime())}`) : undefined);
    if (!from) return h;
    return {
      ...h,
      is_registered: h.is_registered || from.is_registered,
      signup_count: h.signup_count ?? from.signup_count,
      image_url: h.image_url ?? from.image_url,
    };
  });
  return [...kept, ...hubCards].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

export async function getPortalHubEvents(cohortId: string | null, days: number, now: Date = new Date()): Promise<PortalEventCard[]> {
  const fromMs = now.getTime();
  const toMs = fromMs + days * 86_400_000;
  // Bounded and ordered: nothing that first starts after the window can appear in it, and the newest
  // series come first, so a long history of old one-off events can never push current ones past the limit.
  const rows = await CommsHubEvent.findAll({
    where: { status: { [Op.in]: ['scheduled', 'live'] }, starts_at: { [Op.lte]: new Date(toMs) } },
    order: [['starts_at', 'DESC']],
    limit: 500,
  });
  const visible = rows.filter((e) => visibleTo(e, cohortId));
  const occurrences = await occurrencesForEvents(visible.map((e) => e.id));
  return visible.flatMap((e) => toCards(e, fromMs, toMs, occurrences.get(e.id) ?? []));
}
