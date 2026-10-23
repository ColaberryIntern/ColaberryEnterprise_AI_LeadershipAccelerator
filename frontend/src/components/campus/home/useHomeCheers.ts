import { useCallback, useEffect, useRef } from 'react';
import type { BuildingId, CampusAudience, CampusBuilding } from '../campusMap';
import { buildingName } from '../campusMap';
import type { LookItem } from '../campusApi';
import { cheer } from '../campusCheerBus';
import { GEAR_ICON } from '../campusGear';
import { claimDailyStreak } from '../../../services/onboardingApi';
import type { StreakView } from '../../../services/onboardingApi';
import { emitPointsEarned } from '../../../services/pointsFx';
import { VIEW_AS_TOKEN_KEY } from '../../../utils/participantToken';

/**
 * The campus home's points feedback (WP-4; the prototype's awardPoints and quickEnter, D:3190-3203 and D:3563-3570):
 *  - an item crossed into "unlocked" since the last look: "<icon> Unlocked: <item>" with a Locker button. The build never puts it
 *    on for you (equipping is yours, in the locker), so the line says where to wear it rather than "now showing on your avatar";
 *  - "👋 Welcome back · You were last at <building> [Go back in]" when you come back without the gate (the building is kept per
 *    account in this browser, colaberry.campus.lastB.<account>);
 *  - the daily streak claimed as you walk through the gate (decision Q9): "+n pts · 🔥 Day n streak claimed" and the "+n pts" burst.
 *    Never in a staff view-as session (a write would land on the learner's account), never twice (the server answers awarded:false).
 */
export const UNLOCK_ICON = GEAR_ICON;

export function useUnlockCheer(catalog: LookItem[] | undefined, onLocker: () => void): void {
  const seen = useRef<Set<string> | null>(null);
  const locker = useRef(onLocker);
  locker.current = onLocker;
  useEffect(() => {
    if (!catalog) return;
    const now = new Set(catalog.filter((i) => i.unlocked).map((i) => i.id));
    if (seen.current) {
      for (const it of catalog) {
        if (!it.unlocked || seen.current.has(it.id)) continue;
        cheer({ big: UNLOCK_ICON[it.id] ?? '🎁', title: `Unlocked: ${it.name}`, detail: `Earned at ${it.threshold.toLocaleString('en-US')} pts · wear it from your locker`,
          action: { label: 'Locker', run: () => locker.current() }, ms: 5200 });
      }
    }
    seen.current = now;
  }, [catalog]);
}

const lastKey = (audience: CampusAudience) => `colaberry.campus.lastB.${audience}`;

export function readLastBuilding(audience: CampusAudience, buildings: CampusBuilding[]): BuildingId | null {
  try {
    const id = window.localStorage.getItem(lastKey(audience));
    return id && buildings.some((b) => b.id === id && b.kind !== 'gate') ? (id as BuildingId) : null;
  } catch { return null; }
}

/** Remembers where you are; and, once, welcomes you back to where you were last time (when you came in past the gate). */
export function useWelcomeBack(o: { audience: CampusAudience; buildings: CampusBuilding[]; workplace: boolean; skippedGate: boolean; here: BuildingId | null; goTo: (id: BuildingId) => void }): void {
  const { audience, buildings, workplace, skippedGate, here, goTo } = o;
  const done = useRef(false);
  const go = useRef(goTo);
  go.current = goTo;
  useEffect(() => {
    if (done.current || !buildings.length) return undefined;
    done.current = true;
    const last = readLastBuilding(audience, buildings);
    const b = last ? buildings.find((x) => x.id === last) : undefined;
    if (!skippedGate || here || !b) return undefined;
    const t = window.setTimeout(() => cheer({ big: '👋', title: 'Welcome back', detail: `You were last at ${buildingName(b, workplace)}`,
      action: { label: 'Go back in', run: () => go.current(b.id) }, ms: 5200 }), 400);
    return () => window.clearTimeout(t);
  }, [audience, buildings, workplace, skippedGate, here]);
  useEffect(() => {
    if (!here) return;
    try { window.localStorage.setItem(lastKey(audience), here); } catch { /* no storage: nothing to welcome back to */ }
  }, [audience, here]);
}

/** A staff member viewing as a learner must never claim on their behalf (unsure, e.g. no storage: treated as view-as). */
export function inViewAs(): boolean {
  try { return !!window.sessionStorage.getItem(VIEW_AS_TOKEN_KEY); } catch { return true; }
}

/** The gate's claim (Q9): resolves once the server has answered (the top bar takes the new streak), quietly on any failure. */
export function useGateStreak(o: { audience: CampusAudience; claimedToday: boolean | null; onStreak: (s: Pick<StreakView, 'count' | 'claimed_today'>) => void; onPoints: () => void }) {
  const { audience, claimedToday, onStreak, onPoints } = o;
  return useCallback(async (): Promise<void> => {
    if (audience !== 'member' || claimedToday !== false || inViewAs()) return;
    try {
      const r = await claimDailyStreak();
      onStreak(r.streak);
      if (!r.awarded) return;
      emitPointsEarned(r.points);
      onPoints();
      cheer({ title: `+${r.points} pts`, detail: `🔥 Day ${r.streak.count} streak claimed`, ms: 2600 });
    } catch (e) {
      console.warn(JSON.stringify({ event: 'campus_gate_streak_claim_failed', error_class: (e as Error)?.name ?? 'Error' }));
    }
  }, [audience, claimedToday, onStreak, onPoints]);
}
