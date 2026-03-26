/**
 * OpenClaw Signal Scaler — Phase 4
 *
 * Feeds learning data back into signal scanning to dynamically
 * weight keywords and adjust scan frequency per platform.
 *
 * Pure functions for testability + DB-backed aggregation.
 */

import { OpenclawLearning } from '../../../models';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScaledKeywords {
  primary: string[];
  secondary: string[];
  weights: Record<string, number>;
}

export interface PlatformScanPriority {
  platform: string;
  scan_frequency_multiplier: number;
  reason: string;
}

// ─── Pure Functions ──────────────────────────────────────────────────────────

/**
 * Rank keywords by topic_performance learnings.
 * Top performers become primary; base keywords become secondary.
 */
export function computeKeywordPriority(
  topicLearnings: Array<{ metric_key: string; metric_value: number; sample_size: number; confidence: number }>,
  baseKeywords: string[],
): ScaledKeywords {
  const minSampleSize = 3;
  const minConfidence = 0.3;

  // Filter to learnings with sufficient data
  const qualified = topicLearnings.filter(
    l => l.sample_size >= minSampleSize && l.confidence >= minConfidence,
  );

  // Sort by metric_value descending (higher engagement = better keyword)
  const sorted = [...qualified].sort((a, b) => b.metric_value - a.metric_value);

  // Top performers as primary keywords (max 10)
  const primary = sorted.slice(0, 10).map(l => l.metric_key);

  // Base keywords as secondary (excluding any that are already primary)
  const primarySet = new Set(primary.map(k => k.toLowerCase()));
  const secondary = baseKeywords.filter(k => !primarySet.has(k.toLowerCase()));

  // Build weight map
  const weights: Record<string, number> = {};
  for (const l of sorted) {
    weights[l.metric_key] = l.metric_value;
  }
  for (const k of baseKeywords) {
    if (!(k in weights)) {
      weights[k] = 1; // default weight for base keywords
    }
  }

  return { primary, secondary, weights };
}

/**
 * Compute scan frequency multiplier per platform based on engagement data.
 * High-engagement platforms scan more; low-engagement scan less.
 */
export function computePlatformScanPriority(
  platformLearnings: Array<{ metric_key: string; metric_value: number; sample_size: number }>,
  platforms: string[],
): PlatformScanPriority[] {
  if (platformLearnings.length === 0) {
    return platforms.map(p => ({
      platform: p,
      scan_frequency_multiplier: 1.0,
      reason: 'No learning data available — default frequency',
    }));
  }

  // Calculate average engagement across all platforms
  const totalEngagement = platformLearnings.reduce((sum, l) => sum + l.metric_value, 0);
  const avgEngagement = totalEngagement / platformLearnings.length;

  // Build lookup
  const learningMap = new Map(platformLearnings.map(l => [l.metric_key, l]));

  return platforms.map(platform => {
    const learning = learningMap.get(platform);

    if (!learning || learning.sample_size < 3) {
      return {
        platform,
        scan_frequency_multiplier: 1.0,
        reason: 'Insufficient data — default frequency',
      };
    }

    // Compute multiplier: ratio of platform engagement to average
    // Capped at [0.5, 2.0]
    let multiplier = avgEngagement > 0 ? learning.metric_value / avgEngagement : 1.0;
    multiplier = Math.max(0.5, Math.min(2.0, multiplier));
    multiplier = Math.round(multiplier * 100) / 100;

    let reason: string;
    if (multiplier > 1.2) {
      reason = `High engagement (${learning.metric_value.toFixed(1)} avg) — increased scan frequency`;
    } else if (multiplier < 0.8) {
      reason = `Low engagement (${learning.metric_value.toFixed(1)} avg) — reduced scan frequency`;
    } else {
      reason = `Average engagement (${learning.metric_value.toFixed(1)} avg) — standard frequency`;
    }

    return { platform, scan_frequency_multiplier: multiplier, reason };
  });
}

// ─── DB-Backed Function ──────────────────────────────────────────────────────

/**
 * Query learnings and return optimized scan configuration.
 */
export async function getOptimizedScanConfig(
  baseKeywords: string[],
  platforms: string[],
): Promise<{ keywords: ScaledKeywords; platformPriorities: PlatformScanPriority[] }> {
  const [topicLearnings, platformLearnings] = await Promise.all([
    OpenclawLearning.findAll({
      where: { learning_type: 'topic_performance' as any },
      attributes: ['metric_key', 'metric_value', 'sample_size', 'confidence'],
      raw: true,
    }),
    OpenclawLearning.findAll({
      where: { learning_type: 'platform_timing' as any },
      attributes: ['metric_key', 'metric_value', 'sample_size'],
      raw: true,
    }),
  ]);

  const keywords = computeKeywordPriority(topicLearnings as any, baseKeywords);
  const platformPriorities = computePlatformScanPriority(platformLearnings as any, platforms);

  return { keywords, platformPriorities };
}
