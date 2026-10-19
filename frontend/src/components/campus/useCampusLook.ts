import { useCallback, useEffect, useState } from 'react';
import { fetchLook, putLook, CampusLook } from './campusApi';

export interface CampusLookState {
  /** My points, level, catalog and what I wear; null until read, or when the read failed. */
  look: CampusLook | null;
  lookError: boolean;
  /** Save the COMPLETE set. Resolves with the saved look; rejects with a message (the previous look stays). */
  saveLook: (equipped: Record<string, string | null>) => Promise<CampusLook>;
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
  return { look, lookError, saveLook };
}
