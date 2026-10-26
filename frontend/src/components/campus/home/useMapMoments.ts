import { useEffect, useState } from 'react';
import type { CampusAudience } from '../campusMap';
import type { MapMoments } from '../CampusWorldMap';
import { loadArrival, sessionStartMs, urgentAt } from '../campusFacts';
import type { ArrivalData } from '../campusFacts';
import { EVENTS_BUILDING } from '../campusRoomKind';

/**
 * What a member's map says is next (WP-3; the prototype's moment badges and urgent ring), from real data only:
 *  - the Classroom: "Live now" while the class is live, "Class in 12 min" (red, and the urgent ring) within 15 minutes, else
 *    "Class in 1d 3h";
 *  - the Events Hall: the next event, "In 15d" / "In 3h" / "Today".
 * A source that fails or has nothing to say draws no badge. The clock ticks every 30 s so the ring starts on time. Members only, as
 * in the prototype (Explorers keep their access badges).
 */
const TICK_MS = 30_000;

/** "1d 3h" / "3h 20m" / "12 min" (null when it is in the past). */
export function shortIn(ms: number, now: number): string | null {
  const m = Math.round((ms - now) / 60000);
  if (m < 0) return null;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function momentsFrom(lecture: ArrivalData, events: ArrivalData, now: number): MapMoments {
  const out: MapMoments = { urgent: null, badges: {} };
  const s = lecture.session;
  if (s) {
    const start = sessionStartMs(s);
    const left = start !== null ? shortIn(start, now) : null;
    if (s.status === 'live') out.badges.lecture = { text: 'Live now', tone: 'hot' };
    else if (left) out.badges.lecture = { text: `Class in ${left}`, tone: start! - now <= 15 * 60000 ? 'hot' : '' };
    if (urgentAt('lecture', lecture, now)) out.urgent = 'lecture';
  }
  const e = events.event;
  if (e) {
    const m = Math.round((new Date(e.starts_at).getTime() - now) / 60000);
    if (m >= 0) out.badges[EVENTS_BUILDING] = { text: m >= 1440 ? `In ${Math.floor(m / 1440)}d` : m >= 60 ? `In ${Math.floor(m / 60)}h` : 'Today', tone: '' };
  }
  return out;
}

/** WP-4: what is coming up, for the map's badges and the panel's Right now and urgent card: a member's next live class and, for
 *  everyone, the next event. Re-read on the tick (the facts are cached a minute, campusFacts). */
/** C62: `events` is the next event, read where events happen (the Meeting Rooms). */
export interface HomeAgenda { lecture: ArrivalData; events: ArrivalData; now: number }
export function useHomeAgenda(audience: CampusAudience, active: boolean): HomeAgenda | null {
  const [data, setData] = useState<{ lecture: ArrivalData; events: ArrivalData } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    const load = () => Promise.all([audience === 'member' ? loadArrival('lecture', audience) : Promise.resolve<ArrivalData>({}), loadArrival(EVENTS_BUILDING, audience)])
      .then(([lecture, events]) => { if (alive) setData({ lecture, events }); });
    load();
    const t = window.setInterval(() => { setNow(Date.now()); load(); }, TICK_MS);
    return () => { alive = false; window.clearInterval(t); };
  }, [audience, active]);
  return data ? { ...data, now } : null;
}

/** The map's moments: members only, as in the prototype (Explorers keep their access badges). */
export function mapMoments(audience: CampusAudience, agenda: HomeAgenda | null): MapMoments | undefined {
  return audience === 'member' && agenda ? momentsFrom(agenda.lecture, agenda.events, agenda.now) : undefined;
}
