/**
 * ambientTypeExposureService — per-enrollment, distinct-items-ever-shown counts
 * for each ambient provider (blog/podcast/testimonial), read from the same
 * `*_views` ledger tables `ambientPool.ts` already writes to. Backs Feed
 * Control's ambient-provider suppression (`env.feedControlAmbientSuppressionEnabled`,
 * see `todayFeedComposer.ts`): a provider's `feed_frequency_cap` (set via the
 * Feed Control board) can only suppress it once we know how many distinct
 * items a student has already been shown.
 *
 * "Cap" here means lifetime distinct items shown, matching the Feed Control
 * board's own field copy ("max times a student sees it") — a plain
 * `COUNT(*)` on the ledger table, one row per (enrollment, item).
 *
 * Fail-soft, matching capeAiPulseExposureService.ts/feedTypeExposureService.ts:
 * a query error for ONE provider degrades that provider's count to 0 (never
 * suppresses on missing data) without blocking the other two providers.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import type { AmbientProviderSlug } from './ambientPool';

async function countDistinct(table: string, provider: AmbientProviderSlug, enrollmentId: string): Promise<number> {
  try {
    const rows = await sequelize.query<{ n: string | number }>(
      `SELECT COUNT(*)::int AS n FROM ${table} WHERE enrollment_id = :eid`,
      { replacements: { eid: enrollmentId }, type: QueryTypes.SELECT },
    );
    return Number(rows[0]?.n) || 0;
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'ambient_type_exposure_read_failed',
      error_class: err?.name || 'Error',
      outcome: 'failure',
      context: { enrollment_id: enrollmentId, provider, table, message: err?.message },
    }));
    return 0; // fail-soft: this provider reads as never-shown -> never wrongly suppressed
  }
}

/** Distinct blog/podcast/testimonial items ever shown to this enrollment. Each
 *  provider's query is isolated -- a failure on one never zeroes the others. */
export async function getAmbientDistinctSeenCounts(enrollmentId: string): Promise<Record<AmbientProviderSlug, number>> {
  const [blog, podcast, testimonial] = await Promise.all([
    countDistinct('blog_post_views', 'blog', enrollmentId),
    countDistinct('podcast_views', 'podcast', enrollmentId),
    countDistinct('network_video_views', 'testimonial', enrollmentId),
  ]);
  return { blog, podcast, testimonial };
}
