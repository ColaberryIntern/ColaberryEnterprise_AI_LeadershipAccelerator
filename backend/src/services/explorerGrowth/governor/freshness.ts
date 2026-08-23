/**
 * Explorer Growth OS — profile freshness gate. Plan §8.3, EPIC 4 T000.
 *
 * §8.3: the Governor REFUSES to decide on a stale profile and enqueues a
 * recompute instead — fail-closed, so a broken scorer produces silence rather
 * than wrong sends.
 *
 * THE PROBLEM THIS SOLVES. The obvious gate is
 * `scores_computed_at < now - 26h`. It does not work, because
 * `scores_computed_at` is `NOT NULL DEFAULT NOW()`
 * (ensureExplorerGrowthSchema.ts:49, ExplorerJourneyProfile.ts:113-118) and
 * EPIC 1's identity bridge stamps it when it CREATES the profile. So a profile
 * that has never been scored — all-zero scores, no snapshot — reads as
 * "computed just now" and sails through. Today that holds only because the
 * existing 153 timestamps are old; the moment a new Explorer is bridged, the
 * Governor would decide on empty data believing it current.
 *
 * WHY NOT MAKE THE COLUMN NULLABLE. The ALTER is blocked by a guard test
 * shipped in EPIC 1 (db/__tests__/ensureExplorerGrowthSchema.test.ts:63-82),
 * which requires every DDL statement to contain `IF NOT EXISTS` and forbids
 * `DROP` — and `ALTER COLUMN ... DROP NOT NULL` contains neither. Rather than
 * weaken that guard, this uses a sentinel needing no schema change at all.
 *
 * THE SENTINEL. The bridge evaluates `scores_computed_at: new Date()` inside
 * the create() argument literal, and Sequelize resolves `created_at`'s
 * `defaultValue: DataTypes.NOW` afterwards, at build time. So for an unscored
 * row `scores_computed_at <= created_at` — usually equal, same millisecond.
 * EPIC 3's scorer writes `scores_computed_at: asOf` on every recompute, always
 * strictly later. A STRICT `>` therefore separates them, and reads the
 * equal case as unscored, which is the safe direction.
 */

const STALENESS_HOURS = 26;
const HOUR_MS = 3_600_000;

/** The two timestamps this gate needs. Deliberately minimal. */
export interface FreshnessInput {
  created_at: Date | string;
  scores_computed_at: Date | string | null;
}

export type FreshnessVerdict =
  | { fresh: true }
  | { fresh: false; reason: 'never_scored' | 'stale' | 'clock_skew' | 'missing_timestamps' };

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Has the scorer ever actually run for this profile?
 *
 * STRICT `>`: the bridge writes both timestamps at effectively the same instant,
 * so equality means "created, never scored". Using `>=` here would read every
 * freshly bridged profile as scored and reintroduce the exact bug this file
 * exists to close.
 */
export function isScored(profile: FreshnessInput): boolean {
  const created = toDate(profile?.created_at);
  const scored = toDate(profile?.scores_computed_at);
  if (!created || !scored) return false;
  return scored.getTime() > created.getTime();
}

/**
 * May the Governor decide on this profile?
 *
 * Every `false` carries a reason, so a refusal is explainable without
 * re-deriving it — the same rule the contact policy follows.
 */
export function evaluateFreshness(
  profile: FreshnessInput,
  now: Date = new Date(),
): FreshnessVerdict {
  const created = toDate(profile?.created_at);
  const scored = toDate(profile?.scores_computed_at);

  if (!created || !scored) return { fresh: false, reason: 'missing_timestamps' };
  if (scored.getTime() <= created.getTime()) return { fresh: false, reason: 'never_scored' };

  const ageMs = now.getTime() - scored.getTime();

  // A timestamp in the future is CLOCK SKEW, and it must refuse.
  //
  // The plan originally called this "fresh" on the reasoning that a negative
  // age is trivially under the threshold. That is a fail-OPEN written into the
  // task whose whole purpose is to close one: a wrong clock, or a backdated
  // `--as-of` on the recompute script (which validates only that the date
  // parses), would mark every profile permanently fresh and silently disable
  // this gate. Refusing is the safe direction — the cost is one skipped cycle.
  if (ageMs < 0) return { fresh: false, reason: 'clock_skew' };

  if (ageMs >= STALENESS_HOURS * HOUR_MS) return { fresh: false, reason: 'stale' };

  return { fresh: true };
}

export const FRESHNESS_STALENESS_HOURS = STALENESS_HOURS;
