import { useEffect, useState } from 'react';

/**
 * The clock a "Join" link reads: re-checked every 30 s while a sheet is open, so the link appears on time. A fixed
 * value (tests, screenshots) stops the timer.
 */
export function useClock(fixed?: number): number {
  const [t, setT] = useState(() => fixed ?? Date.now());
  useEffect(() => { if (fixed !== undefined) return undefined; const id = window.setInterval(() => setT(Date.now()), 30_000); return () => window.clearInterval(id); }, [fixed]);
  return fixed ?? t;
}
