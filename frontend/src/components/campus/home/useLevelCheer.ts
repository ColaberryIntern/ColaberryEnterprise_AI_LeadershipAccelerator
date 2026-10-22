import { useEffect, useRef } from 'react';
import { levelOfRung } from '../../../services/bandLadder';
import { cheer } from '../campusCheerBus';

/**
 * The level-up cheer (WP-2; the prototype's awardPoints level cheer): when the campus look comes back with a HIGHER rung than the
 * one already shown (points were just earned), "⭐ Level n! Your new level shows on your badge around campus". The first read of
 * the session sets the baseline; it never cheers for a level you already had.
 */
export function useLevelCheer(rung: string | null): void {
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!rung) return;
    const before = levelOfRung(seen.current);
    const now = levelOfRung(rung);
    if (seen.current !== null && before !== null && now !== null && now > before) {
      cheer({ big: '⭐', title: `Level ${now}! ${rung}`, detail: 'Your new level shows on your badge around campus', ms: 4200 });
    }
    seen.current = rung;
  }, [rung]);
}
