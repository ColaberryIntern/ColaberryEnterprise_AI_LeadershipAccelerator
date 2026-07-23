import { useEffect, useState } from 'react';
import { loadSchedule, getCachedSchedule } from './scheduleCache';

/**
 * True for a free Explorer (unenrolled prospect). Drives DEMO MODE across the
 * portal — Explorers can click around Projects but can't run prompts, mark done,
 * skip, or actually create a build. Backed by the shared scheduleCache so this
 * and useEntitlement (which reads the same payload) fire one fetch, not two.
 */
export function useIsExplorer(): boolean {
  const seed = getCachedSchedule();
  const [isExplorer, setIsExplorer] = useState<boolean>(!!seed?.is_explorer);
  useEffect(() => {
    if (seed) return;
    let alive = true;
    loadSchedule()
      .then((s) => { if (alive) setIsExplorer(!!s.is_explorer); })
      .catch(() => { /* default: treat as enrolled (no demo lock) if unknown */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed is read once at mount by design
  }, []);
  return isExplorer;
}
