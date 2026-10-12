/**
 * broadcastEntitlement — who may watch THIS occurrence, and for how long.
 *
 * COMPOSES `hasFullCurriculumAccess` (access/contentEntitlement.ts:72) rather than
 * restating the paid rule. There is exactly one definition of "has paid" in this codebase
 * and a second copy would drift from it; what this module adds is the broadcast-specific
 * dimension — free / paid / preview / private — on top of that single answer.
 *
 * IT FAILS CLOSED, AND THAT IS A DELIBERATE INVERSION.
 * `isFreePreviewTier` and `resolveContentPageAccess` both fail OPEN on error
 * (contentEntitlement.ts:125-128, :142, :146), which is right for a curriculum page: a
 * transient database hiccup should not lock a paying student out of week 7. It is wrong
 * here. Failing open on a paid broadcast gives the content away to everyone for the
 * duration of the outage, and there is no undo — the stream has already been watched.
 * So an error here denies, and `resolveBroadcastAccess` says so in its catch.
 *
 * TWO THINGS THE ROOM LAYER CANNOT TELL US, which is why this module exists at all:
 *   - `roomEntitlementService` has NO payment concept (it is a pure privacy/membership
 *     matrix), so paid access has to be folded in here.
 *   - `canJoinMeeting` does not consult booking state or time, so the preview clock and
 *     the live/ended distinction live here too.
 *
 * AND ONE RULE THAT IS EASY TO GET WRONG: paid status never unlocks a private cohort.
 * Money buys the paid tier, not membership of someone else's room. A `private` occurrence
 * is decided by room eligibility alone (admins excepted, matching
 * roomEntitlementService.isEligible's own isAdmin short-circuit).
 */
import { hasFullCurriculumAccess, type ContentAccessRoleInfo } from '../access/contentEntitlement';
import { previewSecondsRemaining } from './broadcastIdentity';

export type BroadcastAccessMode = 'free' | 'paid' | 'preview' | 'private';

/** What the viewer gets. `preview` is a time-boxed grant, not a lesser kind of full. */
export type AccessGrant = 'full' | 'preview' | 'denied';

export interface BroadcastAccessDecision {
  grant: AccessGrant;
  /** Stable, machine-readable. Surfaces drive copy off this, never off a string match. */
  reason:
    | 'admin' | 'moderator' | 'free_event' | 'entitled' | 'room_member'
    | 'preview_active' | 'preview_expired' | 'preview_not_started'
    | 'guest' | 'requires_payment' | 'not_room_eligible' | 'not_watchable' | 'error';
  /** Seconds left in the free window. null when the clock has not started — NOT 0. */
  previewSecondsRemaining?: number | null;
  /** True when an upgrade path should be offered. Never true for a private room. */
  offerUpgrade?: boolean;
}

export interface OccurrenceAccessFacts {
  access_mode: BroadcastAccessMode;
  editorial_state: string;
  preview_seconds: number;
  content_started_at: Date | null;
}

export interface ViewerFacts {
  /** null for a signed-out visitor. */
  enrollmentId: string | null;
  isAdmin?: boolean;
  isModerator?: boolean;
  /**
   * Result of roomEntitlementService.isEligible for the occurrence's room, resolved by the
   * caller. Passed in rather than fetched so this stays pure — the same reason
   * roomEntitlementService itself takes room + membership as arguments.
   */
  roomEligible?: boolean;
}

/** States in which there is something to watch at all. */
const WATCHABLE = new Set(['live', 'reconnecting', 'replay_ready']);

/**
 * PURE. No I/O, no clock of its own, no throw — every path returns a decision, which is
 * what lets the wrapper's catch be the only fail-closed site.
 */
