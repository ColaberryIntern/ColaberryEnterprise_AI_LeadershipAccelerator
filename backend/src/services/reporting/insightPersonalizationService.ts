// ─── Insight Personalization Service ──────────────────────────────────────
// Learns which insights the user prefers and re-ranks accordingly.
// Handles negative feedback by triggering insight replacement.

import { UserInsightFeedback, InsightReplacement, ReportingInsight } from '../../models';
import { Op } from 'sequelize';

// ─── Feedback Recording ───────────────────────────────────────────────────

export async function recordFeedback(
  userId: string,
  insightId: string,
  feedbackType: 'useful' | 'not_useful' | 'favorite',
): Promise<any> {
  const [feedback, created] = await UserInsightFeedback.findOrCreate({
    where: { user_id: userId, insight_id: insightId },
    defaults: { user_id: userId, insight_id: insightId, feedback_type: feedbackType },
  });

  if (!created) {
    await feedback.update({ feedback_type: feedbackType });
  }

  // Handle negative feedback — trigger replacement
  if (feedbackType === 'not_useful') {
    await handleNegativeFeedback(userId, insightId, feedback.id);
  }

  return feedback;
}

// ─── User Preferences ────────────────────────────────────────────────────

export async function getUserPreferences(userId: string): Promise<{
  preferred_types: Record<string, number>;
  preferred_departments: Record<string, number>;
  preferred_severity: Record<string, number>;
  total_feedback: number;
}> {
  const feedback = await UserInsightFeedback.findAll({
    where: { user_id: userId },
    include: [{ model: ReportingInsight, as: 'insight' }],
  });

  const preferred_types: Record<string, number> = {};
  const preferred_departments: Record<string, number> = {};
  const preferred_severity: Record<string, number> = {};

  for (const f of feedback) {
    const insight = (f as any).insight;
    if (!insight) continue;

    const weight = f.feedback_type === 'favorite' ? 2 : f.feedback_type === 'useful' ? 1 : -1;

    const type = insight.insight_type;
    preferred_types[type] = (preferred_types[type] || 0) + weight;

    if (insight.department) {
      preferred_departments[insight.department] = (preferred_departments[insight.department] || 0) + weight;
    }

    preferred_severity[insight.alert_severity] = (preferred_severity[insight.alert_severity] || 0) + weight;
  }

  return {
    preferred_types,
    preferred_departments,
    preferred_severity,
    total_feedback: feedback.length,
  };
}

// ─── Personalized Ranking ─────────────────────────────────────────────────

export async function rankInsightsForUser(
  userId: string,
  insights: any[],
): Promise<any[]> {
  const prefs = await getUserPreferences(userId);
  if (prefs.total_feedback < 3) return insights; // Not enough data to personalize

  return [...insights].sort((a, b) => {
    const scoreA = getPersonalizationBoost(a, prefs);
    const scoreB = getPersonalizationBoost(b, prefs);
    return (b.final_score + scoreB) - (a.final_score + scoreA);
  });
}

function getPersonalizationBoost(
  insight: any,
  prefs: { preferred_types: Record<string, number>; preferred_departments: Record<string, number>; preferred_severity: Record<string, number> },
): number {
  let boost = 0;

  const typeWeight = prefs.preferred_types[insight.insight_type] || 0;
  boost += typeWeight * 0.05;

  if (insight.department) {
    const deptWeight = prefs.preferred_departments[insight.department] || 0;
    boost += deptWeight * 0.03;
  }

  const sevWeight = prefs.preferred_severity[insight.alert_severity] || 0;
  boost += sevWeight * 0.02;

  return Math.max(-0.2, Math.min(0.2, boost)); // Cap boost at ±0.2
}

// ─── Negative Feedback Handling ───────────────────────────────────────────

async function handleNegativeFeedback(userId: string, insightId: string, feedbackId: string): Promise<void> {
  // Dismiss the original insight
  await ReportingInsight.update({ status: 'dismissed' }, { where: { id: insightId } });

  // Check if a replacement already exists
  const existing = await InsightReplacement.findOne({ where: { original_insight_id: insightId } });
  if (existing) return;

  // Log the replacement request (actual replacement generation happens asynchronously via InsightDiscoveryAgent)
  await InsightReplacement.create({
    original_insight_id: insightId,
    replacement_insight_id: insightId, // Placeholder — will be updated when new insight is generated
    reason: 'User marked insight as not useful',
    triggered_by_feedback_id: feedbackId,
  });
}

// ─── Replacement History ──────────────────────────────────────────────────

export async function getReplacementHistory(insightId: string): Promise<any[]> {
  return InsightReplacement.findAll({
    where: {
      [Op.or]: [
        { original_insight_id: insightId },
        { replacement_insight_id: insightId },
      ],
    },
    order: [['created_at', 'DESC']],
  });
}
