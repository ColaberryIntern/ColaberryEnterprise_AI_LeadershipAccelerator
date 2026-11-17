import { sequelize } from '../../config/database';
import type { ObservationSource } from './readiness';
import { answerUrl } from './savedAnswers';

/**
 * Career Prep R1.1: "Where this score comes from". Every result behind one skill's number from one source,
 * newest first, over the same 90 days the score is built from (prepData.ts). Each row says what the result
 * was, from the stored source_ref only (no invented names):
 *
 *   hire-intro:<assetId>        the Hire intro video: opens Portfolio > Hire > Video.
 *   attempt:<attemptId>         a Try answer in Career Prep: plays inline when the student saved it,
 *                               otherwise "Recording not kept" (recordings are deleted unless saved).
 *   case-study:<enr>:<slug>     a published case study: opens Portfolio > Hire > Case studies.
 *   anything else               the source's own name (a lesson quiz, a phone mock with Cora, ...).
 */
export interface SourceItem {
  at: string;
  value: number;
  kind: 'intro_video' | 'try_answer' | 'case_study' | 'other';
  label: string;
  /** A portal path that opens the evidence, when there is one. */
  link?: string;
  /** A saved Try answer's signed playback. */
  video?: { streamUrl: string; posterUrl: string };
  /** A Try answer whose recording was not saved. */
  notKept?: boolean;
}

export const INTRO_VIDEO_PATH = '/portal/portfolio?tab=hire&section=video';
export const CASE_STUDIES_PATH = '/portal/portfolio?tab=hire&section=cases';
const SOURCE_WORD: Record<ObservationSource, string> = {
  video: 'A recorded video', phone_mock: 'A phone mock with Cora', real_interview: 'A recorded real interview',
  training: 'A lesson quiz', project: 'A project',
};

type Row = { value: number; source: ObservationSource; source_ref: string; observed_at: string | Date; question: string | null; asset_id: string | null };

/** Pure: one observation row as the student sees it. */
export function describe(r: Row, now = Date.now()): SourceItem {
  const base = { at: new Date(r.observed_at).toISOString(), value: Math.round(Number(r.value) * 10) / 10 };
  const ref = String(r.source_ref);
  if (ref.startsWith('hire-intro:')) return { ...base, kind: 'intro_video', label: 'Your intro video', link: INTRO_VIDEO_PATH };
  if (ref.startsWith('attempt:')) {
    const label = r.question ? `Try answer: ${r.question}` : 'A Try answer in Career Prep';
    return r.asset_id
      ? { ...base, kind: 'try_answer', label, video: { streamUrl: answerUrl(r.asset_id, 'stream', now), posterUrl: answerUrl(r.asset_id, 'poster', now) } }
      : { ...base, kind: 'try_answer', label, notKept: true };
  }
  if (ref.startsWith('case-study:')) {
    const slug = ref.split(':').slice(2).join(':');
    return { ...base, kind: 'case_study', label: slug ? `Published case study: ${slug}` : 'A published case study', link: CASE_STUDIES_PATH };
  }
  return { ...base, kind: 'other', label: SOURCE_WORD[r.source] ?? 'A result' };
}

export async function skillSources(enrollmentId: string, skill: string, source: ObservationSource, now = new Date()): Promise<SourceItem[]> {
  const [rows] = await sequelize.query(
    `SELECT o.value, o.source, o.source_ref, o.observed_at, sa.question, sa.asset_id
       FROM prep_observations o
       LEFT JOIN prep_saved_answers sa ON sa.enrollment_id = o.enrollment_id AND o.source_ref = 'attempt:' || sa.attempt_id::text
      WHERE o.enrollment_id = :e AND o.skill_key = :k AND o.source = :s AND o.observed_at > :now::timestamptz - INTERVAL '90 days'
      ORDER BY o.observed_at DESC
      LIMIT 50`,
    { replacements: { e: enrollmentId, k: skill, s: source, now } });
  return (rows as Row[]).map((r) => describe(r, now.getTime()));
}