export function decideBroadcastAccess(
  occurrence: OccurrenceAccessFacts,
  viewer: ViewerFacts,
  enrollment: Parameters<typeof hasFullCurriculumAccess>[0],
  cohort: Parameters<typeof hasFullCurriculumAccess>[1],
  roleInfo: ContentAccessRoleInfo | null,
  nowMs: number,
): BroadcastAccessDecision {
  // Admins and moderators first, mirroring roomEntitlementService's own short-circuit.
  if (viewer.isAdmin) return { grant: 'full', reason: 'admin' };
  if (viewer.isModerator) return { grant: 'full', reason: 'moderator' };

  if (!WATCHABLE.has(occurrence.editorial_state)) {
    // Nothing is airing and no replay is published. Not a permission problem.
    return { grant: 'denied', reason: 'not_watchable' };
  }

  // A signed-out visitor never gets media. Public marketing metadata is a separate
  // surface and is not this function's business.
  if (!viewer.enrollmentId) return { grant: 'denied', reason: 'guest' };

  // Private is decided by the room, and ONLY by the room. Paying does not buy membership
  // of a cohort you are not in, so there is deliberately no upgrade path offered here —
  // offering one would imply money could fix it.
  if (occurrence.access_mode === 'private') {
    return viewer.roomEligible
      ? { grant: 'full', reason: 'room_member' }
      : { grant: 'denied', reason: 'not_room_eligible' };
  }

  if (occurrence.access_mode === 'free') {
    return { grant: 'full', reason: 'free_event' };
  }

  // One call to the single source of truth for "has paid", covering paid, comped, staff
  // and the business-cohort owner accounts.
  const entitled = hasFullCurriculumAccess(enrollment, cohort, roleInfo, new Date(nowMs));
  if (entitled) return { grant: 'full', reason: 'entitled' };

  if (occurrence.access_mode === 'paid') {
    return { grant: 'denied', reason: 'requires_payment', offerUpgrade: true };
  }

  // preview: an unentitled viewer gets the opening window, measured from content start.
  const remaining = previewSecondsRemaining(
    { id: '', editorial_state: occurrence.editorial_state, content_started_at: occurrence.content_started_at },
    occurrence.preview_seconds,
    nowMs,
  );

  if (remaining === null) {
    // Content has not started. Distinct from "your preview is used up" — collapsing the
    // two would show a waiting-room viewer an exhausted preview before anything aired.
    return { grant: 'denied', reason: 'preview_not_started', previewSecondsRemaining: null, offerUpgrade: true };
  }
  if (remaining <= 0) {
    return { grant: 'denied', reason: 'preview_expired', previewSecondsRemaining: 0, offerUpgrade: true };
  }
  return { grant: 'preview', reason: 'preview_active', previewSecondsRemaining: remaining, offerUpgrade: true };
}

export interface ResolveDeps {
  loadEnrollment: (enrollmentId: string) => Promise<Parameters<typeof hasFullCurriculumAccess>[0]>;
  loadCohort: (cohortId: string | null) => Promise<Parameters<typeof hasFullCurriculumAccess>[1]>;
  loadRoleInfo: (enrollmentId: string) => Promise<ContentAccessRoleInfo>;
  cohortIdOf: (enrollment: any) => string | null;
}

/**
 * The I/O wrapper. Dependencies are injected so the fail-closed behaviour can be tested by
 * making a loader reject — the one case that matters most and is hardest to trigger with
 * real models.
 */
export async function resolveBroadcastAccess(
  occurrence: OccurrenceAccessFacts,
  viewer: ViewerFacts,
  deps: ResolveDeps,
  nowMs: number = Date.now(),
): Promise<BroadcastAccessDecision> {
  try {
    if (!viewer.enrollmentId) {
      return decideBroadcastAccess(occurrence, viewer, null, null, null, nowMs);
    }
    const enrollment = await deps.loadEnrollment(viewer.enrollmentId);
    const cohort = await deps.loadCohort(deps.cohortIdOf(enrollment));
    const roleInfo = await deps.loadRoleInfo(viewer.enrollmentId);
    return decideBroadcastAccess(occurrence, viewer, enrollment, cohort, roleInfo, nowMs);
  } catch (err: any) {
    // FAIL CLOSED. The opposite of contentEntitlement's wrappers, on purpose: a paywall
    // that opens under load is not a paywall, and watched content cannot be un-watched.
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'broadcast',
      event: 'broadcast_access_failed_closed', outcome: 'failure',
      error_class: 'EntitlementResolutionError',
      context: { reason: err?.message ?? 'unknown' },
    }));
    return { grant: 'denied', reason: 'error' };
  }
}
