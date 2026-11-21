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
      image_url: e.thumbnail_id ? publicThumbnailPath(e.id, e.thumbnail_id) : null,
      signup_count: null,
      is_registered: false,
      source: 'hub' as const,
      is_live: liveId !== null,
      // Hub cards open the in-app player by occurrence id (live_occurrence_id); watch_url stays for other sources.
      watch_url: null,
      live_occurrence_id: liveId,
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

/** CCPP cards plus hub cards, the hub winning a shared registration page, sorted by start. */
export function mergeCards(ccpp: PortalEventCard[], hub: PortalEventCard[]): PortalEventCard[] {
  const hubKeys = new Set(hub.map((h) => registrationKey(h.registration_url)).filter((k): k is string => k !== null));
  const kept = ccpp.filter((c) => {
    const k = registrationKey(c.registration_url);
    return k === null || !hubKeys.has(k);
  }).map((c) => ({ ...c, source: 'ccpp' as const }));
  return [...kept, ...hub].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
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
