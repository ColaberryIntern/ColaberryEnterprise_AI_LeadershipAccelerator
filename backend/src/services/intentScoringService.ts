import { Op, literal } from 'sequelize';
import { BehavioralSignal, IntentScore, Visitor } from '../models';
import { logAgentExecution } from './governanceService';
import { botExclusionSql, isBotUserAgent, notAutomatedSessionSql } from './visitorBotDetection';

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
  const startTime = Date.now();
  const visitor = await Visitor.findByPk(visitorId);
  if (!visitor) return null;

  // A crawler is not a lead. Every one of the twenty automated sessions on the
  // live dashboard on 2026-09-04 carried a score of 100 "Very High" — the crawl
  // was walking hundreds of pages, which is exactly what the model rewards — and
  // those scores feed the high-intent list and the behavioural trigger campaigns.
  // So the pollution was not cosmetic: it was queueing outreach at machines.
  //
  // Declining to score is the right move rather than scoring and filtering later:
  // an unwritten row cannot leak into a consumer that forgot to filter.
  if (isBotUserAgent((visitor as any).user_agent)) {
    return null;
  }

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
    logAgentExecution('intent_scorer', 'success', Date.now() - startTime).catch(() => {});
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

  const result = await IntentScore.create({
    visitor_id: visitorId,
    lead_id: visitor.lead_id || null,
    score: finalScore,
    score_components: components,
    intent_level: intentLevel,
    signals_count: signals.length,
    last_signal_at: lastSignalAt,
    score_updated_at: now,
  } as any);

  // Governance logging (fire-and-forget)
  logAgentExecution('intent_scorer', 'success', Date.now() - startTime).catch(() => {});

  return result;
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
  // Historical rows written before bots were excluded from scoring are still in
  // the table, so the read filters as well as the write. Belt and braces on
  // purpose: this list is what a human acts on.
  return IntentScore.findAll({
    where: {
      score: { [Op.gte]: threshold },
      [Op.and]: [
        literal(
          `EXISTS (SELECT 1 FROM "visitors" bv WHERE bv."id" = "IntentScore"."visitor_id" AND ${botExclusionSql('bv."user_agent"')})`
        ),
        // The user-agent rule alone was not enough here, and this list is where
        // it mattered most. 42 of 619 intent rows are backed by a crawler that
        // presents a clean browser string — and because the model rewards volume,
        // those crawlers score 100 and sit at the TOP of the list, which is the
        // only part of it anyone reads. A visitor with any session that looks
        // automated is excluded outright.
        literal(
          `NOT EXISTS (SELECT 1 FROM "visitor_sessions" avs WHERE avs."visitor_id" = "IntentScore"."visitor_id" ` +
            `AND NOT (${notAutomatedSessionSql('avs."pageview_count"', 'avs."duration_seconds"')}))`
        ),
      ],
    },
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
