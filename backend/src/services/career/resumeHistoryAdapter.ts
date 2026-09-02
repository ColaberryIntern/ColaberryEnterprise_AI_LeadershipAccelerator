/**
 * resumeHistoryAdapter - reads one learner's employment / education history out of
 * the resume ingest, normalized and safe to render.
 *
 * WHY A SEPARATE SEAM. Two callers need this and they need it for opposite reasons:
 * the reviewer preview reads it LIVE (the live text is exactly what they are being
 * asked to approve), and the approval writer reads it once to FREEZE it into
 * `approved_identity`. Putting the read in one place keeps those two honest about
 * reading the same thing.
 *
 * The history lives in `OnboardingProfile.extracted`, the raw JSONB blob the resume
 * extractor writes. Raw LLM output never leaves this module unnormalized.
 */
import { OnboardingProfile } from '../../models';
import {
  normalizeExperience,
  normalizeEducation,
  type ResumeExperience,
  type ResumeEducation,
} from '../resumeHistory';

export interface ResumeHistory {
  experience: ResumeExperience[];
  education: ResumeEducation[];
}

export const EMPTY_RESUME_HISTORY: ResumeHistory = { experience: [], education: [] };

/**
 * The learner's resume history, or empty.
 *
 * Never throws: a learner who never uploaded a resume is a completely ordinary state,
 * and a database hiccup must degrade this page rather than 500 it. The caller logs.
 */
export async function readResumeHistory(enrollmentId: string): Promise<ResumeHistory> {
  const row: any = await OnboardingProfile.findOne({ where: { enrollment_id: enrollmentId } });
  const extracted = row?.extracted;
  if (!extracted || typeof extracted !== 'object') return { ...EMPTY_RESUME_HISTORY };
  return {
    experience: normalizeExperience((extracted as any).experience),
    education: normalizeEducation((extracted as any).education),
  };
}

/**
 * The history a reviewer approved, out of the `approved_identity` blob.
 *
 * Empty and NOT "read live" when absent, for the same reason `approvedProjectsOf`
 * returns `[]`: a page approved before this feature existed has no approved history,
 * and showing unreviewed employment claims to a stranger would defeat the freeze.
 * The learner asks for review again and their history appears.
 */
export function approvedResumeHistoryOf(approved: unknown): ResumeHistory {
  const a: any = approved;
  if (!a || typeof a !== 'object') return { ...EMPTY_RESUME_HISTORY };
  return {
    experience: normalizeExperience(a.experience),
    education: normalizeEducation(a.education),
  };
}
