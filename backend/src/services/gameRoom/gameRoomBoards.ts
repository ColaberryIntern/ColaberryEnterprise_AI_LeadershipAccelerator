import { centralWeekStart } from './gameRoomTime';
import { GAMES, GameId } from './gameRoomRules';
import { gameRoomStore } from './gameRoomService';
import type { Profile, ScoredRun } from './gameRoomStore';
import { visibleSetFor } from '../campus/campusPresenceService';
import { looksFor } from '../campus/campusLookService';

/**
 * The Game Room's boards (Campus v8 G4, Basecamp C35): the leaderboard by scope and period with your own row, the week's summary
 * (your week, the champion per game, recent highs) and who is playing now. Read-only; nothing here touches learning points.
 *
 * PRIVACY. "My cohort" names your cohort, as the C10 board always has. "Everyone" (scope=all) and "playing now" name a person only
 * if the campus presence rule names them for you (visibleSetFor, the People panel's own set) or they are in your cohort; everyone
 * else is a "Colaberry learner" with no photo, rung or cohort. Your own row is always yours.
 */
export type Scope = 'cohort' | 'all';
export type Period = 'week' | 'all';
export const TOP_N = 10;
export const RECENT_N = 10;
export const PLAYING_WINDOW_MS = 30_000;
const ANON = 'Colaberry learner';
const EPOCH = '1970-01-01';

export interface BoardRowV2 { rank: number; name: string; display_name: string; avatar_url: string | null; rung_name: string | null; cohort_name: string | null; score: number; you: boolean }
export interface BoardV2 { week_start: string; rows: BoardRowV2[]; me: { best: number; rank: number } | null }

