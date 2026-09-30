import { Op } from 'sequelize';
import {
  mentorExceptionsFor,
  prioritizeExceptions,
  type BuilderState,
  type MentorException,
  type MentorThresholds,
} from './mentorExceptions';

/**
 * mentorState — assembles the `BuilderState` that Gate 11 reasons about.
 *
 * `mentorExceptions.ts` is pure and complete and had **zero callers, and no test**. Not
 * one file in the repository referenced it besides itself. The reason was not neglect:
 * four of its eight inputs had no source in the schema, so it could not be called
 * honestly.
 *
 * ## Why this returns what it could NOT find
 *
 * The tempting shape is `assembleBuilderState(): BuilderState` — every field populated,
 * unavailable ones defaulted to `false` or `0`. That produces a mentor queue which says
 * *"this builder has no problems"* for a builder whose problems are merely unrecorded, and
 * it says it with exactly the same confidence as a real all-clear.
 *
 * Silence and absence-of-signal are different, and a mentor system that conflates them is
 * worse than no mentor system, because it is trusted. So this returns
 * `{ state, unsourceable }` and every caller is forced to decide what to do about a
 * partial picture.
 *
 * ## What is genuinely unsourceable today
 *
 * - **`trustOrSecurityGateFailing`** — `delivery_agent_trust_requirements` is keyed on
 *   `agent_definition_id`. There is no path from a builder to a trust requirement at all.
 *   This is not a query I have not written; it is a join that does not exist.
 * - **`architectureConcernRaised`** — `delivery_decisions.decision_type` is a free
 *   `VARCHAR(40)` with no vocabulary defined anywhere, and nothing in the codebase writes
 *   the table. Filtering on `'architecture'` would be inventing a value and then finding
 *   none of it.
 *
 * Both are reported rather than approximated. When the schema grows a builder-to-trust
 * path or a decision-type vocabulary, they move up into the sourced set and the
 * `unsourceable` list shrinks — which is a visible event rather than a silent improvement.
 */

/**
 * Story statuses treated as in-flight and as finished.
 *
 * `delivery_stories.status` is a free `VARCHAR(30)` with **no vocabulary defined anywhere
 * in the codebase**, and the only value ever written is `'proposed'` (by `upsertStory`).
 * These sets are therefore a stated assumption, not a discovered fact — the same posture
 * `mentorExceptions.ts` takes with `DEFAULT_THRESHOLDS`, and for the same reason: the
 * value is arguable in review precisely because it is named and in one place.
 *
 * `unrecognisedStatuses` below is what keeps that assumption from failing silently.
 */
export const IN_FLIGHT_STORY_STATUSES = ['proposed', 'in_progress', 'in_review', 'rework'];
export const COMPLETED_STORY_STATUSES = ['done', 'accepted', 'released'];

export type UnsourceableField = keyof BuilderState;

export interface UnsourceableReason {
  field: UnsourceableField;
  reason: string;
}

export interface MentorStateResult {
  state: BuilderState;
  /** Fields this assembler could not populate, each with why. Never silently defaulted. */
  unsourceable: UnsourceableReason[];
}

export interface MentorQueueResult extends MentorStateResult {
  exceptions: MentorException[];
}

/** The two fields with no source in the schema at all. Stated once, used twice. */
const STRUCTURALLY_UNSOURCEABLE: UnsourceableReason[] = [
  {
    field: 'trustOrSecurityGateFailing',
    reason:
      'delivery_agent_trust_requirements is keyed on agent_definition_id; there is no join from a builder to a trust requirement.',
  },
  {
    field: 'architectureConcernRaised',
    reason:
      'delivery_decisions.decision_type has no defined vocabulary and nothing writes the table.',
  },
];

/**
 * Assemble one builder's state from the database.
 *
 * Scoped to the projects the builder is an active member of. A builder's exceptions are
 * about their work, and membership is the only thing that says which work is theirs.
 */
export async function assembleBuilderState(input: {
  builderIdentityId: string;
  models: any;
}): Promise<MentorStateResult> {
  const { models, builderIdentityId } = input;
  const unsourceable: UnsourceableReason[] = [...STRUCTURALLY_UNSOURCEABLE];

  const memberships = await models.DeliveryProjectMember.findAll({
    where: { platform_identity_id: builderIdentityId, status: 'active' },
  });
  const projectIds: string[] = memberships.map((m: any) => m.delivery_project_id);

  const stories = await models.DeliveryStory.findAll({
    where: { assigned_to_identity_id: builderIdentityId },
  });

  const inFlight = stories.filter((s: any) => IN_FLIGHT_STORY_STATUSES.includes(s.status));
  const completed = stories.filter((s: any) => COMPLETED_STORY_STATUSES.includes(s.status));

  // The guard that stops the status assumption above from failing silently. If a builder
  // has stories and NONE of them classify, the vocabulary has moved and every count below
  // is zero — which reads identically to "this builder is doing fine".
  if (stories.length > 0 && inFlight.length === 0 && completed.length === 0) {
    const seen = [...new Set(stories.map((s: any) => String(s.status)))].sort();
    const reason =
      `${stories.length} stories are assigned to this builder and none matched a known ` +
      `status. Statuses present: ${seen.join(', ')}.`;
    unsourceable.push(
      { field: 'concurrentStories', reason },
      { field: 'completedStories', reason },
      { field: 'reworkedStories', reason },
    );
  }

  // A story that came back is reworked regardless of how many times, but the count is kept
  // on the row so the distinction stays available to anything that wants it later.
  const reworkedStories = completed.filter((s: any) => (s.rework_count ?? 0) > 0).length;

  const acceptances = projectIds.length
    ? await models.DeliveryClientAcceptance.findAll({
        where: { delivery_project_id: { [Op.in]: projectIds } },
      })
    : [];

  const releases = projectIds.length
    ? await models.DeliveryRelease.findAll({
        where: { delivery_project_id: { [Op.in]: projectIds }, status: 'candidate' },
      })
    : [];

  const state: BuilderState = {
    builderIdentityId,
    concurrentStories: inFlight.length,
    completedStories: completed.length,
    reworkedStories,
    // Project-scoped, and deliberately so: a builder on a project that has completed a
    // client review has been through one. Per-person attendance is not recorded anywhere,
    // and inventing it would be a worse answer than this documented approximation.
    hasClientReviewExperience: acceptances.some((a: any) => a.accepted_at != null),
    clientReviewPending: acceptances.some((a: any) => a.status === 'pending'),
    trustOrSecurityGateFailing: false,
    architectureConcernRaised: false,
    // Gate 14's table. This field is the reason Gate 14 had to be wired before Gate 11:
    // until `delivery_releases` existed there was no way to answer it.
    releaseAwaitingApproval: releases.length > 0,
  };

  return { state, unsourceable };
}

/**
 * The mentor's queue for one builder: exceptions, prioritised, with the blind spots named.
 *
 * Returns the `unsourceable` list alongside so a caller rendering this can say *"and these
 * two things were not checked"* rather than presenting six answers as if they were eight.
 */
export async function mentorQueueFor(input: {
  builderIdentityId: string;
  models: any;
  thresholds?: MentorThresholds;
}): Promise<MentorQueueResult> {
  const { state, unsourceable } = await assembleBuilderState(input);
  const exceptions = prioritizeExceptions(mentorExceptionsFor(state, input.thresholds));
  return { state, unsourceable, exceptions };
}
