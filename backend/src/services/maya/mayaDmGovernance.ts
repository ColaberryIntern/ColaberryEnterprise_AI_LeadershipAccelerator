import { env } from '../../config/env';
import type { GrowthJourneyFlags } from '../../config/growthJourneyFlags';
import { classifyError } from '../../utils/errorClassifier';
import { subjectRefFrom } from '../identity/identifierPrecedence';
import { BOOK_CALL_LINK } from './mayaPortalTools';
import { createJourneyHandoff, type HandoffReasonCode, type JourneyHandoffResult } from './mayaJourneyHandoff';
import { resolveMayaMode, type MayaModeAnswer } from './mayaPromotion';
import type { NonAuthoritativeTopic } from './mayaTopicGuard';

/**
 * M31 - the governed parts of Maya's portal DM reply (respond_to_explorer_dm), kept out of mayaReplyService so each
 * rule is testable on its own:
 *
 *   governedTopicReply  a question she must not answer from the model (mayaTopicGuard) gets a FIXED reply: a real
 *                       handoff (M33) and "someone will follow up" ONLY when the server confirmed one; otherwise the
 *                       booking link. A cohort-date question is answered from the batch of record when there is one.
 *   withAiDisclosure    her first message in a conversation says she is an AI. Deterministic, not left to the prompt.
 *   person360Block      Person 360 context (M34 read tools) for the prompt, ONLY when readPerson360 is live (M37 +
 *                       M29). Off in production until Ali promotes it; any read failure omits the block.
 *
 * In SHADOW (dryRun) nothing is written: no handoff, so the shadow reply is the not-confirmed wording.
 */

import { AI_DISCLOSURE } from './mayaDisclosure';

export { AI_DISCLOSURE };

const TOPIC_LEAD: Record<NonAuthoritativeTopic, string> = {
  seat_count: "I can't give you a seat count, and I won't guess at one.",
  deadline: "I don't want to guess at a deadline, because getting it wrong could cost you.",
  consent: 'Questions about your data and how we contact you are handled by a person, not by me.',
  cohort_date: "I don't have a confirmed date for that.",
};

const TOPIC_REASON: Record<NonAuthoritativeTopic, HandoffReasonCode> = {
  seat_count: 'maya_dm_seat_count',
  deadline: 'maya_dm_deadline',
  consent: 'maya_dm_consent',
  cohort_date: 'maya_dm_cohort_date',
};

export const HANDOFF_CONFIRMED_LINE =
  'I have passed your question to our admissions team, and someone from admissions will follow up with you here.';
export const HANDOFF_NOT_CONFIRMED_LINE =
  'The quickest way to get a definite answer is a short call with our admissions team.';

export interface BatchOfRecord { monthKey: string; startDate: string | Date | null }

export interface DmGovernanceDeps {
  handoff: (enrollmentId: string, reason: HandoffReasonCode, flags: GrowthJourneyFlags) => Promise<JourneyHandoffResult>;
  batchForThisMonth: (now: Date) => Promise<BatchOfRecord | null>;
  now: () => Date;
  flags: GrowthJourneyFlags;
}

function defaultDeps(): DmGovernanceDeps {
  return {
    handoff: (id, reason, flags) => createJourneyHandoff(id, reason, flags),
    batchForThisMonth: async (now) => {
      const { batchMonthKey, findBatchForMonth } = await import('../batch/batchPlacementService');
      const monthKey = batchMonthKey(now);
      const c = await findBatchForMonth(monthKey);
      return c ? { monthKey, startDate: (c as unknown as { start_date: string | Date | null }).start_date } : null;
    },
    now: () => new Date(),
    flags: env.growthJourney,
  };
}

