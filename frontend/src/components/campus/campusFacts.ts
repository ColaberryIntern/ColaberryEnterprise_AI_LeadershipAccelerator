import { getNextSession, fetchPublicEvents } from '../../services/onboardingApi';
import type { NextLiveSession, OpenHouseView } from '../../services/onboardingApi';
import { getCertEvidence } from '../../services/certPrepApi';
import { fetchGameTime } from './games/gameRoomApi';
import type { GameTime } from './games/gameRoomApi';
import { parseSessionTimeToHHMM } from '../../utils/sessionTime';
import type { BuildingId, CampusAudience } from './campusMap';
import type { Happening } from './BuildingCard';
import { levelOfRung } from '../../services/bandLadder';

/**
 * What is really true about a building right now (WP-2, the prototype's "Happening here" rows and the urgent CTA), from the
 * portal's own APIs, never invented:
 *   Classroom   - the next live class (GET /next-session), today's plan minutes
 *   Schedule    - today's plan minutes, the next class, the next event
 *   Events Hall - the next event (GET /events)
 *   Cert Prep   - objectives verified (GET /cert-prep/evidence; members only, the page is paywalled)
 *   My Progress - your level, rung and points (the campus look)
 *   Game Room   - break time left today (GET /game-room/time)
 * A source that fails or has nothing to say adds no row (the caller then falls back to presence or "Quiet right now").
 *
 * Each source is read at most once a minute per browser tab (a small promise cache), only when a building that shows it opens.
 */
export interface ArrivalData {
  session?: NextLiveSession | null;
  event?: OpenHouseView | null;
  certVerified?: { verified: number; total: number } | null;
  gameTime?: GameTime | null;
}
export interface LookFacts { points: number | null; rung: string | null; planMinutes: number | null }

const SOURCES: Partial<Record<BuildingId, (keyof ArrivalData)[]>> = {
  lecture: ['session'], tower: ['session', 'event'], amphi: ['event'], testing: ['certVerified'], arcade: ['gameTime'],
};
/** Cert evidence only for a member who can open Cert Prep (otherwise the paywall answers 402 and there is nothing to say). */
export const sourcesFor = (id: BuildingId, audience: CampusAudience, open = true): (keyof ArrivalData)[] =>
  (SOURCES[id] ?? []).filter((s) => s !== 'certVerified' || (audience === 'member' && open));

/** "in 1d 3h" / "in 3h 20m" / "in 12 min" / "now" (the prototype's countdown words). More than 15 minutes in the past is never
 *  "now": it says "earlier today", or the date. */
export function inLabel(ms: number, now: number): string {
  const m = Math.round((ms - now) / 60000);
  if (m < -15) {
    const day = (t: number) => new Date(t).toDateString();
    return day(ms) === day(now) ? 'earlier today' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(ms);
  }
  if (m <= 0) return 'now';
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h ${m % 60}m`;
  return `in ${Math.floor(h / 24)}d ${h % 24}h`;
}

/** The session's start, built the way the portal's own countdown builds it (NextLiveClassCard, PortalShell). */
export function sessionStartMs(s: Pick<NextLiveSession, 'session_date' | 'start_time'>): number | null {
  if (!s.session_date) return null;
  const hhmm = parseSessionTimeToHHMM(s.start_time || '09:00');
  const t = hhmm ? new Date(`${s.session_date}T${hhmm}:00`).getTime() : NaN;
  return Number.isNaN(t) ? null : t;
}

/** Something starting within 15 minutes (or live now) here: the CTA becomes "<it> · go now", as the prototype's urgent moment. */
export function urgentAt(id: BuildingId, d: ArrivalData, now: number): { label: string; route: string } | null {
  const s = d.session;
  if ((id !== 'lecture' && id !== 'tower') || !s) return null;
  const start = sessionStartMs(s);
  const soon = s.status === 'live' || (start !== null && start - now <= 15 * 60000 && start - now > -60 * 60000);
  return soon ? { label: `${s.title || 'Live class'} · go now`, route: '/portal/sessions' } : null;
}

const fmt = (n: number) => n.toLocaleString('en-US');

export function factsAt(id: BuildingId, d: ArrivalData, look: LookFacts, now: number): Happening[] {
  const out: Happening[] = [];
  const plan = (look.planMinutes ?? 0) > 0 ? { title: 'Today’s plan', detail: `~${look.planMinutes} min waiting`, tone: 'live' as const } : null;
  const s = d.session;
  const start = s ? sessionStartMs(s) : null;
  const cls = s ? { title: 'Next live class', detail: s.status === 'live' ? `${s.title || 'Live class'} · live now` : `${s.title || 'Live class'}${start ? ` · ${inLabel(start, now)}` : ''}`, tone: (s.status === 'live' ? 'hot' : '') as Happening['tone'] } : null;
  const e = d.event;
  const ev = e ? { title: e.title, detail: inLabel(new Date(e.starts_at).getTime(), now), tone: '' as const } : null;
  if (id === 'lecture') { if (plan) out.push(plan); if (cls) out.push(cls); }
  if (id === 'tower') { if (plan) out.push({ ...plan, title: 'Today' }); if (cls) out.push(cls); if (ev) out.push({ ...ev, title: 'Next event', detail: `${e!.title} · ${ev.detail}` }); }
  if (id === 'amphi' && ev) out.push(ev);
  if (id === 'testing' && d.certVerified && d.certVerified.total > 0) {
    out.push({ title: 'Skill proficiency', detail: `${d.certVerified.verified} / ${d.certVerified.total} objectives verified`, tone: '' });
  }
  if (id === 'observatory' && look.rung) {
    const lv = levelOfRung(look.rung);
    out.push({ title: `${lv ? `Lv ${lv} · ` : ''}${look.rung}`, detail: look.points !== null ? `${fmt(look.points)} pts` : 'Your level', tone: '' });
  }
  if (id === 'arcade' && d.gameTime) {
    const left = Math.max(0, Math.round(d.gameTime.left_s / 60));
    out.push({ title: 'Your break time today', detail: left > 0 ? `${left} min left · resets at midnight Central` : 'Used up · back tomorrow', tone: left > 0 ? 'live' : '' });
  }
  return out;
}

// ---- the fetch layer: one read per source per minute, failures are "nothing to say" ----
const TTL_MS = 60_000;
const cache = new Map<keyof ArrivalData, { at: number; p: Promise<unknown> }>();
const LOADERS: Record<keyof ArrivalData, () => Promise<unknown>> = {
  session: () => getNextSession(),
  event: () => fetchPublicEvents(30).then((evs) => evs.filter((x) => new Date(x.starts_at).getTime() > Date.now())
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0] ?? null),
  certVerified: () => getCertEvidence().then((r) => ({ verified: r.data.verified, total: r.data.total })),
  gameTime: () => fetchGameTime(),
};
function load(k: keyof ArrivalData): Promise<unknown> {
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p;
  const p = Promise.resolve().then(LOADERS[k]).catch((e) => {
    console.warn(JSON.stringify({ event: 'campus_fact_unavailable', source: k, error_class: (e as Error)?.name ?? 'Error' }));
    return null;
  });
  cache.set(k, { at: Date.now(), p });
  return p;
}
export async function loadArrival(id: BuildingId, audience: CampusAudience, open = true): Promise<ArrivalData> {
  const keys = sourcesFor(id, audience, open);
  const vals = await Promise.all(keys.map(load));
  return Object.fromEntries(keys.map((k, i) => [k, vals[i]])) as ArrivalData;
}
/** Tests only: forget cached reads. */
export function resetArrivalCache(): void { cache.clear(); }
