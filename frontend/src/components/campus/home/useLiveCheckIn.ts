import { useEffect } from 'react';
import { joinSession } from '../../../services/onboardingApi';
import { cheer } from '../campusCheerBus';
import { isReadOnlySession } from '../campusApi';
import type { CampusAudience, BuildingId } from '../campusMap';
import type { CampusLiveNow } from '../campusOnAir';

/**
 * Auto check-in (WP-6's A4.4, unblocked by #3346 and decision Q2): walking into the live Classroom while your class is ON AIR
 * checks you in, through the portal's own POST /api/portal/sessions/:id/join (idempotent: attendance is find-or-create, the points
 * are awarded once per session by their event key). "Checked in" cheers, with "+n pts" the first time.
 *
 * Only a member (class sessions belong to a cohort; anyone else is answered 404), only while live (not reconnecting), never in a
 * read-only "view as" session. Once per session per browser session (sessionStorage): a success or a 404 (not your class) is
 * remembered; any other failure is left to the next arrival, since the server makes a retry harmless.
 */
export const CHECKED_KEY = 'colaberry.campus.checkedIn';

function readChecked(): string[] {
  try { return JSON.parse(window.sessionStorage.getItem(CHECKED_KEY) || '[]') as string[]; } catch { return []; }
}
function remember(id: string): void {
  try { window.sessionStorage.setItem(CHECKED_KEY, JSON.stringify([...readChecked().filter((x) => x !== id), id].slice(-20))); } catch { /* no storage */ }
}

export function shouldCheckIn(audience: CampusAudience, live: CampusLiveNow | null, hereId: BuildingId | null): string | null {
  const sid = live?.b.session_id;
  if (audience !== 'member' || !live || !sid || live.state !== 'live' || !live.building || hereId !== live.building) return null;
  return readChecked().includes(sid) ? null : sid;
}

export function useLiveCheckIn(audience: CampusAudience, live: CampusLiveNow | null, hereId: BuildingId | null): void {
  const sid = shouldCheckIn(audience, live, hereId);
  const title = live?.b.title ?? '';
  useEffect(() => {
    if (!sid || isReadOnlySession()) return undefined;
    let alive = true;
    remember(sid); // claimed before the request, so two quick arrivals send one join
    joinSession(sid, 'classroom')
      .then((r) => { if (alive) cheer({ big: '✅', title: `Checked in · ${title}`, detail: r.awarded && r.points ? `+${r.points} pts for attending` : 'Your attendance is recorded', ms: 3600 }); })
      .catch((e: { response?: { status?: number }; name?: string }) => {
        if (e?.response?.status !== 404) {
          try { const list = readChecked().filter((x) => x !== sid); window.sessionStorage.setItem(CHECKED_KEY, JSON.stringify(list)); } catch { /* no storage */ }
        }
        console.warn(JSON.stringify({ event: 'campus_live_checkin_failed', error_class: e?.response?.status === 404 ? 'NotYourSession' : (e?.name || 'Error') }));
      });
    return () => { alive = false; };
  }, [sid, title]);
}
