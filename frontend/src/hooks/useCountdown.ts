import { useEffect, useState } from 'react';

// Ticking countdown to a target timestamp (1s cadence). Extracted verbatim from
// PortalSessionDetailPage so the surfaces that count down to a live session
// (session detail page, the Today "Next live class" card) share one
// implementation. Returns null when there is no target or the target has passed.
export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

export function useCountdown(targetDate: string | null): Countdown | null {
  const [timeLeft, setTimeLeft] = useState<Countdown | null>(null);

  useEffect(() => {
    if (!targetDate) return;
    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft(null); return; }
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
        totalMs: diff,
      });
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return timeLeft;
}
