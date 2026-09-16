/**
 * buildFromUnderstanding — the Flotation door into the one intake.
 *
 * ## One `startBuild`, three doors
 *
 *     "it will also have a management side to it that will use the same intake ... so I test
 *      the processes (that must stay in sync) and understand the user experience."
 *      (Ali, 2026-09-16)
 *
 * The portal wizard, a converted Flotation enquiry, and an admin creating a project by hand
 * all have to produce the same thing. That is not achieved by keeping three copies aligned;
 * it is achieved by having ONE pipeline and three ways in. `startBuild` is the pipeline.
 * This is the Flotation way in, and the admin way in calls exactly this.
 *
 * ## What it does
 *
 *   1. Loads the understanding and refuses one that was never extracted.
 *   2. Renders it as the intake the wizard would have received (`toBuildIntake`).
 *   3. Resolves a project for the enrolment - the same call the wizard's first step makes.
 *   4. Calls `startBuild`. Everything after that - decompose, gate, repair, publish, tasks,
 *      repo docs, Command Center - is the portal's, untouched.
 *
 * ## Idempotent on the understanding, not on the enrolment
 *
 * `resolveProjectForNewBuild` reuses an active project only while it has no build content;
 * once a build exists it mints a NEW project. So running this twice for the same
 * understanding would create two projects from one conversation. The hand-off is therefore
 * recorded ON THE UNDERSTANDING, and a second call returns the project the first one made.
 * The record's `scope` JSON already carries the cached prototypes for the same reason - it
 * is where things derived from an understanding live.
 *
 * ## The confirm step is not here yet
 *
 * §17 says the customer confirms or corrects before anything crosses. The adapter carries
 * every item's standing in words, so an inference reaches the decomposer labelled as one
 * rather than as fact - but it still reaches it. The prototype showed exactly that: an item
 * marked "(Our inference, not confirmed by the customer)" became a CONSTRAINT/must. Until
 * the confirmation UI exists, `requireConfirmed` lets a caller refuse an unconfirmed
 * understanding rather than pretend the step happened.
 */

import ProjectUnderstandingRecord from '../../models/ProjectUnderstandingRecord';
import { resolveProjectForNewBuild } from '../projectService';
import { startBuild } from '../sbp/sbpOrchestrator';
import { toBuildIntake, type BuildIntake } from './buildIntakeAdapter';
import type { ProjectUnderstanding } from './projectUnderstanding';

/** Where the hand-off is remembered, so it happens once per conversation. */
export interface BuildHandoffRecord {
  project_id: string;
  enrollment_id: string;
  correlation_id: string;
  started_at: string;
  answers: number;
  dropped: number;
}

export type BuildFromUnderstandingResult =
  | {
      ok: true;
      projectId: string;
      correlationId: string;
      status: string;
      /** True when this call found an earlier hand-off and returned it instead of building again. */
      reused: boolean;
      intake: Pick<BuildIntake, 'name' | 'answers' | 'dropped'>;
    }
  | {
      ok: false;
      reason: 'not_found' | 'not_extracted' | 'not_confirmed' | 'failed';
      error: string;
    };

export async function startBuildFromUnderstanding(params: {
  recordId: string;
  enrollmentId: string;
  /** Refuse an understanding the customer has not confirmed (§17). Off until that UI exists. */
  requireConfirmed?: boolean;
}): Promise<BuildFromUnderstandingResult> {
  const record: any = await ProjectUnderstandingRecord.findByPk(params.recordId);
  if (!record) return { ok: false, reason: 'not_found', error: `no understanding ${params.recordId}` };
  if (record.status !== 'extracted') {
    return { ok: false, reason: 'not_extracted', error: `understanding is ${record.status}, not extracted` };
  }
  if (params.requireConfirmed && !record.confirmed_at) {
    return { ok: false, reason: 'not_confirmed', error: 'the customer has not confirmed this understanding' };
  }

  const understanding: ProjectUnderstanding = {
    title: record.title || 'Your project',
    proposed_surfaces: record.proposed_surfaces || [],
    items: record.items || [],
  };
  const intake = toBuildIntake(understanding);

  // Once per conversation. A second call is answered with the first call's project.
  const prior = (record.scope as any)?.build as BuildHandoffRecord | undefined;
  if (prior?.project_id) {
    return {
      ok: true,
      projectId: prior.project_id,
      correlationId: prior.correlation_id,
      status: 'already_started',
      reused: true,
      intake: { name: intake.name, answers: intake.answers, dropped: intake.dropped },
    };
  }

  try {
    const { project } = await resolveProjectForNewBuild(params.enrollmentId);

    const started = await startBuild({
      projectId: project.id,
      enrollmentId: params.enrollmentId,
      idea: intake.idea,
      name: intake.name,
      size: intake.size,
      targetWeeks: intake.targetWeeks,
      answers: intake.answers,
    });

    const handoff: BuildHandoffRecord = {
      project_id: started.projectId,
      enrollment_id: params.enrollmentId,
      correlation_id: started.correlationId,
      started_at: new Date().toISOString(),
      answers: intake.answers.length,
      dropped: intake.dropped.length,
    };

    // Remembered AFTER startBuild succeeds, so a failed start can be retried. Losing this
    // write would allow a duplicate on retry, which is the lesser evil against a hand-off
    // that is recorded but never happened.
    try {
      await record.update({ scope: { ...((record.scope as any) || {}), build: handoff } });
    } catch (err: any) {
      console.warn('[BuildFromUnderstanding] hand-off recorded in SBP but not on the understanding:', err?.message);
    }

    return {
      ok: true,
      projectId: started.projectId,
      correlationId: started.correlationId,
      status: started.status,
      reused: false,
      intake: { name: intake.name, answers: intake.answers, dropped: intake.dropped },
    };
  } catch (err: any) {
    console.error('[BuildFromUnderstanding] failed', {
      error_class: err instanceof Error ? err.constructor.name : 'Unknown',
      message: err?.message,
      record_id: params.recordId,
    });
    return { ok: false, reason: 'failed', error: err?.message || 'build could not be started' };
  }
}
