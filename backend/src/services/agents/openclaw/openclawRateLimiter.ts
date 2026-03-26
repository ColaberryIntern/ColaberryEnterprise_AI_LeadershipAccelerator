/**
 * OpenClaw Rate Limiter — Phase 4
 *
 * Enforces the STRATEGY_RATE_LIMITS constants from openclawPlatformStrategy.ts.
 * Counts posted responses per platform per hour/day and blocks when exceeded.
 *
 * No new model — counts OpenclawResponse rows with posted_at filters.
 */

import { Op } from 'sequelize';
import { OpenclawResponse } from '../../../models';
import { getStrategy, STRATEGY_RATE_LIMITS } from './openclawPlatformStrategy';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RateLimitCheck {
  allowed: boolean;
  reason?: string;
  current_hour: number;
  current_day: number;
  limit_hour: number;
  limit_day: number;
}

// ─── Pure Function ───────────────────────────────────────────────────────────

/**
 * Check rate limit against known counts. Pure function for testability.
 */
export function checkRateLimit(
  platform: string,
  actionsThisHour: number,
  actionsThisDay: number,
): RateLimitCheck {
  const strategy = getStrategy(platform);
  const limits = STRATEGY_RATE_LIMITS[strategy];

  if (actionsThisHour >= limits.max_per_hour) {
    return {
      allowed: false,
      reason: `Hourly limit reached for ${platform} (${actionsThisHour}/${limits.max_per_hour})`,
      current_hour: actionsThisHour,
      current_day: actionsThisDay,
      limit_hour: limits.max_per_hour,
      limit_day: limits.max_per_day,
    };
  }

  if (actionsThisDay >= limits.max_per_day) {
    return {
      allowed: false,
      reason: `Daily limit reached for ${platform} (${actionsThisDay}/${limits.max_per_day})`,
      current_hour: actionsThisHour,
      current_day: actionsThisDay,
      limit_hour: limits.max_per_hour,
      limit_day: limits.max_per_day,
    };
  }

  return {
    allowed: true,
    current_hour: actionsThisHour,
    current_day: actionsThisDay,
    limit_hour: limits.max_per_hour,
    limit_day: limits.max_per_day,
  };
}

// ─── DB-Backed Functions ─────────────────────────────────────────────────────

/**
 * Get current post counts for a platform.
 */
export async function getRateCounts(platform: string): Promise<{ hour: number; day: number }> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600000);
  const oneDayAgo = new Date(now.getTime() - 86400000);

  const [hour, day] = await Promise.all([
    OpenclawResponse.count({
      where: {
        platform,
        post_status: 'posted',
        posted_at: { [Op.gte]: oneHourAgo },
      } as any,
    }),
    OpenclawResponse.count({
      where: {
        platform,
        post_status: 'posted',
        posted_at: { [Op.gte]: oneDayAgo },
      } as any,
    }),
  ]);

  return { hour, day };
}

/**
 * Check if a platform is currently rate-limited.
 */
export async function isRateLimited(platform: string): Promise<RateLimitCheck> {
  const counts = await getRateCounts(platform);
  return checkRateLimit(platform, counts.hour, counts.day);
}

/**
 * Get rate limit status for all active platforms (for dashboard).
 */
export async function getAllRateCounts(): Promise<Array<{
  platform: string;
  hour: number;
  day: number;
  limit_hour: number;
  limit_day: number;
  allowed: boolean;
}>> {
  const platforms = [
    'reddit', 'hackernews', 'devto', 'hashnode', 'discourse',
    'twitter', 'bluesky', 'youtube', 'producthunt', 'medium',
    'quora', 'facebook_groups', 'linkedin_comments', 'linkedin',
  ];

  const results = await Promise.all(
    platforms.map(async (platform) => {
      const counts = await getRateCounts(platform);
      const check = checkRateLimit(platform, counts.hour, counts.day);
      return {
        platform,
        hour: counts.hour,
        day: counts.day,
        limit_hour: check.limit_hour,
        limit_day: check.limit_day,
        allowed: check.allowed,
      };
    }),
  );

  return results;
}
