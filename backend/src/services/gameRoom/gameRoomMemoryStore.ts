import { randomUUID } from 'crypto';
import type { GameRoomStore, Profile, RunRow } from './gameRoomStore';

/**
 * An in-memory GameRoomStore for tests (C35's boards, summary, playing now). Never used in production (productionStore is the only
 * store the service builds). Its lock is a simple serializer; the race tests live in gameRoomService.test with their own store.
 */
export interface MemoryGameStore { store: GameRoomStore; runs: RunRow[]; profiles: Map<string, Profile>; add: (r: Partial<RunRow> & Pick<RunRow, 'enrollment_id' | 'game'>) => RunRow }

export function memoryGameStore(): MemoryGameStore {
  const runs: RunRow[] = [];
  const profiles = new Map<string, Profile>();
  let chain: Promise<unknown> = Promise.resolve();
  const add: MemoryGameStore['add'] = (r) => {
    const now = new Date();
    const row: RunRow = { id: randomUUID(), cohort_id: null, central_date: '2026-10-19', started_at: now, last_beat_at: now, seconds_used: 0, score: null, submitted_at: null, ...r };
    runs.push(row);
    return row;
  };
  const scoped = (r: RunRow, cohortId: string | null, enrollmentId: string, all?: boolean) => all || (cohortId ? r.cohort_id === cohortId : r.enrollment_id === enrollmentId);
  const store: GameRoomStore = {
    ensureSchema: async () => undefined,
    withDayLock: (_key, fn) => { const next = chain.then(() => fn(undefined)); chain = next.catch(() => undefined); return next; },
    findRun: async (id) => runs.find((x) => x.id === id) ?? null,
    usedOn: async (e, d) => runs.filter((r) => r.enrollment_id === e && r.central_date === d).reduce((a, r) => a + r.seconds_used, 0),
    insertRun: async (row) => add(row),
    updateRunIf: async (id, seen, patch) => {
      const r = runs.find((x) => x.id === id);
      if (!r || r.submitted_at || new Date(r.last_beat_at).getTime() !== new Date(seen).getTime()) return 0;
      Object.assign(r, patch);
      return 1;
    },
    scoresSince: async ({ game, since, cohortId, enrollmentId, all }) => runs
      .filter((r) => r.game === game && r.central_date >= since && r.score !== null && scoped(r, cohortId, enrollmentId, all))
      .map((r) => ({ enrollment_id: r.enrollment_id, score: r.score as number })),
    namesFor: async (ids) => new Map(ids.filter((i) => profiles.has(i)).map((i) => [i, profiles.get(i)!.display_name])),
    runsSince: async ({ since, cohortId, enrollmentId }) => runs
      .filter((r) => r.central_date >= since && r.score !== null && r.submitted_at && scoped(r, cohortId, enrollmentId))
      .sort((a, b) => new Date(a.submitted_at!).getTime() - new Date(b.submitted_at!).getTime())
      .map((r) => ({ enrollment_id: r.enrollment_id, game: r.game, score: r.score as number, submitted_at: r.submitted_at as Date })),
    bestsBefore: async ({ before, enrollmentIds }) => {
      const out = new Map<string, number>();
      for (const r of runs) {
        if (r.central_date >= before || r.score === null || !enrollmentIds.includes(r.enrollment_id)) continue;
        const k = `${r.enrollment_id}|${r.game}`;
        out.set(k, Math.max(out.get(k) ?? 0, r.score));
      }
      return out;
    },
    activeSince: async (since) => runs.filter((r) => !r.submitted_at && new Date(r.last_beat_at).getTime() >= since.getTime()).map((r) => ({ enrollment_id: r.enrollment_id, game: r.game })),
    profilesFor: async (ids) => new Map(ids.filter((i) => profiles.has(i)).map((i) => [i, profiles.get(i)!])),
  };
  return { store, runs, profiles, add };
}
