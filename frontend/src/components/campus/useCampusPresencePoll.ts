import { useEffect, useState } from 'react';
import { fetchCampusPresence, postCampusHere, isReadOnlySession, CampusPresence } from './campusApi';
import { buildingForPath } from './campusMap';

export const PRESENCE_POLL_MS = 30_000;

export interface CampusPresenceState {
  /** Who is in each building, or null before the first successful read. */
  presence: CampusPresence | null;
  /** True when the last read failed: the UI says "We can't load who's online", never "empty". */
  presenceError: boolean;
}

/**
 * Presence by building (Colaberry Campus C4). Runs ONLY while the campus is active for this learner
 * and the tab is visible; nothing is requested otherwise (the pilot gate also refuses on the server).
 *
 * Each 30 s tick, single flight: record "I am in the building for this page" (skipped for a
 * read-only "view as" session and for pages that belong to no building), then read presence.
 * The page comes from window.location, which the browser router keeps in sync, so this hook does
 * not depend on router context. A failed write is non-fatal (the read still runs); a failed read
 * sets presenceError and keeps the last good data off screen rather than pretending it is fresh.
 */
/**
 * True when two presence answers say the same thing. The server builds them deterministically (same areas, same order), so a
 * structural compare is exact. After a failed read presence is null, so the next good read always renders, even if its data
 * matches what was shown before the failure.
 */
export function samePresence(a: CampusPresence | null, b: CampusPresence | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useCampusPresencePoll(active: boolean, share = true): CampusPresenceState {
  const [presence, setPresence] = useState<CampusPresence | null>(null);
  const [presenceError, setPresenceError] = useState(false);

  useEffect(() => {
    if (!active) { setPresence(null); setPresenceError(false); return undefined; }
    let alive = true;
    let inflight = false;

    const tick = async (): Promise<void> => {
      if (inflight || document.visibilityState === 'hidden') return;
      inflight = true;
      try {
        const area = buildingForPath(window.location.pathname)?.id;
        if (area && !isReadOnlySession()) {
          // Recording where I am must never block seeing who else is here; the server logs it.
          // WP-7 (Q14): with sharing off this asks the server to FORGET my building, so no building counts me.
          await postCampusHere(area, share).catch(() => undefined);
        }
        const next = await fetchCampusPresence();
        // C11 (the map stays light): an unchanged answer keeps the SAME object, so nothing re-renders every 30 s.
        if (alive) { setPresence((prev) => (samePresence(prev, next) ? prev : next)); setPresenceError(false); }
      } catch {
        if (alive) { setPresence(null); setPresenceError(true); }
      } finally {
        inflight = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => { void tick(); }, PRESENCE_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [active, share]);

  return { presence, presenceError };
}
