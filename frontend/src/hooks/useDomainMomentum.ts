/**
 * useDomainMomentum — per-domain completion delta over time.
 *
 * BP V2 Operational Architecture Sprint, 2026-05-12.
 *
 * Stores a per-domain `lastSeenPercent` snapshot in localStorage and
 * returns the delta + a human-readable momentum label whenever the
 * current architecture is freshly loaded. Snapshot is written when the
 * surface unmounts (so "last visit" = "last time you left").
 *
 * Returns one entry per provided bucket key:
 *   - delta: current - lastSeen  (null if no prior snapshot)
 *   - direction: 'up' | 'down' | 'flat' | 'first-visit'
 *   - label: editorial momentum word ("improving" / "stalled" / "stabilizing")
 *
 * No new endpoints. localStorage key: `bpDomainMomentum:v1`.
 */
import { useEffect, useMemo, useRef } from 'react';

const STORAGE_KEY = 'bpDomainMomentum:v1';

type Snapshot = Record<string, { pct: number; at: string }>;

export type Direction = 'up' | 'down' | 'flat' | 'first-visit';

export interface DomainMomentum {
  delta: number | null;
  direction: Direction;
  label: string;
  /** Minutes since the prior snapshot was recorded. */
  minutesSince: number | null;
}

function loadSnapshot(): Snapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSnapshot(snap: Snapshot) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snap)); }
  catch { /* ignore */ }
}

function labelFor(direction: Direction, delta: number | null): string {
  if (direction === 'first-visit') return 'baseline';
  if (direction === 'flat') return 'stable';
  if (direction === 'up') {
    if (delta != null && delta >= 10) return 'improving';
    if (delta != null && delta >= 3) return 'progressing';
    return 'edging up';
  }
  if (delta != null && delta <= -10) return 'regressed';
  if (delta != null && delta <= -3) return 'slipping';
  return 'stalled';
}

export function useDomainMomentum(
  buckets: { key: string; completionPercent: number }[],
): Record<string, DomainMomentum> {
  // Capture the snapshot at session start so momentum survives the
  // session — same pattern as useOperationalMomentum.
  const frozenRef = useRef<Snapshot | null>(null);
  if (frozenRef.current === null) {
    frozenRef.current = loadSnapshot();
  }
  const frozen = frozenRef.current;

  // Hold latest current values for the leave-handler.
  const latestRef = useRef(buckets);
  useEffect(() => { latestRef.current = buckets; }, [buckets]);

  // Write a fresh snapshot on leave (visibilitychange/unmount/beforeunload).
  useEffect(() => {
    const writeNow = () => {
      const current = latestRef.current;
      if (!current || current.length === 0) return;
      const next: Snapshot = { ...frozenRef.current };
      const at = new Date().toISOString();
      for (const b of current) {
        next[b.key] = { pct: b.completionPercent, at };
      }
      saveSnapshot(next);
    };
    const onVis = () => { if (document.visibilityState === 'hidden') writeNow(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeunload', writeNow);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('beforeunload', writeNow);
      writeNow();
    };
  }, []);

  return useMemo(() => {
    const now = Date.now();
    const out: Record<string, DomainMomentum> = {};
    for (const b of buckets) {
      const prior = frozen[b.key];
      if (!prior) {
        out[b.key] = { delta: null, direction: 'first-visit', label: 'baseline', minutesSince: null };
        continue;
      }
      const delta = b.completionPercent - prior.pct;
      const minutesSince = Math.max(0, Math.floor((now - new Date(prior.at).getTime()) / 60_000));
      let direction: Direction;
      if (Math.abs(delta) < 1) direction = 'flat';
      else if (delta > 0) direction = 'up';
      else direction = 'down';
      out[b.key] = {
        delta,
        direction,
        label: labelFor(direction, delta),
        minutesSince,
      };
    }
    return out;
  }, [buckets, frozen]);
}
