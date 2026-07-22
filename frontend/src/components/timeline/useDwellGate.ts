/**
 * useDwellGate — client half of the generic "sit with it for N seconds" gate for
 * passive-content cards (intel breakdowns, reflections, discussions, study, Q&A).
 *
 * Armed whenever the card is open in the drawer (no explicit start — the content
 * IS the drawer). A heartbeat posts the wall-clock delta since the last beat every
 * ~10s; the server accumulates continuous dwell, returns { dwell_s, required_s,
 * met }, and resets the window if the student leaves (the drawer unmounts and the
 * beats stop). Same shape as useBlogReadGate.
 */
import { useEffect, useRef, useState } from 'react';
import { runtimeApi } from '../../pages/portal/runtime/runtimeApi';

export interface DwellState { dwell_s: number; required_s: number; met: boolean; }

// render_bands that are passive content with points, no native gate, and no other
// completion path — so the dwell gate is purely additive. Mirrors backend
// dwellGateConfig.DWELL_GATED_BANDS (currently the `intel` pipeline). The required
// seconds come back in the beat response, so only the SET needs mirroring.
const DWELL_GATED_BANDS = new Set(['intel']);

/** True when a card should be gated by the generic dwell timer. Anchored (real
 *  card_id) points-cards only — ambient refs (`provider:id`) have their own gates. */
export function isDwellGatedCard(card: { id: string; render_band: string; points?: { learning?: number; builder?: number; community?: number } | null }): boolean {
  const p = card.points || {};
  const pts = (p.learning || 0) + (p.builder || 0) + (p.community || 0);
  return DWELL_GATED_BANDS.has(card.render_band) && pts > 0 && !card.id.includes(':');
}

export function useDwellGate(cardId: string | null, active: boolean): DwellState | null {
  const [state, setState] = useState<DwellState | null>(null);
  const lastBeatRef = useRef<number>(0);

  useEffect(() => {
    if (!cardId || !active) return;
    let alive = true;
    lastBeatRef.current = Date.now();
    const beat = () => {
      const now = Date.now();
      const delta = Math.max(0, Math.round((now - lastBeatRef.current) / 1000));
      lastBeatRef.current = now;
      if (delta <= 0) return;
      runtimeApi.cardDwell(cardId, { delta_s: delta })
        .then((s) => { if (alive) setState(s); })
        .catch(() => { /* best-effort heartbeat */ });
    };
    const id = window.setInterval(beat, 10000);
    return () => { alive = false; window.clearInterval(id); };
  }, [cardId, active]);

  return state;
}
