import { Op } from 'sequelize';
import { BehavioralSignal, IntentScore, Visitor } from '../models';

/**
 * Time-decay half-life in days. A signal loses half its weight every 7 days.
 */
const DECAY_HALF_LIFE_DAYS = 7;

/**
 * Intent level thresholds (0-100 score).
 */
const INTENT_LEVELS = [
  { min: 0, max: 19, level: 'low' },
  { min: 20, max: 44, level: 'medium' },
  { min: 45, max: 69, level: 'high' },
  { min: 70, max: 100, level: 'very_high' },
] as const;

/**
 * Compute the time-decay multiplier for a signal based on age.
 * Uses exponential decay: weight = 2^(-days/halfLife)
 */
function computeDecayMultiplier(detectedAt: Date, now: Date): number {
  const ageMs = now.getTime() - detectedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.pow(2, -ageDays / DECAY_HALF_LIFE_DAYS);
}

/**
 * Determine intent level from a numeric score.
 */
function getIntentLevel(score: number): string {
  for (const level of INTENT_LEVELS) {
    if (score >= level.min && score <= level.max) return level.level;
  }
  return 'low';
}

/**
 * Compute and upsert the intent score for a single visitor.
 * Aggregates all behavioral signals with time-decay weighting.
 * Returns the updated IntentScore record.
 */
export async function computeIntentScore(visitorId: string): Promise<IntentScore | null> {
  const visitor = await Visitor.findByPk(visitorId);
  if (!visitor) return null;

  const now = new Date();

  // Fetch all signals for this visitor
  const signals = await BehavioralSignal.findAll({
    where: { visitor_id: visitorId },
    order: [['detected_at', 'DESC']],
  });

  if (signals.length === 0) {
    // No signals → score is 0, but still create/update the record
    const [intentScore] = await IntentScore.findOrCreate({
      where: { visitor_id: visitorId },
      defaults: {
        visitor_id: visitorId,
        lead_id: visitor.lead_id || null,
        score: 0,
        score_components: {},
        intent_level: 'low',
        signals_count: 0,
        last_signal_at: null,
        score_updated_at: now,
      } as any,
    });

    if (intentScore.score !== 0) {
      await intentScore.update({
        score: 0,
        score_components: {},
        intent_level: 'low',
        signals_count: 0,
        score_updated_at: now,
        updated_at: now,
      });
    }
    return intentScore;
  }

  // Compute decayed score per signal type
  const components: Record<string, {
    raw_total: number;
    decayed_total: number;
    count: number;
    latest_at: string;
  }> = {};

  let totalDecayedScore = 0;

  for (const signal of signals) {
    const decay = computeDecayMultiplier(signal.detected_at, now);
    const decayedStrength = signal.signal_strength * decay;

    if (!components[signal.signal_type]) {
      components[signal.signal_type] = {
        raw_total: 0,
        decayed_total: 0,
        count: 0,
        latest_at: signal.detected_at.toISOString(),
      };
    }

    components[signal.signal_type].raw_total += signal.signal_strength;
    components[signal.signal_type].decayed_total += decayedStrength;
    components[signal.signal_type].count++;

    totalDecayedScore += decayedStrength;
  }

  // Cap the score at 100
  const finalScore = Math.min(100, Math.round(totalDecayedScore));
  const intentLevel = getIntentLevel(finalScore);
  const lastSignalAt = signals[0].detected_at;

  // Upsert intent score
  const existing = await IntentScore.findOne({ where: { visitor_id: visitorId } });

  if (existing) {
    await existing.update({
      lead_id: visitor.lead_id || null,
      score: finalScore,
      score_components: components,
      intent_level: intentLevel,
      signals_count: signals.length,
      last_signal_at: lastSignalAt,
      score_updated_at: now,
      updated_at: now,
    });
    return existing;
  }

  return IntentScore.create({
    visitor_id: visitorId,
    lead_id: visitor.lead_id || null,
    score: finalScore,
    score_components: components,
    intent_level: intentLevel,
    signals_count: signals.length,
    last_signal_at: lastSignalAt,
    score_updated_at: now,
  } as any);
}

/**
 * Recompute intent scores for all visitors who have recent signals.
 * Called by the scheduler periodically.
 * Returns the count of visitors scored.
 */
export async function recomputeRecentIntentScores(): Promise<number> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Find all visitor IDs with signals in the last 24 hours
  const recentSignals = await BehavioralSignal.findAll({
    where: { detected_at: { [Op.gte]: oneDayAgo } },
    attributes: ['visitor_id'],
    group: ['visitor_id'],
  });

  const visitorIds = recentSignals.map(s => s.visitor_id);
  let scored = 0;

  for (const visitorId of visitorIds) {
    await computeIntentScore(visitorId);
    scored++;
  }

  return scored;
}

/**
 * Get high-intent visitors (score >= threshold).
 * Returns visitor IDs with scores, sorted by score descending.
 */
export async function getHighIntentVisitors(
  threshold = 45,
  limit = 50
): Promise<IntentScore[]> {
  return IntentScore.findAll({
    where: { score: { [Op.gte]: threshold } },
    order: [['score', 'DESC']],
    limit,
    include: [
      { model: Visitor, as: 'visitor', attributes: ['id', 'fingerprint', 'lead_id', 'last_seen_at', 'device_type', 'browser'] },
    ],
  });
}

/**
 * Get the intent score for a specific visitor.
 */
export async function getIntentScoreForVisitor(visitorId: string): Promise<IntentScore | null> {
  return IntentScore.findOne({
    where: { visitor_id: visitorId },
  });
}

/**
 * Get intent level distribution (how many visitors at each level).
 */
export async function getIntentDistribution(): Promise<Record<string, number>> {
  const scores = await IntentScore.findAll({
    attributes: ['intent_level'],
  });

  const distribution: Record<string, number> = {
    low: 0,
    medium: 0,
    high: 0,
    very_high: 0,
  };

  for (const score of scores) {
    if (distribution[score.intent_level] !== undefined) {
      distribution[score.intent_level]++;
    }
  }

  return distribution;
}
