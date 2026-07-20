import { useEffect, useState } from 'react';
import { fetchSchedule } from '../../services/onboardingApi';

/**
 * True for a free Explorer (unenrolled prospect). Drives DEMO MODE across the
 * portal — Explorers can click around Projects but can't run prompts, mark done,
 * skip, or actually create a build. Cached module-wide so it fetches once.
 */
let cached: boolean | null = null;

export function useIsExplorer(): boolean {
  const [isExplorer, setIsExplorer] = useState<boolean>(cached ?? false);
  useEffect(() => {
    if (cached !== null) { setIsExplorer(cached); return; }
    let alive = true;
    fetchSchedule()
      .then((s) => { cached = !!s.is_explorer; if (alive) setIsExplorer(cached); })
      .catch(() => { /* default: treat as enrolled (no demo lock) if unknown */ });
    return () => { alive = false; };
  }, []);
  return isExplorer;
}
