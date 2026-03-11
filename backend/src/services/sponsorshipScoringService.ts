import Lead from '../models/Lead';
import StrategyCall from '../models/StrategyCall';

const SPONSOR_TITLE_PATTERN = /\b(cfo|coo|cio|cto|cdo|chief|svp|evp|vp)\b/i;
const LARGE_COMPANY_SIZES = ['250-999', '1000-4999', '5000+'];

export interface SponsorshipScoreResult {
  score: number;
  tier: 'Executive Sponsor Likely' | 'Needs Sponsor Education' | 'Informational';
  stage: 'sponsor_identified' | 'approved' | 'evaluating';
}

/**
 * Score a lead's sponsorship readiness.
 * Builds on the executive_briefing_score and adds sponsorship-specific signals.
 * Persists sponsorship_readiness_score and sponsorship_stage to the lead record.
 */
export async function scoreSponsorshipReadiness(lead: Lead): Promise<SponsorshipScoreResult> {
  let score = lead.executive_briefing_score || 0;

  // Corporate sponsorship interest → +5
  if (lead.corporate_sponsorship_interest) {
    score += 5;
  }

  // C-suite / senior executive title → +3
  const titleStr = lead.title || '';
  if (SPONSOR_TITLE_PATTERN.test(titleStr)) {
    score += 3;
  }

  // Large company (>250 employees) → +3
  if (lead.company_size && LARGE_COMPANY_SIZES.includes(lead.company_size)) {
    score += 3;
  }

  // Near-term timeline (check message field for timeline info) → +3
  const messageStr = lead.message || '';
  if (/timeline:\s*(immediate|quarter|next 30 days|this quarter)/i.test(messageStr)) {
    score += 3;
  }

  // Strategy call completed → +2
  let callCompleted = false;
  try {
    const completedCall = await StrategyCall.findOne({
      where: { lead_id: lead.id, status: 'completed' },
    });
    if (completedCall) {
      score += 2;
      callCompleted = true;
    }
  } catch {
    // Non-blocking — skip call check if model query fails
  }

  const tier: SponsorshipScoreResult['tier'] =
    score > 12 ? 'Executive Sponsor Likely' : score >= 7 ? 'Needs Sponsor Education' : 'Informational';

  let stage: SponsorshipScoreResult['stage'] = 'evaluating';
  if (score > 12 && callCompleted) {
    stage = 'approved';
  } else if (score > 12) {
    stage = 'sponsor_identified';
  }

  // Persist to lead record (fire-and-forget)
  try {
    await lead.update({
      sponsorship_readiness_score: score,
      sponsorship_stage: stage,
    } as any);
  } catch (err) {
    console.error('[SponsorshipScoring] Failed to persist score (non-blocking):', err);
  }

  return { score, tier, stage };
}
