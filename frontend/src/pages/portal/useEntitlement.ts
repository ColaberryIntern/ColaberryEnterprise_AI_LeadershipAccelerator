import { useEffect, useState } from 'react';
import { loadSchedule, getCachedSchedule } from './scheduleCache';

export interface Entitlement {
  isStaff: boolean;
  hasFullAccess: boolean;
  loading: boolean;
}

/**
 * Page-level content entitlement (Classroom / Projects / Cert Prep paywall) —
 * `<PageGate>` and the sidebar nav lock badge both read this. Backed by the same
 * cached schedule fetch useIsExplorer uses (see scheduleCache), so using both
 * hooks together (as PortalShell does) costs exactly one network round trip.
 * Fails OPEN on fetch error (hasFullAccess stays true) — mirrors the backend's
 * own fail-open philosophy: never wrongly lock out a possibly-paying student
 * over a transient network hiccup.
 */
export function useEntitlement(): Entitlement {
  const seed = getCachedSchedule();
  const [state, setState] = useState<Entitlement>(
    seed
      ? { isStaff: !!seed.is_staff, hasFullAccess: seed.has_full_access !== false, loading: false }
      : { isStaff: false, hasFullAccess: true, loading: true },
  );

  useEffect(() => {
    if (seed) return;
    let alive = true;
    loadSchedule()
      .then((s) => { if (alive) setState({ isStaff: !!s.is_staff, hasFullAccess: s.has_full_access !== false, loading: false }); })
      .catch(() => { if (alive) setState({ isStaff: false, hasFullAccess: true, loading: false }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed is read once at mount by design
  }, []);

  return state;
}
