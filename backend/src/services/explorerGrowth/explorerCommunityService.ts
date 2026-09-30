import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

/**
 * Explorer Growth OS — EPIC 7. Community state and room recommendation.
 *
 * WHAT THIS DOES NOT DO: derive `CONNECTED_TO_COMMUNITY`. That primary state
 * already works, driven by the `community_contribution` signal — 44 rows across
 * 14 Explorers. Re-deriving it here would be a second source for one fact, which
 * is the drift this programme keeps paying for.
 *
 * What it adds is the recommendation: WHICH room to invite someone into.
 *
 * ─── WHY THIS NEEDED ITS OWN ACCESS RULE ────────────────────────────────────
 *
 * Of 229 active rooms, only **12 are public**. 187 are `private` and 30 are
 * `cohort`-scoped. Recommending a room a learner cannot enter is the same defect
 * as recommending a locked lesson — it sends someone to a door that will not
 * open, and it is invisible until they click.
 *
 * So the rule is explicit and narrow:
 *
 *   public  -> anyone
 *   cohort  -> only a learner in THAT cohort
 *   private -> never recommended, to anyone, ever
 *
 * A room they have already joined is not a recommendation either, so current
 * memberships are excluded.
 *
 * ─── AND WHY IT UNBLOCKS `community_digest` ─────────────────────────────────
 *
 * EPIC 5 declared `community_digest` unsupported because all 62 community POSTS
 * carry a non-null `cohort_id` — they are private cohort discussion and a
 * cohort-blind registry row would leak one cohort's conversation to another.
 *
 * ROOMS are different: a `public` room is public by its own declared privacy
 * field. Inviting someone into one discloses nothing. That is why this service
 * can supply community content where post projection could not.
 */

export interface RecommendableRoom {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  privacy: string;
}

export interface ExplorerCommunityState {
  /** Rooms the learner is currently in (not left). */
  memberRoomCount: number;
  /** Rooms they could join and have not. Empty is a fact, not an error. */
  recommendable: RecommendableRoom[];
}

const EMPTY: ExplorerCommunityState = { memberRoomCount: 0, recommendable: [] };

/**
 * Rooms this learner may be invited into.
 *
 * THE PRIVACY FILTER IS IN SQL, not applied afterwards. A post-filter would let
 * the LIMIT be consumed by private rooms and return an empty list that reads as
 * "no rooms available" rather than "none you may see" — the same failure the
 * content resolver's tier gate avoids.
 *
 * `linked_cohort_id` is compared to the learner's own cohort. A NULL cohort on
 * the learner matches nothing, which is correct: an Explorer with no cohort has
 * no cohort rooms, and treating NULL as a wildcard would open all 30.
 */
const ROOMS_SQL = `
  SELECT r.id, r.slug, r.name, r.description, r.privacy
    FROM community_rooms r
   WHERE r.status = 'active'
     AND (
           r.privacy = 'public'
        OR (r.privacy = 'cohort' AND :cohortId IS NOT NULL AND r.linked_cohort_id = :cohortId)
         )
     AND NOT EXISTS (
           SELECT 1 FROM room_memberships m
            WHERE m.room_id = r.id
              AND m.enrollment_id = :enrollmentId
              AND m.left_at IS NULL
         )
   ORDER BY r.privacy = 'cohort' DESC, r.created_at DESC
   LIMIT :max_rows
`;

const MEMBERSHIPS_SQL = `
  SELECT count(*)::int AS n
    FROM room_memberships
   WHERE enrollment_id = :enrollmentId AND left_at IS NULL
`;

/**
 * Community state for one learner.
 *
 * FAILS SOFT to "nothing known". A database blip must not invent a room
 * recommendation, and it must not claim the learner belongs to nothing either —
 * the caller treats an empty result as "no recommendation to make", which is
 * what an outage actually means.
 */
export async function getExplorerCommunityState(
  enrollmentId: string,
  cohortId: string | null,
  limit = 3,
): Promise<ExplorerCommunityState> {
  if (!enrollmentId) return EMPTY;

  try {
    const [counts, rooms] = await Promise.all([
      sequelize.query<{ n: number }>(MEMBERSHIPS_SQL, {
        type: QueryTypes.SELECT,
        replacements: { enrollmentId },
      }),
      sequelize.query<RecommendableRoom>(ROOMS_SQL, {
        type: QueryTypes.SELECT,
        replacements: { enrollmentId, cohortId, max_rows: limit },
      }),
    ]);

    return {
      memberRoomCount: counts[0]?.n ?? 0,
      recommendable: rooms,
    };
  } catch (err: any) {
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'explorer_community_state_failed',
        outcome: 'partial',
        error_class: err?.constructor?.name ?? 'Error',
        context: { message: err?.message },
      }),
    );
    return EMPTY;
  }
}

/**
 * The privacy values this service will ever recommend.
 *
 * Exported so a test can assert the set rather than re-typing it, and so that
 * adding a fourth privacy level to `community_rooms` is a visible decision here
 * rather than an accidental inclusion by a query that says `privacy != 'private'`.
 */
export const RECOMMENDABLE_PRIVACY = ['public', 'cohort'] as const;
