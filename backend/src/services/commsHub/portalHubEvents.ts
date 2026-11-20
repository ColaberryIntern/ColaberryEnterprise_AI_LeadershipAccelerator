import { Op } from 'sequelize';
import CommsHubEvent from '../../models/CommsHubEvent';
import type { OpenHouseView } from '../openHouseTypes';
import { CENTRAL_TZ } from '../centralDate';
import { expandOccurrences } from './eventRecurrence';

/**
 * Hub events on the member portal's Events page (CH2.3). That page used to read only CCPP
 * (Eventbrite), so an event Jackie made in the hub was invisible there. This adds the hub's own
 * events for the viewer's audience, in the same card shape, and lets a hub event replace the CCPP
 * card that points at the same Eventbrite registration (Jackie pasted that link into the hub).
 *
 * Thumbnails arrive in CH4 (the chosen 16:9 image becomes image_url); until a thumbnail exists the
 * card shows the first-letter fallback EventsPage already renders for a missing image.
 */
export interface PortalEventCard extends OpenHouseView {
  source?: 'ccpp' | 'hub';
  is_live?: boolean;
  watch_url?: string | null;
}

/** Hub events this viewer may see: published to the Events page, active, and in their audience. */
export function visibleTo(e: CommsHubEvent, cohortId: string | null): boolean {
  if (!e.placement?.events_page) return false;
  if (e.status !== 'scheduled' && e.status !== 'live') return false;
  if (e.audience.kind === 'all_members') return true;
  return cohortId !== null && e.audience.cohort_ids.includes(cohortId);
}

export function toCards(e: CommsHubEvent, fromMs: number, toMs: number): PortalEventCard[] {
  const live = e.status === 'live';
  return expandOccurrences(e.starts_at, e.ends_at, e.repeat_rule)
    .filter((o) => {
      const end = (o.ends_at ?? o.starts_at).getTime();
      const inWindow = o.starts_at.getTime() <= toMs && end >= fromMs;
      return inWindow || (live && o.starts_at.getTime() <= fromMs && end >= fromMs);
    })
    .map((o) => ({
      id: `hub:${e.id}:${o.starts_at.toISOString()}`,
      title: e.title,
      description: e.description,
      starts_at: o.starts_at,
      ends_at: o.ends_at,
      timezone: CENTRAL_TZ,
      registration_url: e.registration_url,
      meeting_link: e.join_url,
      image_url: null,
      signup_count: null,
      is_registered: false,
      source: 'hub' as const,
      is_live: live,
      watch_url: null,
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
  const rows = await CommsHubEvent.findAll({ where: { status: { [Op.in]: ['scheduled', 'live'] } }, limit: 500 });
  return rows.filter((e) => visibleTo(e, cohortId)).flatMap((e) => toCards(e, fromMs, toMs));
}
