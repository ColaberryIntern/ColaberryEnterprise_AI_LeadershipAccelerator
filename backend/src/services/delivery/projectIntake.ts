/**
 * projectIntake — the one interview, whoever is asking.
 *
 * ## Why one function
 *
 *     "I want that same exact intake on the Mgmt side so I can build projects for students.
 *      The two processes can be the same, but they must mirror each other. A change to one
 *      means a change to the other."  (Ali, 2026-09-16)
 *
 * A prospect on aiflotation.com and an admin on the internship page get the same interview
 * because they call the same function. There is no second copy to keep aligned. The doors
 * differ only in who they let in and how they name the person - everything from the first
 * question to the published project runs through here.
 *
 * ## What one turn does
 *
 *   1. Bounds the transcript, so a client cannot buy a thousand-turn prompt.
 *   2. Asks the interviewer for its next message.
 *   3. When the interviewer is done: records the understanding from the full transcript,
 *      and - if there is somewhere for it to land - starts the build.
 *
 * ## The build starts on its own
 *
 *     "I don't want to be a gate for Projects. Let those projects move fwd without me."
 *
 * A conversation that produced an understanding becomes a project without anyone clicking
 * anything, provided the person has an enrolment to hold it. The prospect path resolves that
 * enrolment by the lead's email (the enquiry creates one); the admin path names it. Both go
 * through `startBuildFromUnderstanding`, which is idempotent per understanding, so a retry
 * or a repeated `done` turn cannot mint a second project.
 *
 * Best-effort, deliberately: a build that fails to start must never cost the person their
 * write-up. The write-up is what they are looking at; the build is what happens next.
 */

import {
  nextInterviewMessage,
  interviewTranscript,
  MAX_EXCHANGES,
  type InterviewTurn,
  type InterviewFacts,
} from './flotationInterviewService';
import { recordUnderstandingFromConversation } from './recordProjectUnderstanding';
import { startBuildFromUnderstanding } from './buildFromUnderstanding';
import { Enrollment } from '../../models';

/** The most of a transcript any door will accept. */
export const MAX_TURN_TEXT = 4000;

/**
 * Bound and clean a transcript from a client. Every door does exactly this, so it lives
 * here rather than in each controller.
 */
export function boundTurns(raw: unknown): InterviewTurn[] {
  const turns = Array.isArray(raw) ? raw : [];
  return turns
    .filter((t: any) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string')
    .map((t: any) => ({ role: t.role as InterviewTurn['role'], text: String(t.text).slice(0, MAX_TURN_TEXT) }))
    .slice(-(MAX_EXCHANGES * 2 + 2));
}

/** Where the finished project should land. */
export type BuildTarget =
  | { kind: 'enrollment'; enrollmentId: string }
  | { kind: 'by_email'; email: string }
  | { kind: 'none' };

export type IntakeTurnResult =
  | { done: false; message: string; exchanges?: number; error_class?: string }
  | {
      done: true;
      message: string;
      understanding: 'created' | 'deduplicated' | 'failed' | 'skipped';
      understanding_id?: string;
      /** Present when a build was attempted. Absent when there was nowhere to land. */
      build?: { started: boolean; project_id?: string; reason?: string };
    };

/**
 * Resolve where a build should land, without throwing. A missing enrolment is a reason,
 * not an error - the write-up still stands.
 */
async function resolveEnrollmentId(target: BuildTarget): Promise<{ id: string } | { reason: string }> {
  if (target.kind === 'enrollment') return { id: target.enrollmentId };
  if (target.kind === 'none') return { reason: 'no build target' };

  const email = (target.email || '').toLowerCase().trim();
  if (!email) return { reason: 'no email to find an enrolment by' };

  const enrollment: any = await Enrollment.findOne({ where: { email } });
  return enrollment ? { id: enrollment.id } : { reason: 'no enrolment for this person yet' };
}

/**
 * One turn of the interview, from either door.
 */
export async function runIntakeTurn(params: {
  turns: InterviewTurn[];
  facts: InterviewFacts;
  /** Names the conversation in its own system - the idempotency key for extraction. */
  sourceRef: string;
  leadId: number | null;
  buildFor: BuildTarget;
}): Promise<IntakeTurnResult> {
  const result = await nextInterviewMessage({ turns: params.turns, facts: params.facts });

  if (!result.ok) {
    return {
      done: false,
      message: 'Sorry — I lost my thread there. Could you say that again?',
      error_class: result.error_class,
    };
  }

  if (!result.done) {
    return { done: false, message: result.message, exchanges: result.exchanges };
  }

  // Extraction runs on the FULL transcript including the closing message, and is awaited:
  // whoever is on the other end switches straight to the write-up, so producing it before
  // responding is what makes that transition honest rather than a spinner over a promise.
  const conversation = interviewTranscript([...params.turns, { role: 'assistant', text: result.message }]);

  const outcome = await recordUnderstandingFromConversation({
    leadId: params.leadId,
    source: 'chat',
    sourceRef: params.sourceRef,
    conversation,
    facts: params.facts,
  });

  const response: IntakeTurnResult = {
    done: true,
    message: result.message,
    understanding: outcome.status,
    understanding_id: outcome.id,
  };

  // The project starts on its own. Nothing here may throw past this point: the write-up is
  // already recorded and is what the person is about to see.
  if ((outcome.status === 'created' || outcome.status === 'deduplicated') && outcome.id) {
    try {
      const landing = await resolveEnrollmentId(params.buildFor);
      if ('reason' in landing) {
        response.build = { started: false, reason: landing.reason };
      } else {
        const build = await startBuildFromUnderstanding({ recordId: outcome.id, enrollmentId: landing.id });
        response.build = build.ok
          ? { started: true, project_id: build.projectId }
          : { started: false, reason: build.error };
      }
    } catch (err: any) {
      console.error('[ProjectIntake] build could not be started', {
        error_class: err instanceof Error ? err.constructor.name : 'Unknown',
        message: err?.message,
        source_ref: params.sourceRef,
      });
      response.build = { started: false, reason: err?.message || 'build failed to start' };
    }
  }

  return response;
}