/** Pure: best per person, sorted, dense-ranked (ties share a rank). */
export function rankBest(rows: { enrollment_id: string; score: number }[]): Array<{ id: string; score: number; rank: number }> {
  const best = new Map<string, number>();
  for (const r of rows) best.set(r.enrollment_id, Math.max(best.get(r.enrollment_id) ?? 0, r.score));
  const list = [...best.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  let rank = 0; let prev: number | null = null;
  return list.map((r) => { if (r.score !== prev) { rank += 1; prev = r.score; } return { ...r, rank }; });
}

/** Who may be named for this viewer: the presence rule's set, plus (cohort scope) everyone on the cohort board. */
async function namedFor(viewer: string, cohortId: string | null, cohortIds: Set<string>): Promise<(id: string) => boolean> {
  const visible = await visibleSetFor(viewer, cohortId);
  return (id: string) => id === viewer || cohortIds.has(id) || visible.has(id);
}

export async function board(viewer: string, cohortId: string | null, game: GameId, scope: Scope = 'cohort', period: Period = 'week', nowMs = Date.now()): Promise<BoardV2> {
  const s = gameRoomStore();
  await s.ensureSchema();
  const weekStart = centralWeekStart(nowMs);
  const rows = await s.scoresSince({ game, since: period === 'week' ? weekStart : EPOCH, cohortId, enrollmentId: viewer, all: scope === 'all' });
  const ranked = rankBest(rows);
  const top = ranked.slice(0, TOP_N);
  const mine = ranked.find((r) => r.id === viewer) ?? null;
  const ids = top.map((r) => r.id);
  const cohortMates = scope === 'cohort' ? new Set(ranked.map((r) => r.id)) : new Set<string>();
  const [profiles, may, looks] = await Promise.all([s.profilesFor(ids), namedFor(viewer, cohortId, cohortMates), looksFor(ids)]);
  const rowsOut = top.map((r): BoardRowV2 => {
    const p: Profile | undefined = profiles.get(r.id);
    const named = may(r.id) && !!p;
    const name = named ? p!.display_name : ANON;
    return { rank: r.rank, name, display_name: name, avatar_url: named ? p!.avatar_url : null, rung_name: named ? looks.get(r.id)?.rung_name ?? null : null,
      cohort_name: named ? p!.cohort_name : null, score: r.score, you: r.id === viewer };
  });
  return { week_start: weekStart, rows: rowsOut, me: mine ? { best: mine.score, rank: mine.rank } : null };
}

export interface RecentHigh { kind: 'best' | 'top'; name: string; enrollment_id: string; game: GameId; score: number; at: string }
export interface Summary {
  week_start: string;
  your_week: { played: number; best_game: GameId | null; best_score: number | null; best_rank: number | null };
  champions: Array<{ game: GameId; name: string; avatar_url: string | null; score: number } | { game: GameId; name: null; avatar_url: null; score: null }>;
  recent: RecentHigh[];
}

/** Pure: new personal bests (beating a best that already existed) and #1 takeovers, in order, from the week's runs. */
export function recentHighs(runs: ScoredRun[], bestsBefore: Map<string, number>): Array<Omit<RecentHigh, 'name'>> {
  const best = new Map(bestsBefore);
  const leader = new Map<string, { id: string; score: number }>();
  const out: Array<Omit<RecentHigh, 'name'>> = [];
  for (const r of runs) {
    const k = `${r.enrollment_id}|${r.game}`;
    const prev = best.get(k);
    const top = leader.get(r.game);
    const at = new Date(r.submitted_at).toISOString();
    if (top && top.id !== r.enrollment_id && r.score > top.score) out.push({ kind: 'top', enrollment_id: r.enrollment_id, game: r.game as GameId, score: r.score, at });
    else if (prev !== undefined && r.score > prev) out.push({ kind: 'best', enrollment_id: r.enrollment_id, game: r.game as GameId, score: r.score, at });
    if (prev === undefined || r.score > prev) best.set(k, r.score);
    if (!top || r.score > top.score) leader.set(r.game, { id: r.enrollment_id, score: r.score });
  }
  return out;
}

export async function summary(viewer: string, cohortId: string | null, nowMs = Date.now()): Promise<Summary> {
  const s = gameRoomStore();
  await s.ensureSchema();
  const weekStart = centralWeekStart(nowMs);
  const runs = await s.runsSince({ since: weekStart, cohortId, enrollmentId: viewer });
  const ids = [...new Set(runs.map((r) => r.enrollment_id))];
  const [before, profiles] = await Promise.all([s.bestsBefore({ before: weekStart, enrollmentIds: ids }), s.profilesFor(ids)]);
  const nameOf = (id: string) => profiles.get(id)?.display_name ?? ANON;
  const mine = runs.filter((r) => r.enrollment_id === viewer);
  const myBest = mine.reduce<ScoredRun | null>((b, r) => (!b || r.score > b.score ? r : b), null);
  const ranks = [...new Set(mine.map((r) => r.game))].map((g) => rankBest(runs.filter((r) => r.game === g)).find((x) => x.id === viewer)?.rank ?? Infinity);
  const champions = GAMES.map((game) => {
    const top = rankBest(runs.filter((r) => r.game === game))[0];
    return top ? { game, name: nameOf(top.id), avatar_url: profiles.get(top.id)?.avatar_url ?? null, score: top.score } : { game, name: null, avatar_url: null, score: null };
  });
  const recent = recentHighs(runs, before).reverse().slice(0, RECENT_N).map((h) => ({ ...h, name: nameOf(h.enrollment_id) }));
  return {
    week_start: weekStart,
    your_week: { played: mine.length, best_game: (myBest?.game as GameId) ?? null, best_score: myBest?.score ?? null, best_rank: ranks.length ? Math.min(...ranks) : null },
    champions, recent,
  };
}

/** Who is in a game right now (a run that beat in the last 30 s), named only as the presence rule allows; the rest counted. */
export async function playingNow(viewer: string, cohortId: string | null, nowMs = Date.now()): Promise<{ count: number; people: Array<{ name: string; game: GameId }> }> {
  const s = gameRoomStore();
  await s.ensureSchema();
  const active = (await s.activeSince(new Date(nowMs - PLAYING_WINDOW_MS))).filter((a) => a.enrollment_id !== viewer);
  const one = new Map(active.map((a) => [a.enrollment_id, a.game as GameId]));
  const visible = await visibleSetFor(viewer, cohortId);
  const people = [...one.entries()].filter(([id]) => visible.has(id)).map(([id, game]) => ({ name: visible.get(id)!.display_name, game }));
  return { count: one.size, people };
}
