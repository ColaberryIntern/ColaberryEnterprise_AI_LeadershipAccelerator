// One Class, Many Doors — Challenge leaderboard scoring.
//
// PURE, deterministic functions. No I/O, no model imports, no Date.now(), no
// randomness. Given the same input rows these always produce the same output,
// which makes the leaderboard reproducible and unit-testable without a database.
// The controller is responsible for reading rows from Postgres and handing the
// plain shapes below to these functions.

/* ------------------------------------------------------------------ */
/*  Contracts                                                          */
/* ------------------------------------------------------------------ */

// The minimal score signal pulled off a LeaderboardScore row. Kept structural
// (not the Sequelize model) so these functions stay pure and trivially mockable.
export interface ScoreInput {
  points: number;
  projects_shipped: number;
  cert_earned: boolean;
}

export type Tier = 'bronze' | 'silver' | 'gold';

// One participant flowing into the ranker: the computed score plus the identity
// fields the board renders. enrollment_id + company let us scope global vs
// company leaderboards without re-reading the database.
export interface RankableParticipant {
  challenge_participant_id: string;
  enrollment_id: string;
  full_name: string;
  company: string;
  score: number;
  projects_shipped: number;
  cert_earned: boolean;
  tier: Tier;
}

// A RankableParticipant after ranking — same shape plus its 1-based rank.
export interface RankedParticipant extends RankableParticipant {
  rank: number;
}

/* ------------------------------------------------------------------ */
/*  Scoring weights & thresholds                                       */
/* ------------------------------------------------------------------ */

// Deterministic weights. A shipped project is worth more than raw points, and a
// certification is the strongest single signal — it maps directly to the
// "find your real AI builders" talent-discovery value prop. Tuning these is a
// product decision; they live here as named constants, never inline magic.
const POINTS_WEIGHT = 1;
const PROJECT_SHIPPED_WEIGHT = 50;
const CERT_EARNED_BONUS = 100;

// Tier thresholds on the computed composite score. gold > silver > bronze.
// Inclusive lower bounds; everything below SILVER_THRESHOLD is bronze.
const GOLD_THRESHOLD = 300;
const SILVER_THRESHOLD = 100;

/* ------------------------------------------------------------------ */
/*  Pure functions                                                     */
/* ------------------------------------------------------------------ */

// Coerce a possibly-null/undefined/NaN numeric into a safe integer. Score rows
// come from JSONB-adjacent columns and an absent row should read as 0, never
// NaN (which would poison every comparison in the ranker).
function safeInt(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * computeScore — composite leaderboard score for a single participant.
 *
 * score = points * POINTS_WEIGHT
 *       + projects_shipped * PROJECT_SHIPPED_WEIGHT
 *       + (cert_earned ? CERT_EARNED_BONUS : 0)
 *
 * Deterministic and total: any missing/garbage field is treated as 0/false, so
 * a participant with no score row yet scores 0 rather than throwing.
 */
export function computeScore(row: Partial<ScoreInput> | null | undefined): number {
  if (!row) return 0;
  const points = safeInt(row.points);
  const projects = safeInt(row.projects_shipped);
  const certBonus = row.cert_earned ? CERT_EARNED_BONUS : 0;
  return points * POINTS_WEIGHT + projects * PROJECT_SHIPPED_WEIGHT + certBonus;
}

/**
 * assignTier — map a computed score to bronze/silver/gold by fixed thresholds.
 * Pure: same score always yields the same tier.
 */
export function assignTier(score: number): Tier {
  const s = safeInt(score);
  if (s >= GOLD_THRESHOLD) return 'gold';
  if (s >= SILVER_THRESHOLD) return 'silver';
  return 'bronze';
}

/**
 * rankParticipants — return participants in rank order (rank 1 = highest score).
 *
 * Deterministic tie-breaking, applied in order:
 *   1. score, descending
 *   2. projects_shipped, descending (more shipped work wins a tie)
 *   3. cert_earned, descending (a cert beats no cert)
 *   4. full_name, ascending (stable, locale-independent final tiebreak)
 *
 * Pure: does not mutate the input array (it sorts a shallow copy) and assigns a
 * dense 1-based rank. Ties produce a stable order but distinct ranks — the
 * board shows a strict ordering rather than shared ranks, which keeps the
 * "who's #1" CTA unambiguous.
 */
export function rankParticipants(participants: RankableParticipant[]): RankedParticipant[] {
  const sorted = [...participants].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.projects_shipped !== a.projects_shipped) {
      return b.projects_shipped - a.projects_shipped;
    }
    if (a.cert_earned !== b.cert_earned) return a.cert_earned ? -1 : 1;
    return a.full_name.localeCompare(b.full_name);
  });

  return sorted.map((p, index) => ({ ...p, rank: index + 1 }));
}

/**
 * buildRankableParticipant — assemble a RankableParticipant from raw identity
 * fields plus a score row, computing score + tier in one place. Convenience
 * composition over computeScore + assignTier so callers (controller + tests)
 * never duplicate the wiring. Pure.
 */
export function buildRankableParticipant(input: {
  challenge_participant_id: string;
  enrollment_id: string;
  full_name: string;
  company: string;
  score: Partial<ScoreInput> | null | undefined;
}): RankableParticipant {
  const score = computeScore(input.score);
  return {
    challenge_participant_id: input.challenge_participant_id,
    enrollment_id: input.enrollment_id,
    full_name: input.full_name,
    company: input.company,
    score,
    projects_shipped: safeInt(input.score?.projects_shipped),
    cert_earned: Boolean(input.score?.cert_earned),
    tier: assignTier(score),
  };
}