const CENTRAL_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const MONTH_NAME = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/** A date-only column ('2026-12-07') is a calendar day, not an instant: read it at noon UTC so no zone shifts it. */
function asDay(v: string | Date): Date {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00Z`) : new Date(v);
}

/** The cohort-date answer from the batch of record, or null when there is no batch row or no future orientation. */
export function cohortDateAnswer(batch: BatchOfRecord | null, now: Date): string | null {
  if (!batch?.startDate) return null;
  const orientation = asDay(batch.startDate);
  if (Number.isNaN(orientation.getTime()) || orientation.getTime() < now.getTime()) return null;
  const month = MONTH_NAME.format(new Date(`${batch.monthKey}-15T12:00:00Z`));
  return `If you join this month, you are in the ${month} batch, and its orientation is on ${CENTRAL_DAY.format(orientation)}. `
    + 'The program is self-paced, so you can start as soon as you join.';
}

export interface GovernedReply { text: string; handoff: JourneyHandoffResult | null }

export async function governedTopicReply(
  topic: NonAuthoritativeTopic, enrollmentId: string, opts: { dryRun: boolean }, deps: DmGovernanceDeps = defaultDeps(),
): Promise<GovernedReply> {
  if (topic === 'cohort_date') {
    try {
      const answer = cohortDateAnswer(await deps.batchForThisMonth(deps.now()), deps.now());
      if (answer) return { text: answer, handoff: null };
    } catch (err: unknown) {
      console.warn(JSON.stringify({ level: 'warn', service: 'maya', event: 'dm_cohort_date_lookup_failed', outcome: 'failure', error_class: classifyError(err) }));
    }
  }
  const handoff = opts.dryRun ? null : await deps.handoff(enrollmentId, TOPIC_REASON[topic], deps.flags);
  const confirmed = handoff?.handoff === true;
  const text = confirmed
    ? `${TOPIC_LEAD[topic]} ${HANDOFF_CONFIRMED_LINE}\n\n${BOOK_CALL_LINK}`
    : `${TOPIC_LEAD[topic]} ${HANDOFF_NOT_CONFIRMED_LINE}\n\n${BOOK_CALL_LINK}`;
  return { text, handoff };
}

/** Prefix the AI disclosure when Maya has not yet spoken in this conversation. */
export function withAiDisclosure(reply: string, mayaHasSpokenInRoom: boolean): string {
  if (mayaHasSpokenInRoom || reply.startsWith(AI_DISCLOSURE)) return reply;
  return `${AI_DISCLOSURE} ${reply}`;
}

export interface Person360Deps {
  mode: () => Promise<MayaModeAnswer>;
  who: (ref: string) => Promise<{ status: string; data: { greetingName: string | null; stage: string } | null }>;
  ready: (ref: string) => Promise<{ status: string; data: { total: number; scoreableMax: number; coverage: number } | null }>;
}

function defaultPersonDeps(): Person360Deps {
  return {
    mode: () => resolveMayaMode('readPerson360'),
    who: async (ref) => (await import('../mayaReadTools')).whoIsThisPerson(ref),
    ready: async (ref) => (await import('../mayaReadTools')).howReadyTheyAre(ref),
  };
}

/** Person 360 context for the prompt, or '' when the capability is not live or the read fails. Never throws. */
export async function person360Block(enrollmentId: string, deps: Person360Deps = defaultPersonDeps()): Promise<string> {
  try {
    if ((await deps.mode()).mode !== 'live') return '';
    const ref = subjectRefFrom({ enrollmentId }) as string; // the shared builder (identity T208 tripwire)
    const [who, ready] = await Promise.all([deps.who(ref), deps.ready(ref)]);
    const parts: string[] = [];
    if (who.status === 'present' && who.data) parts.push(`lifecycle stage: ${who.data.stage}`);
    if (ready.status === 'present' && ready.data) {
      parts.push(`readiness score ${ready.data.total} of ${ready.data.scoreableMax} (coverage ${Math.round(ready.data.coverage * 100)}%)`);
    }
    if (parts.length === 0) return '';
    return `PERSON CONTEXT (advisory only; never a source for price, dates, deadlines, seats or consent): ${parts.join('; ')}.`;
  } catch (err: unknown) {
    console.warn(JSON.stringify({ level: 'warn', service: 'maya', event: 'dm_person360_failed', outcome: 'failure', error_class: classifyError(err) }));
    return '';
  }
}
