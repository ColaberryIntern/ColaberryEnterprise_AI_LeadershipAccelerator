import { useCallback, useEffect, useState } from 'react';
import { fetchLook, putLook, CampusLook } from './campusApi';

export interface CampusLookState {
  /** My points, level, catalog and what I wear; null until read, or when the read failed. */
  look: CampusLook | null;
  lookError: boolean;
  /** Save the COMPLETE set. Resolves with the saved look; rejects with a message (the previous look stays). */
  saveLook: (equipped: Record<string, string | null>) => Promise<CampusLook>;
  /** WP-2: read it again (points were just earned on the campus). A failed re-read keeps the look already shown. */
  reloadLook: () => void;
}

/**
 * "My look" (Colaberry Campus C9), read ONCE per campus session and only while the campus is active (nothing is requested with
 * the campus off). A failed read hides the gear and the locker says so; it never blocks the map.
 */
export function useCampusLook(active: boolean): CampusLookState {
  const [look, setLook] = useState<CampusLook | null>(null);
  const [lookError, setLookError] = useState(false);
  useEffect(() => {
    if (!active) { setLook(null); setLookError(false); return undefined; }
    let alive = true;
    // Promise.resolve().then(...): even a synchronous throw from the client becomes a failed read, never a crashed effect.
    Promise.resolve().then(() => fetchLook())
      .then((l) => { if (alive) { setLook(l); setLookError(false); } })
      .catch(() => { if (alive) { setLook(null); setLookError(true); } });
    return () => { alive = false; };
  }, [active]);
  const saveLook = useCallback(async (equipped: Record<string, string | null>) => {
    const saved = await putLook(equipped); // throws: the caller shows the message, the previous look stays
    setLook(saved);
    setLookError(false);
    return saved;
  }, []);
  const reloadLook = useCallback(() => {
    Promise.resolve().then(() => fetchLook()).then((l) => { setLook(l); setLookError(false); })
      .catch((e) => console.warn(JSON.stringify({ event: 'campus_look_reload_failed', error_class: (e as Error)?.name ?? 'Error' })));
  }, []);
  return { look, lookError, saveLook, reloadLook };
}
