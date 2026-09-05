import { getLatestStudentAssessment } from '../studentHealthAssessment';

const NOTABLE_STATUSES = new Set(['watch', 'at_risk', 'critical']);

/**
 * Reese Agentic AI Employee mission, Checkpoint D wiring — surfaces the
 * student's most recent structured health assessment (Capability 4) as a
 * short block in Reese's own mentor prompt, the same "wire it into Reese
 * first, small and fast" pattern Checkpoint C's highlights used.
 *
 * Read-only (getLatestStudentAssessment is a cheap DB lookup, no LLM call —
 * the actual assessment-generation trigger lives in
 * reeseReplyService.ts's fire-and-forget maybeRefreshStudentAssessment()
 * call, so this function never adds latency to a live reply).
 *
 * Deliberately silent for 'on_track' (nothing notable) and 'unknown'
 * (genuinely inconclusive — nothing actionable to surface, not a signal
 * either way) — matches this repo's established "silent when nothing
 * notable" convention (see reeseStudentSuccessHighlights.ts). Never repeats
 * the raw clinical status/root-cause labels as something Reese should say to
 * the student verbatim — this is situational context for Reese's own
 * reasoning, not a script.
 */
export async function getReeseHealthAssessmentHighlight(enrollmentId: string): Promise<string> {
  try {
    const assessment = await getLatestStudentAssessment(enrollmentId);
    if (!assessment || !NOTABLE_STATUSES.has(assessment.status)) return '';

    const cause = assessment.primaryRootCause ? ` (likely cause: ${assessment.primaryRootCause.replace(/_/g, ' ')})` : '';
    const lines = ['RECENT HEALTH ASSESSMENT (for your own awareness — do not recite this to the student):',
      `- Status: ${assessment.status.replace('_', ' ')}${cause}.`];
    if (assessment.recommendedIntervention) {
      lines.push(`- Suggested approach: ${assessment.recommendedIntervention}`);
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}
