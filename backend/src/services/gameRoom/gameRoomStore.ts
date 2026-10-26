import { randomUUID } from 'crypto';
import { ensureGameScoresSchema } from '../../db/ensureGameScoresSchema';

/**
 * The Game Room's storage seam (Colaberry Campus C10). gameRoomService talks only to this interface, so its tests drive an in-memory
 * store whose lock is a real mutex; productionStore() is the Postgres implementation.
 *
 * ATOMICITY. Every credit runs inside withDayLock: one transaction holding pg_advisory_xact_lock(hashtext('game_room:<enrollment>:<date>')),
 * so two beats, or a beat and a submit, for the same learner and day are serialized; and updateRunIf is a CONDITIONAL update
 * (WHERE id = run AND last_beat_at = seen AND submitted_at IS NULL), so even outside the lock a stale writer changes nothing.
 */
export interface RunRow {
  id: string; enrollment_id: string; cohort_id: string | null; game: string; central_date: string;
  started_at: Date; last_beat_at: Date; seconds_used: number; score: number | null; submitted_at: Date | null;
}
export type RunPatch = Partial<Pick<RunRow, 'last_beat_at' | 'seconds_used' | 'score' | 'submitted_at'>>;
export interface ScoreRow { enrollment_id: string; score: number }
/** C35: an accepted run with when it was submitted (recent highs, champions, your week). */
export interface ScoredRun { enrollment_id: string; game: string; score: number; submitted_at: Date }
/** C35: who a leaderboard row is (CommunityMember + the enrollment's cohort). */
export interface Profile { display_name: string; avatar_url: string | null; cohort_name: string | null }
export type Tx = unknown;

