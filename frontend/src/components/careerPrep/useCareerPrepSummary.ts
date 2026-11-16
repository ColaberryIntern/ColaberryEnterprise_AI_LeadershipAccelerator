import { useEffect, useState } from 'react';
import { fetchPrepSummary, type PrepSummary } from './careerPrepApi';

/**
 * The student's Career Prep summary, shared by the floor scene, the side panel and (CP5) the campus
 * card, so one page view makes one request. Cached for 60 s per page; a failure resolves to null and
 * the caller shows only what needs no data (the door still opens the room).
 */
const TTL_MS = 60_000;
let cached: { at: number; promise: Promise<PrepSummary | null> } | null = null;

export function loadCareerPrepSummary(now = Date.now()): Promise<PrepSummary | null> {
  if (!cached || now - cached.at > TTL_MS) cached = { at: now, promise: fetchPrepSummary().catch(() => null) };
  return cached.promise;
}

/** Tests only. */
export function resetCareerPrepSummaryCache(): void { cached = null; }

/** undefined while loading, null on failure, else the summary. */
export function useCareerPrepSummary(enabled = true): PrepSummary | null | undefined {
  const [s, setS] = useState<PrepSummary | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    loadCareerPrepSummary().then((v) => { if (live) setS(v); });
    return () => { live = false; };
  }, [enabled]);
  return s;
}
