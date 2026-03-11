import Lead from '../models/Lead';

const EXECUTIVE_TITLE_PATTERN = /\b(vp|vice\s*president|director|head\s+of|cio|cto|cdo|chief|svp|evp)\b/i;
const LARGE_COMPANY_SIZES = ['250-999', '1000-4999', '5000+'];
const NEAR_TERM_TIMELINES = ['immediate', 'quarter'];

export interface ExecutiveScoreResult {
  score: number;
  tier: 'High Intent' | 'Medium' | 'Exploratory';
  stage: 'qualified' | 'new';
}

/**
 * Score an executive briefing lead independently of the general lead_score.
 * Persists executive_briefing_score and executive_interest_stage on the lead record.
 */
export async function scoreExecutiveBriefing(
  lead: Lead,
  timeline?: string,
): Promise<ExecutiveScoreResult> {
  let score = 0;

  // Large company (>200 employees) → +3
  if (lead.company_size && LARGE_COMPANY_SIZES.includes(lead.company_size)) {
    score += 3;
  }

  // Near-term timeline (within 90 days) → +3
  if (timeline && NEAR_TERM_TIMELINES.includes(timeline)) {
    score += 3;
  }

  // Corporate sponsorship interest → +5
  if (lead.corporate_sponsorship_interest) {
    score += 5;
  }

  // Executive title → +3
  const titleStr = lead.title || '';
  if (EXECUTIVE_TITLE_PATTERN.test(titleStr)) {
    score += 3;
  }

  const tier: ExecutiveScoreResult['tier'] =
    score > 7 ? 'High Intent' : score >= 4 ? 'Medium' : 'Exploratory';
  const stage: ExecutiveScoreResult['stage'] = score > 7 ? 'qualified' : 'new';

  // Persist to lead record (fire-and-forget)
  try {
    await lead.update({
      executive_briefing_score: score,
      executive_interest_stage: stage,
    } as any);
  } catch (err) {
    console.error('[ExecutiveScoring] Failed to persist score (non-blocking):', err);
  }

  return { score, tier, stage };
}
