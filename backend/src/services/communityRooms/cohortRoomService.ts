/**
 * cohortRoomService — the room rules of the monthly batch model.
 *
 * Ali settled two things on 2026-11-06 (C10.14):
 *
 *   "Each batch should have their own room that only they can see and staff.
 *    1st meeting will be on their batch but after that they will use shared rooms."
 *
 * Both halves are room POLICY, which is why they live here rather than inside
 * roomService: that module is rooms CRUD + discovery, and it already carries ten
 * exports against the twelve the Modular Composition Rule allows. It imports the
 * two functions below and applies them; the policy itself is testable without a
 * database.
 *
 * ── WHAT WAS ALREADY TRUE, AND WHAT WAS NOT ───────────────────────────────────
 *
 * The ACCESS model needed nothing new. `roomEntitlementService.isEligible` already
 * answers `privacy: 'cohort'` with "the matching cohort or an active member", with
 * an admin short-circuit above it, and `roomVisibility()` already returns 'hidden'
 * (not a locked shell) to a learner in another cohort. `CommunityRoom` already
 * carries `linked_cohort_id`. So "only they can see, and staff" was implemented
 * before this ticket existed.
 *
 * What did NOT exist is a room that belongs to the BATCH. Every cohort-linked room
 * today hangs off something else: `ensureRoomForSession` mints one per LiveSession
 * (keyed on `linked_live_session_id`), `createRoom` stamps `ctx.cohortId` onto any
 * member-created room, and `dmService` writes it for DMs. That last pair is why
 * `linked_cohort_id IS NOT NULL` is NOT a usable "this is the batch's room"
 * predicate, and why {@link ensureRoomForCohort} keys on a deterministic slug
 * instead.
 *
 * ── WHY THE FIRST MEETING IS DETECTED BY TITLE, NOT BY session_number ─────────
 *
 * `session_number === 1` looks like the obvious reading of "1st meeting" and is
 * wrong against real data. The November 2026 batch's session 1 is
 * "Open House - The Forward Deployed Engineer" (2026-10-29): a prospect-facing
 * marketing event that already happened, a month before that batch's 7 December
 * orientation. Keying on the ordinal would make the open house batch-private and
 * the actual orientation shared, i.e. exactly backwards on the one batch that
 * runs next.
 *
 * So the first meeting is the ORIENTATION, and `detectDayKind` in
 * services/classKit/kitSpec.ts is already this repo's answer to "what kind of
 * class day is this" - including ranking `/open house/i` ABOVE `/orientation/i`
 * and documenting an open house as prospect-facing. It is imported rather than
 * re-expressed here for the reason curriculumScope.ts gives about its own
 * helper: two copies of a rule drift apart, and the drift is invisible until a
 * student hits it. kitSpec is declared pure (no DB, no I/O) and imports only
 * data modules, so the rooms tree takes on no new runtime weight.
 */
import CommunityRoom, { RoomPrivacy } from '../../models/CommunityRoom';
import { detectDayKind } from '../classKit/kitSpec';
import { emitRoomEvent } from './roomOutboxService';
import { ROOM_EVENTS } from './roomEvents';
import { log, truncated } from './roomShared';
import { BATCH_COHORT_TYPE, isBatchCohort } from '../batch/batchCohort';

/**
 * The batch definition is re-exported, not re-declared.
 *
 * C10.14 wrote `BATCH_COHORT_TYPE` and `isBatchCohort` here, because rooms was the only
 * thing that needed them. C10.13 added two more readers — placement and rollover — and
 * three copies of "what counts as a batch" is the drift this ladder keeps being bitten
 * by, so the definition moved to `services/batch/batchCohort.ts` (pure, no imports) and
 * this module imports it. The names and behaviour are unchanged, including the reason the
 * predicate reads a NULL `cohort_type` as a batch; the rationale travelled with it.
 *
 * Scoped to `accelerator` because the other two cohort types are not batches and a room
 * for either would be wrong rather than merely unused: `explorer` is the prospect bucket
 * (473 enrollments, 433 of them active), so a room there is a room for every lead the
 * platform has ever captured, and `ai_internship` already has its own hand-made
 * persistent cohort room (`ai-internship-standup`).
 */
export { BATCH_COHORT_TYPE, isBatchCohort };

/**
 * The batch room's slug: deterministic, so {@link ensureRoomForCohort} is
 * idempotent against the `community_rooms_slug_unique` index and needs no
 * collision retry. This matches how every other system room is keyed
 * (`session-<id>`, `global-library`, `dm-<a>-<b>`) and deliberately not how
 * `createRoom` builds member slugs (`slugify(name) + random suffix`), which
 * cannot be recomputed and so cannot be looked up again.
 */
export function cohortRoomSlug(cohortId: string): string {
  return `cohort-${cohortId}`;
}

/** The shape of a cohort this module needs. Narrow on purpose, so a test can pass a literal. */
export interface BatchRoomCohort {
  id: string;
  name: string;
  cohort_type?: string | null;
}

/**
 * The privacy a session's room is created with.
 *
 * 'cohort'  - the batch's orientation: their first meeting, theirs alone.
 * 'public'  - everything after it, which is the combined monthly class that all
 *             batches attend, plus open houses, which are prospect-facing by
 *             definition and must never be shut to one batch.
 *
 * Pure. Note this governs CREATION only: `ensureRoomForSession` passes it through
 * `findOrCreate` defaults, so an existing room keeps the privacy it already has.
 * That is deliberate - the July 2026 batch's 25 session rooms are all 'cohort'
 * and its sessions are completed, and silently re-opening a finished cohort's
 * rooms is not something this ticket asked for.
 */
export function sessionRoomPrivacy(session: { title?: string | null; session_date?: string | null }): RoomPrivacy {
  const kind = detectDayKind(session.title ?? '', session.session_date ?? '');
  return kind === 'orientation' ? 'cohort' : 'public';
}

/**
 * The batch's own persistent room: idempotent, keyed on {@link cohortRoomSlug}.
 *
 * `room_type: 'persistent'` is load-bearing and not cosmetic. `listRoomsForViewer`
 * excludes `['dm', 'scheduled']` from the browse rail, so the per-session rooms
 * have never appeared in it and are reachable only by direct id. A 'persistent'
 * room is the only kind a learner can actually find by browsing, which is the
 * difference between a batch room that exists and one they can use.
 *
 * Returns the room whether it created it or found it, so a caller may call this
 * for an existing cohort to backfill.
 */
export async function ensureRoomForCohort(cohort: BatchRoomCohort): Promise<CommunityRoom | null> {
  if (!isBatchCohort(cohort)) return null;

  const slug = cohortRoomSlug(cohort.id);
  const [room, created] = await CommunityRoom.findOrCreate({
    where: { slug },
    defaults: {
      slug,
      name: truncated(cohort.name, 200) || 'Your batch',
      category: 'your_cohort',
      room_type: 'persistent',
      privacy: 'cohort',
      status: 'active',
      topic: truncated(`Private to the ${cohort.name} batch and staff.`, 255),
      linked_cohort_id: cohort.id,
      is_system: true,
      created_by: 'system',
      is_video: true,
      always_open: true,
    },
  });

  if (created) {
    await emitRoomEvent({ eventType: ROOM_EVENTS.RoomCreated, aggregateType: 'room', aggregateId: room.id });
    log('info', 'room_created_for_cohort', { room_id: room.id, cohort_id: cohort.id });
  }
  return room;
}