export interface GameRoomStore {
  ensureSchema: () => Promise<void>;
  withDayLock: <T>(key: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;
  findRun: (id: string, tx: Tx) => Promise<RunRow | null>;
  usedOn: (enrollmentId: string, date: string, tx?: Tx) => Promise<number>;
  insertRun: (row: Omit<RunRow, 'id'>, tx: Tx) => Promise<RunRow>;
  /** Conditional update; returns the number of rows changed (0 = someone else moved the run first). */
  updateRunIf: (id: string, seenLastBeat: Date, patch: RunPatch, tx: Tx) => Promise<number>;
  /** Accepted scores for a game since a date, for a cohort or (no cohort) for one learner; C35: or for everyone (all: true). */
  scoresSince: (q: { game: string; since: string; cohortId: string | null; enrollmentId: string; all?: boolean }) => Promise<ScoreRow[]>;
  namesFor: (enrollmentIds: string[]) => Promise<Map<string, string>>;
  /** C35: accepted runs (every game) since a date for a cohort (or one learner), oldest first, at most 2,000. */
  runsSince: (q: { since: string; cohortId: string | null; enrollmentId: string }) => Promise<ScoredRun[]>;
  /** C35: each person's best per game BEFORE a date (to tell a new personal best from a first score this week). */
  bestsBefore: (q: { before: string; enrollmentIds: string[] }) => Promise<Map<string, number>>;
  /** C35: runs still beating since a moment (playing now), with their game. */
  activeSince: (since: Date) => Promise<Array<{ enrollment_id: string; game: string }>>;
  profilesFor: (enrollmentIds: string[]) => Promise<Map<string, Profile>>;
}

type Model = {
  findByPk: (id: string, o: unknown) => Promise<RunRow | null>;
  sum: (col: string, o: unknown) => Promise<number | null>;
  create: (v: unknown, o: unknown) => Promise<RunRow>;
  update: (v: unknown, o: unknown) => Promise<[number]>;
  findAll: (o: unknown) => Promise<Array<{ enrollment_id: string; score: number }>>;
};

export function productionStore(): GameRoomStore {
  const { sequelize } = require('../../config/database') as { sequelize: {
    transaction: <T>(fn: (t: unknown) => Promise<T>) => Promise<T>;
    query: (sql: string, o: unknown) => Promise<unknown>;
  } };
  const { Op } = require('sequelize') as { Op: Record<string, symbol> };
  const GameScore = (require('../../models/GameScore') as { default: Model }).default;
  const { CommunityMember } = require('../../models') as { CommunityMember: { findAll: (o: unknown) => Promise<Array<{ enrollment_id: string; display_name: string }>> } };
  return {
    ensureSchema: () => ensureGameScoresSchema(),
    withDayLock: (key, fn) => sequelize.transaction(async (transaction) => {
      await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key }, transaction });
      return fn(transaction);
    }),
    findRun: (id, tx) => GameScore.findByPk(id, { transaction: tx }),
    usedOn: async (enrollmentId, date, tx) => Number((await GameScore.sum('seconds_used', { where: { enrollment_id: enrollmentId, central_date: date }, transaction: tx })) ?? 0),
    insertRun: (row, tx) => GameScore.create({ id: randomUUID(), ...row }, { transaction: tx }),
    updateRunIf: async (id, seen, patch, tx) => (await GameScore.update(patch, { where: { id, last_beat_at: seen, submitted_at: null }, transaction: tx }))[0],
    scoresSince: ({ game, since, cohortId, enrollmentId, all }) => GameScore.findAll({
      where: { game, central_date: { [Op.gte]: since }, score: { [Op.ne]: null }, ...(all ? {} : cohortId ? { cohort_id: cohortId } : { enrollment_id: enrollmentId }) },
      attributes: ['enrollment_id', 'score'], raw: true,
    }),
    namesFor: async (ids) => new Map((ids.length ? await CommunityMember.findAll({ where: { enrollment_id: ids }, attributes: ['enrollment_id', 'display_name'], raw: true }) : [])
      .map((m) => [m.enrollment_id, m.display_name])),
    runsSince: async ({ since, cohortId, enrollmentId }) => (await GameScore.findAll({
      where: { central_date: { [Op.gte]: since }, score: { [Op.ne]: null }, ...(cohortId ? { cohort_id: cohortId } : { enrollment_id: enrollmentId }) },
      attributes: ['enrollment_id', 'game', 'score', 'submitted_at'], order: [['submitted_at', 'ASC']], limit: 2000, raw: true,
    })) as unknown as ScoredRun[],
    bestsBefore: async ({ before, enrollmentIds }) => {
      if (!enrollmentIds.length) return new Map();
      const rows = (await sequelize.query(
        'SELECT enrollment_id, game, MAX(score) AS best FROM game_scores WHERE enrollment_id IN (:ids) AND central_date < :before AND score IS NOT NULL GROUP BY enrollment_id, game',
        { replacements: { ids: enrollmentIds, before }, type: 'SELECT' },
      )) as Array<{ enrollment_id: string; game: string; best: number | string }>;
      return new Map(rows.map((r) => [`${r.enrollment_id}|${r.game}`, Number(r.best)]));
    },
    activeSince: async (since) => (await GameScore.findAll({
      where: { last_beat_at: { [Op.gte]: since }, submitted_at: null }, attributes: ['enrollment_id', 'game'], limit: 200, raw: true,
    })) as unknown as Array<{ enrollment_id: string; game: string }>,
    profilesFor: async (ids) => {
      if (!ids.length) return new Map();
      const rows = (await sequelize.query(
        `SELECT e.id AS enrollment_id, m.display_name, m.avatar_url, c.name AS cohort_name
           FROM enrollments e LEFT JOIN community_members m ON m.enrollment_id = e.id LEFT JOIN cohorts c ON c.id = e.cohort_id
          WHERE e.id IN (:ids)`,
        { replacements: { ids }, type: 'SELECT' },
      )) as Array<{ enrollment_id: string; display_name: string | null; avatar_url: string | null; cohort_name: string | null }>;
      return new Map(rows.map((r) => [r.enrollment_id, { display_name: r.display_name || 'Classmate', avatar_url: r.avatar_url, cohort_name: r.cohort_name }]));
    },
  };
}
